import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prisma} from '@roxstock/shared/lib/prisma';
import {buildApp} from '../app.js';
import {passwordHash,randomToken,tokenHash} from './crypto.js';
test('real DB: isolated users, cookie sessions, CSRF, reset revocation and one-time tokens',{skip:process.env.AUTH_INTEGRATION!=='1'},async()=>{
 const target=new URL(process.env.DATABASE_URL!);assert.ok(['127.0.0.1','localhost'].includes(target.hostname)&&(target.pathname==='/roxstock_dev'||process.env.AUTH_INTEGRATION_DATABASE_CONFIRM==='isolated'));
 process.env.AUTH_PUBLIC_ORIGIN='http://127.0.0.1:3000';delete process.env.SMTP_PASSWORD;
 const app=buildApp(),suffix=randomToken().slice(0,10),password='Ab12'+randomToken().replace(/[^A-Za-z0-9]/g,'').slice(0,12),encoded=await passwordHash(password);
 const inject=app.inject.bind(app);
 app.inject=((options:any)=>inject({...options,remoteAddress:`198.18.${suffix.charCodeAt(0)}.${suffix.charCodeAt(1)}`})) as typeof app.inject;
 const users=await Promise.all(['a','b'].map(letter=>prisma.authUser.create({data:{email:`auth-${suffix}-${letter}@example.invalid`,passwordHash:encoded,verifiedAt:new Date()}})));
 const accounts=await Promise.all(users.map(user=>prisma.account.create({data:{userId:user.id,name:'isolated-test',brokerName:'AUTH_TEST',accountNumber:suffix+'shared',normalizedAccountNumber:suffix+'shared'}})));
 const security=await prisma.security.findFirst({select:{id:true}});assert.ok(security,'An existing shared security is required for isolated Lot fixtures.');
 const lots=await Promise.all(accounts.map(account=>prisma.buyTrade.create({data:{accountId:account.id,securityId:security.id,boughtAt:new Date('2024-01-01'),quantity:10,unitPrice:100}})));
 const sells=await Promise.all(lots.map(lot=>prisma.sellTrade.create({data:{buyTradeId:lot.id,soldAt:new Date('2024-02-01'),quantity:2,unitPrice:120}})));
 const headers={origin:process.env.AUTH_PUBLIC_ORIGIN,'content-type':'application/json'};
 const login=async(index:number,remember=false)=>{
   const result=await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{email:users[index]!.email,password,remember}});assert.equal(result.statusCode,200,result.body);
   const set=result.headers['set-cookie'] as string[];assert.ok(set[0]!.includes('HttpOnly'));assert.equal(set[0]!.includes('Max-Age'),remember);
   const cookie=set.map(v=>v.split(';')[0]).join('; '),csrf=/rox_csrf=([^;]+)/.exec(cookie)![1]!;
   return {...headers,cookie,'x-csrf-token':csrf};
 };
 let assertions=0;const check=(actual:unknown,expected:unknown)=>{assert.equal(actual,expected);assertions++;};
 try{
  check((await app.inject({url:'/api/accounts'})).statusCode,401);
  let a=await login(0,true);const b=await login(1);
  const empty=await prisma.account.create({data:{userId:users[0]!.id,name:'delete-test',brokerName:'AUTH_TEST',normalizedAccountNumber:suffix+'delete'}});
  check((await app.inject({method:'DELETE',url:'/api/accounts/'+empty.id,headers:a,payload:{}})).statusCode,200);
  check((await app.inject({url:'/api/accounts',headers:{...a,'x-auth-user':String(users[1]!.id)}})).statusCode,409);
  for(const [owner,other] of [[a,1],[b,0]] as const){
   const list=await app.inject({url:'/api/accounts',headers:owner});check(list.statusCode,200);check(list.json().data.length,1);check(list.json().data[0].id,String(accounts[1-other]!.id));
   const holding=await app.inject({url:`/api/accounts/${accounts[1-other]!.id}/holdings`,headers:owner});check(holding.statusCode,200);check(holding.json().data.length,1);check(Number(holding.json().data[0].quantity),8);
   const ownLot=await app.inject({url:`/api/buy-trades/${lots[1-other]!.id}`,headers:owner});check(ownLot.statusCode,200);check(ownLot.json().data.sellTrades.length,1);
   const otherId=String(accounts[other]!.id);
   for(const path of ['holdings','trades','buy-lots','cash-transactions','asset-history','compound-plans','stock-news','data-state'])check((await app.inject({url:`/api/accounts/${otherId}/${path}`,headers:owner})).statusCode,404);
   check((await app.inject({method:'PATCH',url:`/api/accounts/${otherId}`,headers:owner,payload:{name:'forbidden'}})).statusCode,404);
   check((await app.inject({method:'DELETE',url:`/api/accounts/${otherId}`,headers:owner,payload:{}})).statusCode,404);
   check((await app.inject({url:'/api/collection/monitoring',headers:owner})).statusCode,403);
   check((await app.inject({url:'/api/collection/dart/tasks?status=EXCLUDED&scope=priority',headers:owner})).statusCode,403);
   for(const [kind,identifier] of [['buy-trades',lots[other]!.id],['sell-trades',sells[other]!.id]] as const){
    for(const method of ['GET','PATCH','DELETE'] as const)check((await app.inject({method,url:`/api/${kind}/${identifier}`,headers:owner,...(method==='GET'?{}:{payload:{}})})).statusCode,404);
   }
   check((await app.inject({method:'POST',url:'/api/sell-trades',headers:owner,payload:{buyTradeId:String(lots[other]!.id)}})).statusCode,404);
   check((await app.inject({method:'POST',url:'/api/pages/read',headers:owner,payload:{paths:[`/accounts/${otherId}/holdings`]}})).json().data[0].status,404);
   check((await app.inject({method:'POST',url:'/api/pages/read',headers:owner,payload:{paths:['/accounts']}})).json().data[0].body.data[0].id,String(accounts[1-other]!.id));
  }
  check((await app.inject({method:'POST',url:'/api/auth/logout',headers:{...a,'x-csrf-token':'wrong'},payload:{}})).statusCode,403);
  check((await app.inject({method:'POST',url:'/api/auth/logout',headers:{...a,origin:'https://attacker.invalid'},payload:{}})).statusCode,403);
  const simultaneous=await Promise.all([1,2].map(()=>app.inject({method:'POST',url:'/api/auth/refresh',headers:a,payload:{}})));
  simultaneous.forEach(response=>check(response.statusCode,200));
  const renewed=simultaneous.find(response=>response.headers['set-cookie'])!;assert.ok(renewed);
  const latestCookie=(renewed.headers['set-cookie'] as string[]).map(value=>value.split(';')[0]).join('; ');
  check((await app.inject({url:'/api/auth/me',headers:a})).statusCode,200);
  const restarted=buildApp();try{check((await restarted.inject({url:'/api/auth/me',headers:{...a,cookie:latestCookie}})).statusCode,200);}finally{await restarted.close();}
  // Stable sliding renewal: apply responses in reverse order, then restart the API.
  check(latestCookie,a.cookie);
  const currentToken=/rox_session=([^;]+)/.exec(a.cookie)![1]!,sessionId=currentToken.split('.')[0]!;
  const oldToken=sessionId+'.'+randomToken();
  await prisma.authRetiredToken.create({data:{tokenHash:tokenHash(oldToken),sessionId,graceUntil:new Date(Date.now()-1000)}});
  const oldCookie=a.cookie.replace(currentToken,oldToken);
  const stale=await app.inject({url:'/api/auth/me',headers:{...a,cookie:oldCookie}});check(stale.statusCode,401);check(stale.json().error.code,'AUTH_TOKEN_RETIRED');
  check((await prisma.authSession.findUniqueOrThrow({where:{id:sessionId}})).revokedAt,null);
  check((await app.inject({url:'/api/auth/me',headers:a})).statusCode,200);
  await prisma.authSession.update({where:{id:sessionId},data:{expiresAt:new Date(Date.now()+60000)}});
  check((await app.inject({url:'/api/auth/me',headers:a})).statusCode,200);
  assert.ok(+(await prisma.authSession.findUniqueOrThrow({where:{id:sessionId}})).expiresAt>Date.now()+89*86400000);
  await prisma.authSession.update({where:{id:sessionId},data:{expiresAt:new Date(Date.now()-1000)}});
  const expiredSession=await app.inject({url:'/api/auth/me',headers:a});check(expiredSession.statusCode,401);check(expiredSession.json().error.code,'AUTH_SESSION_EXPIRED');
  a=await login(0,true);
  const created=await app.inject({method:'POST',url:'/api/accounts',headers:b,payload:{name:'new-test',brokerName:'AUTH_TEST',accountNumber:suffix+'new'}});check(created.statusCode,201);
  check((await app.inject({method:'POST',url:'/api/accounts',headers:b,payload:{name:'duplicate-test',brokerName:'AUTH_TEST',accountNumber:suffix+'new'}})).statusCode,409);
  const newId=BigInt(created.json().data.id);check((await prisma.account.findUniqueOrThrow({where:{id:newId}})).userId,users[1]!.id);await prisma.account.delete({where:{id:newId}});
  const stored=await prisma.authSession.findMany({where:{userId:users[0]!.id}});assert.ok(!stored[0]!.tokenHash.includes(a.cookie));
  const token=randomToken();await prisma.authEmailToken.create({data:{userId:users[0]!.id,purpose:'RESET',tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+60000)}});
  const changed='Cd34'+randomToken().replace(/[^A-Za-z0-9]/g,'').slice(0,12);check((await app.inject({method:'POST',url:'/api/auth/reset',headers,payload:{token,password:changed,confirmation:changed}})).statusCode,200);
  check((await app.inject({url:'/api/auth/me',headers:a})).statusCode,401);
  check((await app.inject({method:'POST',url:'/api/auth/reset',headers,payload:{token,password:changed,confirmation:changed}})).statusCode,410);
  const expired=randomToken();await prisma.authEmailToken.create({data:{userId:users[1]!.id,purpose:'RESET',tokenHash:tokenHash(expired),expiresAt:new Date(Date.now()-1000)}});
  check((await app.inject({method:'POST',url:'/api/auth/reset',headers,payload:{token:expired,password:changed,confirmation:changed}})).statusCode,410);
  check((await app.inject({method:'POST',url:'/api/auth/forgot',headers,payload:{email:users[0]!.email}})).statusCode,503);
  check((await app.inject({method:'POST',url:'/api/auth/forgot',headers,payload:{email:`unknown-${suffix}@example.invalid`}})).statusCode,503);
  const verify=randomToken();await prisma.authEmailToken.create({data:{userId:users[1]!.id,purpose:'VERIFY',tokenHash:tokenHash(verify),expiresAt:new Date(Date.now()+60000)}});
  check((await app.inject({method:'POST',url:'/api/auth/verify',headers,payload:{token:verify,password:'incorrect registration password'}})).statusCode,400);
  check((await app.inject({method:'POST',url:'/api/auth/verify',headers,payload:{token:verify,password}})).statusCode,200);
  check((await app.inject({method:'POST',url:'/api/auth/verify',headers,payload:{token:verify,password}})).statusCode,410);
  check((await app.inject({method:'POST',url:'/api/auth/register',headers,payload:{email:users[1]!.email,password,confirmation:password}})).statusCode,409);
  const signupEmail=`signup-${suffix}@example.invalid`;
  try{
   check((await app.inject({method:'POST',url:'/api/auth/register',headers,payload:{email:signupEmail,password,confirmation:password}})).statusCode,503);
   const signup=await prisma.authUser.findUniqueOrThrow({where:{email:signupEmail}});
   check(signup.role,'USER');check(signup.verifiedAt,null);
   check((await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{email:signupEmail,password}})).statusCode,401);
   check((await app.inject({method:'POST',url:'/api/auth/register',headers,payload:{email:signupEmail,password,confirmation:password}})).statusCode,409);
  }finally{await prisma.authUser.deleteMany({where:{email:signupEmail}});}
  check((await app.inject({method:'POST',url:'/api/auth/logout',headers:b,payload:{}})).statusCode,200);
  check((await app.inject({url:'/api/auth/me',headers:b})).statusCode,401);
  await prisma.authUser.update({where:{id:users[1]!.id},data:{mustChangePassword:false,temporaryExpiresAt:new Date(Date.now()-1000),temporaryUsedAt:null}});
  check((await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{email:users[1]!.email,password}})).statusCode,401);
  await prisma.authUser.update({where:{id:users[1]!.id},data:{temporaryExpiresAt:new Date(Date.now()+24*3600000)}});
  const partial=await login(1);
  check((await app.inject({url:'/api/accounts',headers:partial})).statusCode,200);
  check((await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{email:users[1]!.email,password}})).statusCode,200);
  await prisma.authUser.update({where:{id:users[1]!.id},data:{temporaryExpiresAt:new Date(Date.now()-1000)}});
  check((await app.inject({url:'/api/auth/me',headers:partial})).statusCode,401);
  await prisma.authUser.update({where:{id:users[1]!.id},data:{temporaryExpiresAt:new Date(Date.now()+24*3600000)}});
  const replacement='Ef56'+randomToken().replace(/[^A-Za-z0-9]/g,'').slice(0,12);check((await app.inject({method:'POST',url:'/api/auth/change-password',headers:partial,payload:{currentPassword:password,password:replacement,confirmation:replacement}})).statusCode,200);
  check((await app.inject({url:'/api/auth/me',headers:partial})).statusCode,401);
  check((await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{email:users[1]!.email,password:replacement}})).statusCode,200);
  assert.ok(assertions>=40);
  console.log(`AUTH_SECURITY_ASSERTIONS=${assertions}`);
 }finally{
  await prisma.sellTrade.deleteMany({where:{buyTradeId:{in:lots.map(lot=>lot.id)}}});
  await prisma.buyTrade.deleteMany({where:{id:{in:lots.map(lot=>lot.id)}}});
  await prisma.account.deleteMany({where:{brokerName:'AUTH_TEST',normalizedAccountNumber:{startsWith:suffix}}});
  await prisma.authUser.deleteMany({where:{id:{in:users.map(u=>u.id)}}});await app.close();await prisma.$disconnect();
 }
});
