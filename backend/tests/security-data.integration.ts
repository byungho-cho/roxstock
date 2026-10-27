import test from 'node:test';import assert from 'node:assert/strict';
import {PrismaClient} from '@roxstock/shared/prisma';
import {prisma} from '@roxstock/shared/lib/prisma';
import {completedQuarters} from '@roxstock/shared/domain/security-data';
import {buildApp} from '../src/app.js';
import {passwordHash,randomToken} from '../src/auth/crypto.js';
test('security data: real sessions, optimistic single-field edits, manual protection, audit, public/cache consistency, rollback and durable receipt checkpoint',async()=>{
 const url=new URL(process.env.DATABASE_URL!);assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Isolated DB only');
 process.env.AUTH_PUBLIC_ORIGIN='http://127.0.0.1:3000';const raw=new PrismaClient(),app=buildApp(),suffix=randomToken().slice(0,8),password='Aa12'+randomToken().replace(/[^A-Za-z0-9]/g,'').slice(0,12),hash=await passwordHash(password);
 const users=await Promise.all(['ADMIN','USER'].map(role=>raw.authUser.create({data:{email:`security-data-${suffix}-${role}@example.invalid`,passwordHash:hash,verifiedAt:new Date(),role:role as any}})));
 const security=await raw.security.create({data:{symbol:'T33001',name:'Security data isolated '+suffix,marketType:'KOSPI',securityType:'STOCK'}}),q=completedQuarters().at(-1)!,period=q.periodType as 'ANNUAL'|'Q1'|'Q2'|'Q3',end=new Date(Date.UTC(q.year,q.quarter*3,0));
 const path=`/api/security-data/quarters/${q.year}/${q.quarter}/${security.id}`;
 const login=async(user:typeof users[number])=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:process.env.AUTH_PUBLIC_ORIGIN},payload:{email:user.email,password}});assert.equal(r.statusCode,200,r.body);const cookie=(r.headers['set-cookie'] as string[]).map(v=>v.split(';')[0]).join('; ');return {cookie,origin:process.env.AUTH_PUBLIC_ORIGIN!,'x-csrf-token':/rox_csrf=([^;]+)/.exec(cookie)![1]!};};
 try{
  assert.equal((await app.inject(path)).statusCode,401);const admin=await login(users[0]!),user=await login(users[1]!);
  assert.equal((await app.inject({url:path,headers:user})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/pages/read',headers:user,payload:{paths:['/security-data/quarters']}})).statusCode,400);
  let detail=(await app.inject({url:path,headers:admin})).json().data;assert.equal(detail.fields.length,26);assert.equal(detail.basis,null);
  const basis={receiptNo:null,fsDivision:'CFS',periodEnd:end.toISOString().slice(0,10),currency:'KRW',amountMultiplier:'1',shareClass:'COMMON',kind:'ACTUAL'};
  const patch=(field:string,value:string,expectedValue:unknown,b=detail.basis??basis)=>app.inject({method:'PATCH',url:path,headers:admin,payload:{field,value,expectedValue,basis:b}});
  const edit=await patch('revenueQuarter','0',null);assert.equal(edit.statusCode,200,edit.body);detail=edit.json().data;assert.equal(detail.fields.find((f:any)=>f.key==='revenueQuarter').value,'0');
  assert.equal((await raw.securityDataEdit.count({where:{securityId:security.id}})),1);
  assert.equal((await patch('marketCap','12',null)).statusCode,400);
  assert.equal((await patch('revenueQuarter','100',null)).statusCode,409);
  const second=await patch('revenueQuarter','12','0');assert.equal(second.statusCode,200,second.body);
  const key={securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:q.year,periodType:period}};
  await prisma.periodValuation.update({where:key,data:{values:{eps:'10'},supplemental:{accounts:{receiptNo:'not-an-edit'}}}});
  detail=(await app.inject({url:path,headers:admin})).json().data;assert.equal(detail.fields.find((f:any)=>f.key==='revenueQuarter').value,'12');
  const publicRead=await app.inject({url:`/api/financial-statements/${security.id}?startYear=${q.year}&endYear=${q.year}&period=${period}`,headers:admin});assert.equal(publicRead.statusCode,200,publicRead.body);
  assert.equal(publicRead.json().data.rows[0].values.revenue,period==='ANNUAL'?null:'12');
  const historyBefore=await raw.securityDataEdit.count({where:{securityId:security.id}});
  assert.equal((await app.inject({method:'PATCH',url:path,headers:{...admin,'x-csrf-token':'wrong'},payload:{field:'eps',value:'5',expectedValue:null,basis}})).statusCode,403);
  assert.equal(await raw.securityDataEdit.count({where:{securityId:security.id}}),historyBefore);
  // A failed receipt transaction cannot advance the discovery checkpoint or leave half the inbox.
  const receipt='20991231999999',previous=await raw.securityDataCursor.findUnique({where:{id:1}});
  await assert.rejects(raw.$transaction(async tx=>{await tx.securityDataReceipt.create({data:{receiptNo:receipt,corpCode:'99999999',disclosedDate:'20991231',report:{}}});await tx.securityDataCursor.upsert({where:{id:1},create:{id:1,fromDate:'20991230',throughDate:'20991231',page:2,nextCheckAt:new Date()},update:{page:999}});throw Error('injected-after-page-save');}));
  assert.equal(await raw.securityDataReceipt.findUnique({where:{receiptNo:receipt}}),null);assert.deepEqual(await raw.securityDataCursor.findUnique({where:{id:1}}),previous);
  await raw.securityDataReceipt.createMany({data:[{receiptNo:receipt,corpCode:'99999999',disclosedDate:'20991231',report:{}}],skipDuplicates:true});await raw.securityDataReceipt.createMany({data:[{receiptNo:receipt,corpCode:'99999999',disclosedDate:'20991231',report:{}}],skipDuplicates:true});assert.equal(await raw.securityDataReceipt.count({where:{receiptNo:receipt}}),1);
  const restarted=buildApp();try{assert.equal((await restarted.inject({url:path,headers:admin})).json().data.fields.find((f:any)=>f.key==='revenueQuarter').value,'12');}finally{await restarted.close();}
 }finally{
  await raw.securityDataReceipt.deleteMany({where:{receiptNo:'20991231999999'}});await raw.securityDataEdit.deleteMany({where:{securityId:security.id}});await raw.periodValuation.deleteMany({where:{securityId:security.id}});await raw.analysisRevision.deleteMany({where:{key:'security:'+security.id}});await raw.security.delete({where:{id:security.id}});
  await raw.authSession.deleteMany({where:{userId:{in:users.map(u=>u.id)}}});await raw.authUser.deleteMany({where:{id:{in:users.map(u=>u.id)}}});await app.close();await raw.$disconnect();await prisma.$disconnect();
 }
});
