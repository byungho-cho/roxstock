import type {FastifyInstance} from 'fastify';
import {prisma} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {verifyAuthMail} from './mail.js';
import {authCookies,consumeLink,email,emailLink,loginSession,newPassword,passwordHash,passwordMatches,rateLimit,refreshSession} from './service.js';
const failed=()=>new ApiError(401,'LOGIN_FAILED','이메일 또는 비밀번호를 확인해 주세요.');
type Body={email?:unknown;password?:unknown;confirmation?:unknown;remember?:unknown;token?:unknown;currentPassword?:unknown};
const serialize=(user:{id:bigint;email:string;role:string;mustChangePassword:boolean;settings?:unknown;legacyKey?:string|null})=>({id:String(user.id),email:user.email,role:user.role,mustChangePassword:user.mustChangePassword,settings:user.settings??{},legacyOwner:user.legacyKey==='legacy'});
export async function authRoutes(app:FastifyInstance){
  app.post<{Body:Body}>('/login',async(req,reply)=>{
    const address=email(req.body?.email);await rateLimit(`login-ip:${req.ip}`,30,900);await rateLimit(`login-email:${address}`,10,900);
    if(typeof req.body.password!=='string'||Buffer.byteLength(req.body.password)>4096)throw failed();
    const user=await prisma.authUser.findUnique({where:{email:address}});
    // A fixed valid scrypt encoding keeps unknown-email failures on the same expensive path.
    const hash=user?.passwordHash??'scrypt$32768$0000000000000000000000000000000000000000000000000000000000000000$'+'0'.repeat(128);
    const matches=await passwordMatches(req.body.password,hash);
    if(!user||!matches||!user.verifiedAt||user.mustChangePassword&&(!user.temporaryExpiresAt||user.temporaryExpiresAt<=new Date()||user.temporaryUsedAt))throw failed();
    if(user.mustChangePassword){const used=await prisma.authUser.updateMany({where:{id:user.id,mustChangePassword:true,temporaryUsedAt:null,temporaryExpiresAt:{gt:new Date()}},data:{temporaryUsedAt:new Date()}});if(!used.count)throw failed();}
    await loginSession(user.id,req.body.remember===true,reply);return {data:serialize(user)};
  });
  app.post<{Body:Body}>('/register',async req=>{
    const address=email(req.body?.email),password=newPassword(req.body.password,req.body.confirmation);
    await rateLimit(`signup:${req.ip}`,10,3600);
    if(!await prisma.authInvitation.findUnique({where:{email:address}}))throw new ApiError(403,'INVITATION_REQUIRED','현재는 승인되거나 초대된 이메일로 가입할 수 있습니다.');
    const existing=await prisma.authUser.findUnique({where:{email:address}});
    if(existing?.verifiedAt)throw new ApiError(409,'EMAIL_EXISTS','이미 가입된 이메일입니다. 로그인해 주세요.');
    const encoded=await passwordHash(password);
    const user=existing??await prisma.authUser.create({data:{email:address,passwordHash:encoded}});
    // Pending users keep their original password; only a verified reset can replace it.
    await emailLink(user.id,'VERIFY',address);return {data:{sent:true}};
  });
  app.post<{Body:Body}>('/resend',async req=>{
    const address=email(req.body?.email);await rateLimit(`resend-ip:${req.ip}`,10,3600);
    await verifyAuthMail();
    const user=await prisma.authUser.findUnique({where:{email:address}});
    if(user&&!user.verifiedAt)await emailLink(user.id,'VERIFY',address);
    else await rateLimit(`mail:VERIFY:${address}`,1,60);
    return {data:{sent:true}};
  });
  app.post<{Body:Body}>('/forgot',async req=>{
    const address=email(req.body?.email);await rateLimit(`reset-ip:${req.ip}`,10,3600);
    await verifyAuthMail();
    const user=await prisma.authUser.findUnique({where:{email:address}});
    if(user)await emailLink(user.id,'RESET',address);else await rateLimit(`mail:RESET:${address}`,1,60);
    return {data:{sent:true}};
  });
  app.post<{Body:Body}>('/verify',async req=>{await rateLimit(`verify-use:${req.ip}`,20,900);const password=typeof req.body?.password==='string'&&Buffer.byteLength(req.body.password)<=4096?req.body.password:undefined;await consumeLink(req.body?.token,'VERIFY',password);return {data:{verified:true}};});
  app.post<{Body:Body}>('/reset',async req=>{const password=newPassword(req.body?.password,req.body?.confirmation);await rateLimit(`reset-use:${req.ip}`,20,900);await consumeLink(req.body.token,'RESET',password);return {data:{changed:true}};});
  app.get('/me',async req=>({data:serialize(await prisma.authUser.findUniqueOrThrow({where:{id:req.auth!.userId}}))}));
  app.post<{Body:{theme?:unknown;favorites?:unknown;selectedAccountId?:unknown;legacyImported?:unknown}}>('/settings',async req=>{
    const body=req.body??{},user=await prisma.authUser.findUniqueOrThrow({where:{id:req.auth!.userId}}),settings={...(user.settings as Record<string,any>??{})};
    if(body.theme!==undefined){if(!['dark','light','system'].includes(String(body.theme)))throw new ApiError(400,'INVALID_INPUT','테마를 확인해 주세요.');settings.theme=body.theme;}
    if(body.favorites!==undefined){if(!Array.isArray(body.favorites)||body.favorites.length>3000||body.favorites.some(v=>typeof v!=='string'||v.length>64))throw new ApiError(400,'INVALID_INPUT','관심 표시를 확인해 주세요.');settings.favorites=body.favorites;}
    if(body.selectedAccountId!==undefined){if(typeof body.selectedAccountId!=='string'||!/^\d{1,20}$/.test(body.selectedAccountId)||!await prisma.account.findFirst({where:{id:BigInt(body.selectedAccountId),userId:user.id},select:{id:true}}))throw new ApiError(404,'NOT_FOUND','계좌를 찾을 수 없습니다.');settings.selectedAccountId=body.selectedAccountId;}
    if(body.legacyImported===true&&user.legacyKey==='legacy')settings.legacyImported=true;
    await prisma.authUser.update({where:{id:user.id},data:{settings}});return {data:settings};
  });
  app.post<{Body:{email?:unknown}}>('/invitations',async req=>{
    if(req.auth!.role!=='ADMIN')throw new ApiError(403,'ADMIN_REQUIRED','관리자만 사용할 수 있습니다.');
    const address=email(req.body?.email);await prisma.authInvitation.upsert({where:{email:address},create:{email:address},update:{}});return {data:{approved:true}};
  });
  app.post('/refresh',async(req,reply)=>{await refreshSession(req,reply,req.auth!);return {data:{refreshed:true}};});
  app.post('/logout',async(req,reply)=>{await prisma.authSession.updateMany({where:{id:req.auth!.sessionId,revokedAt:null},data:{revokedAt:new Date()}});authCookies(reply,'','',false,true);return {data:{loggedOut:true}};});
  app.post<{Body:Body}>('/change-password',async(req,reply)=>{
    const password=newPassword(req.body?.password,req.body?.confirmation);await rateLimit(`change:${req.auth!.userId}`,10,900);
    const user=await prisma.authUser.findUniqueOrThrow({where:{id:req.auth!.userId}});
    if(typeof req.body.currentPassword!=='string'||Buffer.byteLength(req.body.currentPassword)>4096||!user.passwordHash||!await passwordMatches(req.body.currentPassword,user.passwordHash))throw failed();
    const encoded=await passwordHash(password),now=new Date();
    await prisma.$transaction(async tx=>{
      await tx.authUser.update({where:{id:user.id},data:{passwordHash:encoded,mustChangePassword:false,temporaryExpiresAt:null,temporaryUsedAt:null}});
      await tx.authSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:now}});
      await tx.authEmailToken.updateMany({where:{userId:user.id,usedAt:null},data:{usedAt:now}});
    });
    authCookies(reply,'','',false,true);return {data:{changed:true}};
  });
}
