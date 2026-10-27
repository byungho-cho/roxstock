import 'dotenv/config';
import {prisma} from '@roxstock/shared/lib/prisma';
import {loadCollectorConfig} from '@roxstock/shared/collection/config';
import {collectorLog as log} from '@roxstock/shared/collection/logger';
import {dartDiagnostic} from '@roxstock/shared/collection/dart-diagnostics';
import {runSecurityDataCollection} from './security-data-collector.js';
const config=loadCollectorConfig();let running=false,stopping=false;
const tick=async()=>{if(running||stopping)return;running=true;try{
 const result=await runSecurityDataCollection(prisma,{apiKey:process.env.DART_API_KEY?.trim()??'',dailyCallLimit:config.dartDailyCallLimit,minDelayMs:config.dartMinDelayMs,corpRefreshHours:config.dartCorpRefreshHours});
 if(!['IDLE','DISABLED','LOCKED'].includes(result.status))log('info','종목 데이터 수집',result);
}catch(error){log('error','종목 데이터 수집 중단',dartDiagnostic(error,'SECURITY_DATA'));}finally{running=false;}};
const timer=setInterval(()=>void tick(),60000);
const stop=async()=>{stopping=true;clearInterval(timer);while(running)await new Promise(r=>setTimeout(r,100));await prisma.$disconnect();};
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());await tick();
