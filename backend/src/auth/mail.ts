import nodemailer from 'nodemailer';
import {ApiError} from '@roxstock/shared/lib/api-error';
export async function sendAuthMail(to:string,subject:string,text:string){
  const password=process.env.SMTP_PASS??process.env.SMTP_PASSWORD;
  if(process.env.SMTP_USER!=='nurox0505@gmail.com'||!password)throw new ApiError(503,'MAIL_UNAVAILABLE','메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
  const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:587,secure:false,requireTLS:true,tls:{minVersion:'TLSv1.2'},auth:{user:process.env.SMTP_USER,pass:password},logger:false,debug:false,connectionTimeout:15000,socketTimeout:20000});
  try{
    const result=await transport.sendMail({from:{name:'RoxStock',address:process.env.SMTP_USER},to,subject,text,disableFileAccess:true,disableUrlAccess:true});
    if(!result.accepted.length||result.rejected.length)throw Error('NOT_ACCEPTED');
  }catch{throw new ApiError(503,'MAIL_UNAVAILABLE','메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');}
  finally{transport.close();}
}
