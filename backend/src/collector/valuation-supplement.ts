import { PrismaDartRepository } from './dart-repository.js';
import { historicalClose, HistoricalPriceError } from './historical-close.js';
import { DartApiError, normalizeDartFinancialRows, type OpenDartProvider, type DartReportCode } from './dart-provider.js';
import type {PrismaClient,Prisma} from '../generated/prisma/index.js';
import {calculatePeriod,preserveValues,metricKeys,type Supplemental} from '../domain/period-valuation.js';
export async function supplementStoredPeriod(db:PrismaClient,securityId:bigint,fiscalYear:number,periodType:string,options:{dryRun?:boolean;load?:(f:Awaited<ReturnType<typeof db.dartFinancialFiling.findFirst>>,stored:Supplemental)=>Promise<Supplemental>}={}) {
 if(fiscalYear<2015||fiscalYear>Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date())))return null;
 const where={securityId_fiscalYear_periodType:{securityId,fiscalYear,periodType}};
 let [filing,previous,existing]=await Promise.all([
 db.dartFinancialFiling.findFirst({where:{securityId,fiscalYear,periodType:periodType as 'ANNUAL'|'Q1'|'Q2'|'Q3',isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]}),
 db.dartFinancialFiling.findFirst({where:{securityId,fiscalYear:fiscalYear-1,periodType:'ANNUAL',isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]}),
 db.periodValuation.findUnique({where})]);
 if(!filing)return null;
 if(existing?.status==='SUCCESS')return existing;
 let supplemental=(existing?.supplemental??{}) as Supplemental;
 if(options.load){supplemental=await options.load(filing,supplemental);if(filing.normalizationVersion<3)filing=await db.dartFinancialFiling.findFirst({where:{id:filing.id}})??filing;}
 const result=calculatePeriod(filing,previous??undefined,supplemental);
 const values=preserveValues(existing?.values,result.values),reasons=Object.fromEntries(Object.entries(result.reasons).filter(([key])=>values[key as keyof typeof values]===null));
 const status=metricKeys.every(k=>values[k]!==null)?'SUCCESS':metricKeys.some(k=>values[k]!==null)?'PARTIAL':'INSUFFICIENT';
 const oldProvenance=existing?.provenance as Record<string,unknown>|undefined;
 const perMetric=Object.fromEntries(metricKeys.filter(k=>values[k]!==null).map(k=>[k,(existing?.values as Record<string,string|null>|undefined)?.[k]!=null?(oldProvenance?.perMetric as Record<string,unknown>|undefined)?.[k]??oldProvenance:result.provenance]));
 const data={status,values:values as Prisma.InputJsonValue,provenance:{...result.provenance,perMetric} as Prisma.InputJsonValue,reasons:reasons as Prisma.InputJsonValue,supplemental:supplemental as Prisma.InputJsonValue,attempts:(existing?.attempts??0)+1,nextAttemptAt:status==='SUCCESS'||!options.load?null:new Date(Date.now()+86400000)};
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
  return {status:'FAILED',code,reasons:{collection:code}};
 }
}

/** Reused by background and manual collection; period-end sources only. */
export function loadPeriodSupplement(provider:OpenDartProvider,symbol:string,corpCode:string,db?:PrismaClient,beforePrice?:()=>Promise<void>) {
 return async(f:Awaited<ReturnType<PrismaClient['dartFinancialFiling']['findFirst']>>,saved:Supplemental):Promise<Supplemental>=>{
  if(!f||f.periodType==='Q4'||(f.fsDivision!=='CFS'&&f.fsDivision!=='OFS'))return saved;
  if(db&&f.normalizationVersion<3){
   const rows=await provider.fetchFinancials(corpCode,f.fiscalYear,f.reportCode as DartReportCode,f.fsDivision);
   if(rows.length){
    if(rows.some(r=>r.receiptNo!==f.receiptNo))throw new DartApiError('RECEIPT_MISMATCH','보충 자료의 공시번호가 일치하지 않습니다.');
    await new PrismaDartRepository(db).saveFiling({securityId:f.securityId,fiscalYear:f.fiscalYear,periodType:f.periodType,reportCode:f.reportCode as DartReportCode,fsDivision:f.fsDivision,receiptNo:f.receiptNo,reportName:f.reportName,receiptDate:f.receiptDate,periodEndDate:f.periodEndDate,collectedAt:new Date(),values:normalizeDartFinancialRows(rows)});
   }
  }
  const errors:Record<string,string>={};let shares=saved.shares,price=saved.price;
  try{if(!shares)shares=await provider.fetchPeriodShares(corpCode,f.fiscalYear,f.reportCode as DartReportCode,f.receiptNo);}catch(error){if(error instanceof DartApiError&&(error.quotaExceeded||['DAILY_CALL_LIMIT','SCHEDULE_WINDOW_ENDED'].includes(error.code)))throw error;errors.shares='동일 공시 주식수 보충 조회 실패';}
  try{if(!price){await beforePrice?.();price=await historicalClose(symbol,f.periodEndDate);}}catch(error){if(error instanceof DartApiError&&(error.quotaExceeded||['DAILY_CALL_LIMIT','SCHEDULE_WINDOW_ENDED'].includes(error.code)))throw error;const failure=error instanceof HistoricalPriceError?error:new HistoricalPriceError('HISTORICAL_PRICE_COMMUNICATION','COMMUNICATION');const descriptions={AUTH:'과거 종가 API 인증·활용 권한 오류',COMMUNICATION:'과거 종가 API 통신 오류',RATE_LIMIT:'과거 종가 API 호출 제한',PROVIDER:'과거 종가 공급자 응답 오류',NO_DATA:'해당 기간·종목의 과거 종가 조회 결과 없음'};errors.price=descriptions[failure.category];errors.priceCode=failure.code; if(failure.providerCode)errors.priceProviderCode=failure.providerCode;console.warn(JSON.stringify({event:'historical_price_failure',securityId:f.securityId.toString(),symbol,fiscalYear:f.fiscalYear,period:f.periodType,code:failure.code,category:failure.category,providerCode:failure.providerCode}));}
  return {...saved,...(shares?{shares}:{}),...(price?{price}:{}),errors};
 };
}
