import {prisma} from '@roxstock/shared/lib/prisma';
import {randomToken,passwordHash} from './crypto.js';
import {sendAuthMail} from './mail.js';
/** Explicit post-deployment operation, never invoked from startup or migrations. */
export async function sendInitialMail(){
 if(process.env.AUTH_INITIAL_MAIL_READY!=='verified')throw Error('DEPLOYMENT_AND_MAIL_VERIFICATION_REQUIRED');
 const user=await prisma.authUser.findUniqueOrThrow({where:{legacyKey:'legacy'}});
 if(user.initialMailClaimedAt||user.initialMailSentAt)return {sent:false,reason:'ALREADY_CLAIMED'};
 const temporary=randomToken(),encoded=await passwordHash(temporary),now=new Date();
 const claimed=await prisma.authUser.updateMany({where:{id:user.id,initialMailClaimedAt:null,initialMailSentAt:null,passwordHash:null},data:{passwordHash:encoded,mustChangePassword:true,temporaryExpiresAt:new Date(+now+24*3600000),initialMailClaimedAt:now}});
 if(!claimed.count)return {sent:false,reason:'EXISTING_PASSWORD_OR_CLAIM'};
 // A claim is kept on failure/uncertain SMTP acceptance. Reset flow recovers without duplicate secrets.
 await sendAuthMail(user.email,'RoxStock 최초 로그인 안내',`RoxStock 이메일 계정 분리가 완료되었습니다.\n로그인: ${process.env.AUTH_PUBLIC_ORIGIN}/auth/login\n이메일: ${user.email}\n일회용 임시 비밀번호: ${temporary}\n24시간 이내 로그인하고 비밀번호를 변경해 주세요. 변경 전에는 자산 자료에 접근할 수 없습니다.\n만료되었거나 메일을 다시 받아야 한다면 로그인 화면의 비밀번호 재설정을 이용해 주세요.`);
 await prisma.authUser.update({where:{id:user.id},data:{initialMailSentAt:new Date()}});
 return {sent:true};
}
if(process.argv.includes('--send-once'))sendInitialMail().then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('INITIAL_MAIL_FAILED_OR_UNCERTAIN');process.exitCode=1;}).finally(()=>prisma.$disconnect());
