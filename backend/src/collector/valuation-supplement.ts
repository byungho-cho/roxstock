import type {PrismaClient,Prisma} from '../generated/prisma/index.js';
import {calculatePeriod,preserveValues,metricKeys,type Supplemental} from '../domain/period-valuation.js';
export async function supplementStoredPeriod(db:PrismaClient,securityId:bigint,fiscalYear:number,periodType:string,options:{dryRun?:boolean;load?:(f:Awaited<ReturnType<typeof db.dartFinancialFiling.findFirst>>,stored:Supplemental)=>Promise<Supplemental>}={}) {
 if(fiscalYear<2015||fiscalYear>Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date())))return null;
 const where={securityId_fiscalYear_periodType:{securityId,fiscalYear,periodType}};
 const [filing,previous,existing]=await Promise.all([
 db.dartFinancialFiling.findFirst({where:{securityId,fiscalYear,periodType:periodType as 'ANNUAL'|'Q1'|'Q2'|'Q3',isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]}),
 db.dartFinancialFiling.findFirst({where:{securityId,fiscalYear:fiscalYear-1,periodType:'ANNUAL',isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]}),
 db.periodValuation.findUnique({where})]);
 if(!filing)return null;
 if(existing?.status==='SUCCESS')return existing;
 let supplemental=(existing?.supplemental??{}) as Supplemental;
 if(options.load)supplemental=await options.load(filing,supplemental);
 const result=calculatePeriod(filing,previous??undefined,supplemental);
 const values=preserveValues(existing?.values,result.values),reasons=Object.fromEntries(Object.entries(result.reasons).filter(([key])=>values[key as keyof typeof values]===null));
 const status=metricKeys.every(k=>values[k]!==null)?'SUCCESS':metricKeys.some(k=>values[k]!==null)?'PARTIAL':'INSUFFICIENT';
 const data={status,values:values as Prisma.InputJsonValue,provenance:result.provenance as Prisma.InputJsonValue,reasons:reasons as Prisma.InputJsonValue,supplemental:supplemental as Prisma.InputJsonValue,attempts:(existing?.attempts??0)+1,nextAttemptAt:status==='SUCCESS'||!options.load?null:new Date(Date.now()+86400000)};
 if(!options.dryRun)await db.periodValuation.upsert({where,create:{securityId,fiscalYear,periodType,...data},update:data});
 return {securityId:securityId.toString(),fiscalYear,periodType,...data};
}
/** Failure state never changes a financial filing or its SUCCESS task. */
export async function supplementSafely(db:PrismaClient,securityId:bigint,year:number,period:string,load?:NonNullable<Parameters<typeof supplementStoredPeriod>[4]>['load']) {
 try{return await supplementStoredPeriod(db,securityId,year,period,{load});}
 catch(error){
  const code=typeof error==='object'&&error&&'code'in error?String(error.code):'VALUATION_ERROR';
  const where={securityId_fiscalYear_periodType:{securityId,fiscalYear:year,periodType:period}};
  await db.periodValuation.upsert({where,create:{securityId,fiscalYear:year,periodType:period,status:'FAILED',values:{},provenance:{},reasons:{collection:code},attempts:1,nextAttemptAt:new Date(Date.now()+3600000)},update:{status:'FAILED',reasons:{collection:code},attempts:{increment:1},nextAttemptAt:new Date(Date.now()+3600000)}});
  return {status:'FAILED',code};
 }
}
