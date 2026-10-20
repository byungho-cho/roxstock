import {prisma} from '@roxstock/shared/lib/prisma';
import {passwordHash} from './crypto.js';
import {sendAuthMail} from './mail.js';
/** Explicit post-deployment operation, never invoked from startup or migrations. */
export async function sendInitialMail(){
 if(process.env.AUTH_INITIAL_MAIL_READY!=='verified')throw Error('DEPLOYMENT_AND_MAIL_VERIFICATION_REQUIRED');
 const user=await prisma.authUser.findUniqueOrThrow({where:{legacyKey:'legacy'}});
 if(user.initialMailClaimedAt||user.initialMailSentAt)return {sent:false,reason:'ALREADY_CLAIMED'};
 const temporary=process.env.AUTH_INITIAL_TEMPORARY_PASSWORD;
 if(!temporary||temporary.length>4096)throw Error('PRIVATE_TEMPORARY_PASSWORD_REQUIRED');
 const encoded=await passwordHash(temporary),now=new Date();
 const claimed=await prisma.authUser.updateMany({where:{id:user.id,initialMailClaimedAt:null,initialMailSentAt:null,passwordHash:null},data:{passwordHash:encoded,mustChangePassword:false,temporaryExpiresAt:new Date(+now+24*3600000),initialMailClaimedAt:now}});
 if(!claimed.count)return {sent:false,reason:'EXISTING_PASSWORD_OR_CLAIM'};
 // A claim is kept on failure/uncertain SMTP acceptance. Reset flow recovers without duplicate secrets.
 await sendAuthMail(user.email,'RoxStock 최초 로그인 안내',`RoxStock 이메일 계정 분리가 완료되었습니다.\n로그인: ${process.env.AUTH_PUBLIC_ORIGIN}/auth/login\n이메일: ${user.email}\n임시 비밀번호: ${temporary}\n임시 비밀번호는 발급 후 24시간 동안 사용할 수 있습니다. 기간 내 재로그인과 자산 조회가 가능합니다.\n설정에서 비밀번호를 변경할 수 있으며, 만료된 뒤에는 로그인 화면의 비밀번호 재설정을 이용해 주세요.`);
 await prisma.authUser.update({where:{id:user.id},data:{initialMailSentAt:new Date()}});
 return {sent:true};
}
if(process.argv.includes('--send-once'))sendInitialMail().then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('INITIAL_MAIL_FAILED_OR_UNCERTAIN');process.exitCode=1;}).finally(()=>prisma.$disconnect());
