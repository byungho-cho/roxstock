import nodemailer from 'nodemailer';
import {ApiError} from '@roxstock/shared/lib/api-error';
function transport(){
  const password=process.env.SMTP_PASS??process.env.SMTP_PASSWORD;
  if(process.env.SMTP_USER!=='nurox0505@gmail.com'||!password)throw new ApiError(503,'MAIL_UNAVAILABLE','메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return nodemailer.createTransport({host:'smtp.gmail.com',port:587,secure:false,requireTLS:true,tls:{minVersion:'TLSv1.2'},auth:{user:process.env.SMTP_USER,pass:password},logger:false,debug:false,connectionTimeout:15000,socketTimeout:20000});
}
/** Check provider availability before looking up an email, so configuration failure cannot enumerate accounts. */
export async function verifyAuthMail(){
  const sender=transport();try{await sender.verify();}catch{throw new ApiError(503,'MAIL_UNAVAILABLE','메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');}finally{sender.close();}
}
export async function sendAuthMail(to:string,subject:string,text:string){
  const sender=transport();
  try{
    const result=await sender.sendMail({from:{name:'RoxStock',address:process.env.SMTP_USER!},to,subject,text,disableFileAccess:true,disableUrlAccess:true});
    if(!result.accepted.length||result.rejected.length)throw Error('NOT_ACCEPTED');
  }catch{throw new ApiError(503,'MAIL_UNAVAILABLE','메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');}
  finally{sender.close();}
}
