import type {FastifyReply,FastifyRequest} from 'fastify';
import {prisma} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {passwordHash,passwordMatches,randomToken,tokenHash,validPassword} from './crypto.js';
import {sendAuthMail} from './mail.js';
import type {AuthIdentity} from './context.js';
const day=86400000;
export const cookieNames={session:'rox_session',csrf:'rox_csrf'};
export function cookies(request:FastifyRequest){
  return Object.fromEntries((request.headers.cookie??'').split(';').map(part=>{const at=part.indexOf('=');return at<0?[]:[part.slice(0,at).trim(),part.slice(at+1).trim()];}).filter(row=>row.length===2));
}
export function authCookies(reply:FastifyReply,token:string,csrf:string,persistent:boolean,clear=false){
  const secure=process.env.NODE_ENV==='production'?'; Secure':'';
  const age=clear?'; Max-Age=0':persistent?'; Max-Age=7776000':'';
  reply.header('Set-Cookie',[
    `${cookieNames.session}=${clear?'':token}; Path=/; HttpOnly; SameSite=Lax${secure}${age}`,
    `${cookieNames.csrf}=${clear?'':csrf}; Path=/; SameSite=Strict${secure}${age}`,
  ]);
}
export function email(value:unknown){
  if(typeof value!=='string'||value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new ApiError(400,'INVALID_EMAIL','올바른 이메일 주소를 입력해 주세요.');
  return value.trim().toLowerCase();
}
export function newPassword(value:unknown,confirmation:unknown){
  if(!validPassword(value))throw new ApiError(400,'PASSWORD_TOO_SHORT','비밀번호는 12자 이상 입력해 주세요.');
  if(value!==confirmation)throw new ApiError(400,'PASSWORD_MISMATCH','비밀번호가 일치하지 않습니다.');
  return value;
}
export async function rateLimit(key:string,max:number,seconds:number){
  const hash=tokenHash(key),now=new Date();
  await prisma.$transaction(async tx=>{
    // Unique-row upsert serializes concurrent attempts, including the first request.
    const row=await tx.authRateLimit.upsert({where:{key:hash},create:{key:hash,count:1,expiresAt:new Date(+now+seconds*1000)},update:{count:{increment:1}}});
    if(row.expiresAt<=now){await tx.authRateLimit.update({where:{key:hash},data:{count:1,expiresAt:new Date(+now+seconds*1000)}});return;}
    if(row.count>max)throw new ApiError(429,'TOO_MANY_REQUESTS','요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  });
}
export async function sessionIdentity(request:FastifyRequest):Promise<AuthIdentity|null>{
  const token=cookies(request)[cookieNames.session];if(!token||!/^[-\w]{43}\.[-\w]{43}$/.test(token))return null;
  const [id]=token.split('.'),hash=tokenHash(token),now=new Date();
  const row=await prisma.authSession.findUnique({where:{id},include:{user:true}});
  if(!row||row.revokedAt||row.expiresAt<=now||!row.user.verifiedAt)return null;
  if(hash!==row.tokenHash){
    const retired=await prisma.authRetiredToken.findUnique({where:{tokenHash:hash}});
    if(!retired||retired.sessionId!==row.id)return null;
    if(retired.graceUntil<now){await prisma.authSession.update({where:{id},data:{revokedAt:now}});return null;}
  }
  if(row.user.mustChangePassword&&row.user.temporaryExpiresAt&&row.user.temporaryExpiresAt<=now)return null;
  return {userId:row.userId,role:row.user.role,sessionId:row.id,mustChangePassword:row.user.mustChangePassword};
}
export async function loginSession(userId:bigint,persistent:boolean,reply:FastifyReply){
  const id=randomToken(),token=id+'.'+randomToken(),csrf=randomToken();
  await prisma.authSession.create({data:{id,userId,persistent,tokenHash:tokenHash(token),csrfHash:tokenHash(csrf),expiresAt:new Date(Date.now()+(persistent?90*day:12*3600000))}});
  authCookies(reply,token,csrf,persistent);
}
export async function refreshSession(request:FastifyRequest,reply:FastifyReply,identity:AuthIdentity){
  const now=new Date(),provided=cookies(request)[cookieNames.session]??'',csrf=cookies(request)[cookieNames.csrf]??'';
  const row=await prisma.authSession.findUniqueOrThrow({where:{id:identity.sessionId}});
  if(row.tokenHash!==tokenHash(provided))return; // A concurrent refresh already rotated this token.
  const token=row.id+'.'+randomToken();
  const changed=await prisma.$transaction(async tx=>{
    const changed=await tx.authSession.updateMany({where:{id:row.id,tokenHash:row.tokenHash,revokedAt:null,expiresAt:{gt:now}},data:{previousTokenHash:row.tokenHash,previousValidUntil:new Date(+now+30000),tokenHash:tokenHash(token),rotatedAt:now,expiresAt:new Date(+now+(row.persistent?90*day:12*3600000))}});
    if(changed.count)await tx.authRetiredToken.create({data:{tokenHash:row.tokenHash,sessionId:row.id,graceUntil:new Date(+now+30000)}});
    return changed;
  });
  if(changed.count)authCookies(reply,token,csrf,row.persistent);
}
export async function emailLink(userId:bigint,purpose:'VERIFY'|'RESET',address:string){
  await rateLimit(`mail:${purpose}:${address}`,1,60);
  const token=randomToken(),now=new Date();
  const record=await prisma.$transaction(async tx=>{
    await tx.authEmailToken.updateMany({where:{userId,purpose,usedAt:null},data:{usedAt:now}});
    return tx.authEmailToken.create({data:{userId,purpose,tokenHash:tokenHash(token),expiresAt:new Date(+now+30*60000)}});
  });
  const origin=process.env.AUTH_PUBLIC_ORIGIN;
  if(!origin||!/^https:\/\//.test(origin)&&process.env.NODE_ENV==='production')throw new ApiError(503,'MAIL_UNAVAILABLE','메일 설정을 확인 중입니다. 잠시 후 다시 시도해 주세요.');
  const link=`${origin}/auth/${purpose==='VERIFY'?'verify':'reset'}#token=${token}`;
  try{await sendAuthMail(address,purpose==='VERIFY'?'RoxStock 이메일 인증':'RoxStock 비밀번호 재설정',`${purpose==='VERIFY'?'이메일 인증':'비밀번호 재설정'}을 진행해 주세요. 링크는 30분 동안 한 번 사용할 수 있습니다.\n${link}\n요청하지 않으셨다면 이 메일을 무시해 주세요.`);}
  catch(error){await prisma.authEmailToken.update({where:{id:record.id},data:{usedAt:new Date()}});throw error;}
}
export async function consumeLink(token:unknown,purpose:'VERIFY'|'RESET',password?:string){
  if(typeof token!=='string'||!/^[-\w]{43}$/.test(token))throw new ApiError(410,'LINK_EXPIRED','링크를 사용할 수 없습니다. 메일을 다시 요청해 주세요.');
  const encoded=purpose==='RESET'&&password?await passwordHash(password):null;
  await prisma.$transaction(async tx=>{
    const row=await tx.authEmailToken.findUnique({where:{tokenHash:tokenHash(token)}}),now=new Date();
    if(!row||row.purpose!==purpose||row.usedAt||row.expiresAt<=now)throw new ApiError(410,'LINK_EXPIRED','링크를 사용할 수 없습니다. 메일을 다시 요청해 주세요.');
    if(purpose==='VERIFY'){
      const user=await tx.authUser.findUniqueOrThrow({where:{id:row.userId}});
      if(!password||!user.passwordHash||!await passwordMatches(password,user.passwordHash))throw new ApiError(400,'VERIFICATION_PASSWORD_REQUIRED','가입 시 입력한 비밀번호를 확인해 주세요. 기억나지 않으면 비밀번호 재설정을 이용해 주세요.');
    }
    const changed=await tx.authEmailToken.updateMany({where:{id:row.id,usedAt:null,expiresAt:{gt:now}},data:{usedAt:now}});
    if(!changed.count)throw new ApiError(410,'LINK_EXPIRED','링크를 사용할 수 없습니다. 메일을 다시 요청해 주세요.');
    await tx.authUser.update({where:{id:row.userId},data:purpose==='VERIFY'?{verifiedAt:now}:{passwordHash:encoded!,verifiedAt:now,mustChangePassword:false,temporaryExpiresAt:null,temporaryUsedAt:null}});
    if(purpose==='RESET'){
      await tx.authSession.updateMany({where:{userId:row.userId,revokedAt:null},data:{revokedAt:now}});
      await tx.authEmailToken.updateMany({where:{userId:row.userId,usedAt:null},data:{usedAt:now}});
    }
  });
}
export {passwordHash,passwordMatches};
