import {kisHistoricalClose} from './kis-historical-close.js';
import {valueCompletion} from '@roxstock/shared/domain/collection-status';
import {supplementedFilings} from '@roxstock/shared/domain/financial-evidence';
import {withCollection,CollectionExcluded,componentExcluded} from '@roxstock/shared/collection/collection-policy';
import {collectionClient} from '@roxstock/shared/lib/collection-client';
import {validateStoredDartRows} from './dart-filing-validation.js';
import {normalizeProviderSymbol} from '@roxstock/shared/domain/security-symbol';
import { configuredKrx, type KrxMarket } from './krx-provider.js';
import { collectAnnualConsensus, settleAnnualConsensus, freezePastEstimates } from './annual-consensus.js';
import { historicalClose, HistoricalPriceError } from './historical-close.js';
import { DartApiError, type OpenDartProvider, type DartReportCode } from './dart-provider.js';
import {Prisma,type PrismaClient} from '@roxstock/shared/prisma';
import {calculatePeriod,fiscalDurationMatches,preserveValues,metricKeys,type Supplemental} from '@roxstock/shared/domain/period-valuation';
import { normalizeManualDartAccounts } from './manual-dart-accounts.js';
import {bookValueShares,completeShares} from '@roxstock/shared/domain/share-counts';
import {storeShareCounts} from './share-counts.js';
import {verifyFiscalDuration} from './fiscal-duration.js';
export function needsDartAccounts(f:NonNullable<Awaited<ReturnType<PrismaClient['dartFinancialFiling']['findFirst']>>>,saved:Supplemental){
 if(saved.accounts?.receiptNo===f.receiptNo&&saved.accounts.fsDivision===f.fsDivision){
  if(saved.shares?.preferred&&saved.accounts.sources.basicEps?.ordinaryEpsVerified===undefined)return true;
  const core=[['revenueYtd','revenue'],['netIncomeYtd','netIncome'],['totalEquity','totalEquity'],['totalAssets','totalAssets'],['totalLiabilities','totalLiabilities']] as const;
  return core.some(([field,key])=>f[field]==null&&saved.accounts?.sources[key]?.amount==null&&saved.accounts?.sources[key]?.ytdAmount==null);
 }
 const sources=f.accountSources as Record<string,{amount?:string|null;ytdAmount?:string|null}>|null;
 const required=['basicEps','investingCashFlow','financingCashFlow','cashEquivalents',...(f.fsDivision==='CFS'?['parentNetIncome','parentEquity']:[])];
 return required.some(key=>sources?.[key]?.amount==null&&sources?.[key]?.ytdAmount==null);
}
export async function supplementStoredPeriod(db:PrismaClient,securityId:bigint,fiscalYear:number,periodType:string,options:{dryRun?:boolean;load?:(f:Awaited<ReturnType<typeof db.dartFinancialFiling.findFirst>>,stored:Supplemental,sharesOnly?:boolean,accountsOnly?:boolean)=>Promise<Supplemental>}={}) {
 db=collectionClient(db);
 return withCollection(db,securityId,'valuation',async()=>{
 if(fiscalYear<2015||fiscalYear>Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date())))return null;
 const where={securityId_fiscalYear_periodType:{securityId,fiscalYear,periodType}};
 let [filing,previous,existing]=await Promise.all([
 db.dartFinancialFiling.findFirst({where:{securityId,fiscalYear,periodType:periodType as 'ANNUAL'|'Q1'|'Q2'|'Q3',isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]}),
 db.dartFinancialFiling.findFirst({where:{securityId,fiscalYear:fiscalYear-1,periodType:'ANNUAL',isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]}),
 db.periodValuation.findUnique({where})]);
 if(!filing)return null;
 let supplemental=(existing?.supplemental??{}) as Supplemental;
 if(existing?.status==='SUCCESS'&&(!((filing.sourceValidation as {periodResolution?:unknown}|null)?.periodResolution)||fiscalDurationMatches(filing,supplemental.fiscalDuration))){
  if(options.load&&(!completeShares(supplemental.shares,filing.receiptNo)||needsDartAccounts(filing,supplemental))){
   supplemental=await options.load(filing,supplemental,!needsDartAccounts(filing,supplemental));
   if(!options.dryRun){await storeShareCounts(db,filing,supplemental.shares);await db.periodValuation.update({where,data:{supplemental:supplemental as Prisma.InputJsonValue}});}
   return {...existing,supplemental};
  }
  return existing;
 }
 if(options.load){supplemental=await options.load(filing,supplemental);if(filing.normalizationVersion<3)filing=await db.dartFinancialFiling.findFirst({where:{id:filing.id}})??filing;}
 // Exact-filing supplements participate in calculations as well as API display.
 filing=supplementedFilings([filing],[{securityId,fiscalYear,periodType,supplemental:supplemental as Prisma.JsonObject}])[0]!;
 if(previous){
  const priorWhere={securityId_fiscalYear_periodType:{securityId,fiscalYear:previous.fiscalYear,periodType:'ANNUAL'}};
  const prior=await db.periodValuation.findUnique({where:priorWhere});
  let priorSupplement=(prior?.supplemental??{}) as Supplemental;
  previous=supplementedFilings([previous],[{securityId,fiscalYear:previous.fiscalYear,periodType:'ANNUAL',supplemental:priorSupplement as Prisma.JsonObject}])[0]!;
  if(options.load&&previous.fsDivision===filing.fsDivision&&previous.totalEquity==null){
   priorSupplement=await options.load(previous,priorSupplement,false,true);
   if(!options.dryRun&&priorSupplement.accounts?.receiptNo===previous.receiptNo)await db.periodValuation.upsert({where:priorWhere,create:{securityId,fiscalYear:previous.fiscalYear,periodType:'ANNUAL',status:'PARTIAL',values:{},provenance:{},reasons:{},supplemental:priorSupplement as Prisma.InputJsonValue},update:{supplemental:priorSupplement as Prisma.InputJsonValue}});
   previous=supplementedFilings([previous],[{securityId,fiscalYear:previous.fiscalYear,periodType:'ANNUAL',supplemental:priorSupplement as Prisma.JsonObject}])[0]!;
  }
 }
 const result=calculatePeriod(filing,previous??undefined,supplemental);
 const oldProvenance=existing?.provenance as Record<string,unknown>|undefined;
 const oldValues=existing?.values as Record<string,string|null>|undefined;
 for(const [ratio,base]of [['per','eps'],['pbr','bps']] as const){
  const evidence=(oldProvenance?.perMetric as Record<string,Record<string,unknown>>|undefined)?.[base]??oldProvenance;
  if(oldValues?.[base]!=null&&oldValues[ratio]==null&&result.values[ratio]!==null&&(oldValues[base]!==result.values[base]||evidence?.fsDivision&&evidence.fsDivision!==filing.fsDivision||evidence?.receiptNo&&evidence.receiptNo!==filing.receiptNo)){
   result.values[ratio]=null;result.reasons[ratio]=`기존 정상 ${base.toUpperCase()}와 새 보충 자료의 공시·귀속 기준 불일치`;
  }
 }
 // Reuse a separately verified annual denominator without substituting today's EPS/BPS.
 const ratioEvidence:Record<string,unknown>={};
 for(const [ratio,base]of [['per','eps'],['pbr','bps']] as const){
  const evidence=(oldProvenance?.perMetric as Record<string,Record<string,unknown>>|undefined)?.[base]??oldProvenance;
  const annual=(supplemental as Supplemental&{kisAnnual?:Record<string,unknown>}).kisAnnual;
  const linked=evidence?.receiptNo===filing.receiptNo&&evidence?.fsDivision===filing.fsDivision&&evidence?.periodEnd===filing.periodEndDate.toISOString().slice(0,10);
  const verified=linked&&(evidence?.source==='OPEN_DART'||evidence?.source==='KIS_API'&&evidence.validation==='DART_BALANCE_AND_FLOW_RECONCILED'&&evidence.fiscalYear===fiscalYear&&evidence.periodType==='ANNUAL'&&annual?.matchedReceiptNo===filing.receiptNo&&annual.matchedDivision===filing.fsDivision&&annual.fiscalYear===fiscalYear&&annual.periodEnd===evidence.periodEnd&&typeof annual[base]==='string'&&oldValues?.[base]!=null&&new Prisma.Decimal(annual[base] as string).eq(oldValues[base]));
  const price=supplemental.price,basis=supplemental.basis,age=price?(filing.periodEndDate.getTime()-Date.parse(price.date))/86400000:NaN;
  const compatible=basis?.receiptNo===filing.receiptNo&&(base==='eps'?basis.epsPriceCompatible:basis.bpsPriceCompatible);
  if(periodType==='ANNUAL'&&result.values[base]===null&&oldValues?.[base]!=null&&oldValues[ratio]==null&&verified&&price?.source==='KIS_KRX_UNADJUSTED_CLOSE'&&compatible&&age>=0&&age<=7&&!new Prisma.Decimal(oldValues[base]).isZero()&&new Prisma.Decimal(price.value).gt(0)){
   result.values[ratio]=new Prisma.Decimal(price.value).div(oldValues[base]).toDecimalPlaces(4).toString();
   ratioEvidence[ratio]={...result.provenance,denominatorEvidence:evidence,denominatorValue:oldValues[base]};
  }
 }
 const values=preserveValues(existing?.values,result.values),reasons=Object.fromEntries(Object.entries(result.reasons).filter(([key])=>values[key as keyof typeof values]===null));
 const status=valueCompletion(values).complete?'SUCCESS':metricKeys.some(k=>values[k]!==null)?'PARTIAL':'INSUFFICIENT';
 const perMetric=Object.fromEntries(metricKeys.filter(k=>values[k]!==null).map(k=>[k,(existing?.values as Record<string,string|null>|undefined)?.[k]!=null?(oldProvenance?.perMetric as Record<string,unknown>|undefined)?.[k]??oldProvenance:ratioEvidence[k]??result.provenance]));
 const data={status,values:values as Prisma.InputJsonValue,provenance:{...result.provenance,perMetric} as Prisma.InputJsonValue,reasons:reasons as Prisma.InputJsonValue,supplemental:supplemental as Prisma.InputJsonValue,attempts:(existing?.attempts??0)+1,nextAttemptAt:status==='SUCCESS'||!options.load?null:new Date(Date.now()+86400000)};
 if(!options.dryRun){
  await storeShareCounts(db,filing,supplemental.shares);
  await db.periodValuation.upsert({where,create:{securityId,fiscalYear,periodType,...data},update:data});
  if(periodType==='ANNUAL'&&process.env.CONSENSUS_ENABLED==='true'){try{await settleAnnualConsensus(db,securityId,fiscalYear,{values,provenance:data.provenance,reasons},supplemental.price,true);}catch{console.warn(JSON.stringify({event:'consensus_finalization_failed',securityId:String(securityId),fiscalYear}));}}
 }
 return {securityId:securityId.toString(),fiscalYear,periodType,...data};
 });
}
/** Failure state never changes a financial filing or its SUCCESS task. */
export async function supplementSafely(db:PrismaClient,securityId:bigint,year:number,period:string,load?:NonNullable<Parameters<typeof supplementStoredPeriod>[4]>['load']) {
 try{return await supplementStoredPeriod(db,securityId,year,period,{load});}
 catch(error){if(error instanceof CollectionExcluded&&!componentExcluded(error))throw error;
  const code=typeof error==='object'&&error&&'code'in error?String(error.code):'VALUATION_ERROR';
  const where={securityId_fiscalYear_periodType:{securityId,fiscalYear:year,periodType:period}};
  const existing=await db.periodValuation.findUnique({where});
  if(existing?.status==='SUCCESS')return {...existing,code,shareSupplementError:code};
  await db.periodValuation.upsert({where,create:{securityId,fiscalYear:year,periodType:period,status:'FAILED',values:{},provenance:{},reasons:{collection:code},attempts:1,nextAttemptAt:new Date(Date.now()+3600000)},update:{status:'FAILED',reasons:{collection:code},attempts:{increment:1},nextAttemptAt:new Date(Date.now()+3600000)}});
  return {status:'FAILED',code,reasons:{collection:code}};
 }
}

/** Reused by background and manual collection; period-end sources only. */
export function loadPeriodSupplement(provider:OpenDartProvider|null,symbol:string,corpCode:string,db?:PrismaClient,market?:string,mode:'AUTOMATIC'|'MANUAL_PROTOTYPE'='AUTOMATIC',options:{dartRequests?:boolean;fetcher?:typeof fetch}={}) {
 return async(f:Awaited<ReturnType<PrismaClient['dartFinancialFiling']['findFirst']>>,saved:Supplemental,sharesOnly=false,accountsOnly=false):Promise<Supplemental>=>{
  if(!f||f.periodType==='Q4'||(f.fsDivision!=='CFS'&&f.fsDivision!=='OFS'))return saved;
  if(!sharesOnly&&!accountsOnly&&process.env.CONSENSUS_ENABLED==='true'&&db){try{await freezePastEstimates(db,f.securityId,symbol,market??'KOSPI');if(f.fiscalYear===Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date())))await collectAnnualConsensus(db,f.securityId,symbol);}catch{console.warn(JSON.stringify({event:'consensus_collection_failed',securityId:String(f.securityId)}));}}
  const errors:Record<string,string>={};let shares=saved.shares,price=saved.price,accounts=saved.accounts,fiscalDuration=saved.fiscalDuration;
  if(provider&&options.dartRequests!==false&&(f.sourceValidation as {periodResolution?:unknown}|null)?.periodResolution&&!fiscalDurationMatches(f,fiscalDuration)){
   try{fiscalDuration=verifyFiscalDuration(f,await provider.fetchPeriodDates(corpCode,f.fiscalYear,f.reportCode as DartReportCode),normalizeProviderSymbol(symbol));if(!fiscalDuration)errors.durationCode='DART_REVIEW_FISCAL_DURATION_UNVERIFIED';}
   catch(error){if(error instanceof CollectionExcluded&&!componentExcluded(error))throw error;if(error instanceof DartApiError&&(error.quotaExceeded||['DAILY_CALL_LIMIT','SCHEDULE_WINDOW_ENDED'].includes(error.code)))throw error;errors.durationCode=error instanceof DartApiError?error.code:'DART_DURATION_COMMUNICATION';}
  }
  try{if(provider&&!accountsOnly&&options.dartRequests!==false&&!completeShares(shares,f.receiptNo)){const fetched=await provider.fetchPeriodShares(corpCode,f.fiscalYear,f.reportCode as DartReportCode,f.receiptNo);if(fetched)shares=fetched;else {errors.shares='주식수 미공시 또는 미제공';errors.sharesCode='SHARES_NO_DATA';}}}catch(error){if(error instanceof CollectionExcluded&&!componentExcluded(error))throw error;if(error instanceof DartApiError&&(error.quotaExceeded||['DAILY_CALL_LIMIT','SCHEDULE_WINDOW_ENDED'].includes(error.code)))throw error;errors.shares='동일 공시 주식수 보충 조회 실패';errors.sharesCode=error instanceof DartApiError?error.code:'SHARES_COMMUNICATION';}
  if(sharesOnly)return {...saved,...(fiscalDuration?{fiscalDuration}:{}),...(shares?{shares}:{}),errors};
  // DART account supplementation is validated against the exact stored filing.
  // KRX's separate historical-price rollout must not block a DART EPS request.
  if(provider&&options.dartRequests!==false&&(needsDartAccounts(f,saved)||f.periodType==='ANNUAL'&&!fiscalDuration?.openingEquity&&!saved.accounts?.sources.openingTotalEquity&&!saved.accounts?.sources.openingParentEquity)){
   try{
    const rows=await provider.fetchFinancials(corpCode,f.fiscalYear,f.reportCode as DartReportCode,f.fsDivision);
    validateStoredDartRows(rows,f,corpCode,f.fsDivision);
    const normalized=normalizeManualDartAccounts(rows,f.periodEndDate);
    accounts={receiptNo:f.receiptNo,fsDivision:f.fsDivision,collectedAt:new Date().toISOString(),sources:normalized.accountSources};
   }catch(error){if(error instanceof CollectionExcluded&&!componentExcluded(error))throw error;if(error instanceof DartApiError&&(error.quotaExceeded||['DAILY_CALL_LIMIT','SCHEDULE_WINDOW_ENDED'].includes(error.code)))throw error;errors.accounts=error instanceof DartApiError?error.code:'ACCOUNTS_COMMUNICATION';}
  }

  if(accountsOnly)return {...saved,...(fiscalDuration?{fiscalDuration}:{}),...(accounts?{accounts}:{}),errors};
  try{if(!price){price=await historicalClose(symbol,f.periodEndDate,options.fetcher??fetch,market,mode);}}catch(error){if(error instanceof CollectionExcluded&&!componentExcluded(error))throw error;if(error instanceof DartApiError&&(error.quotaExceeded||['DAILY_CALL_LIMIT','SCHEDULE_WINDOW_ENDED'].includes(error.code)))throw error;const failure=error instanceof HistoricalPriceError?error:new HistoricalPriceError('HISTORICAL_PRICE_COMMUNICATION','COMMUNICATION');const descriptions={AUTH:'과거 종가 API 인증 오류',PERMISSION:'과거 종가 API 서비스 활용 권한 오류',PARSE:'과거 종가 응답 해석 오류',COMMUNICATION:'과거 종가 API 통신 오류',RATE_LIMIT:'과거 종가 API 호출 제한',PROVIDER:'과거 종가 공급자 응답 오류',NO_DATA:'해당 기간·종목의 과거 종가 조회 결과 없음',INTERNAL_LIMIT:'검증되지 않은 종목에 대한 내부 적용 제한'};errors.price=descriptions[failure.category];errors.priceCode=failure.code;errors.priceCategory=failure.category; if(failure.providerCode)errors.priceProviderCode=failure.providerCode;console.warn(JSON.stringify({event:'historical_price_failure',securityId:f.securityId.toString(),symbol,fiscalYear:f.fiscalYear,period:f.periodType,code:failure.code,category:failure.category,providerCode:failure.providerCode}));}
  let basis=saved.basis;
  if(price?.source==='KIS_KRX_UNADJUSTED_CLOSE'){
   const samePeriodEvidence=(p:NonNullable<Supplemental['price']>)=>p.periodBasis?.symbol===normalizeProviderSymbol(symbol)&&p.periodBasis.periodEnd===f.periodEndDate.toISOString().slice(0,10)&&p.periodBasis.disclosedAt===f.receiptDate.toISOString().slice(0,10)&&p.periodBasis.from===p.date&&p.periodBasis.method==='KIS_CONSTANT_ADJUSTMENT_FACTOR_NO_SPLIT_TO_DISCLOSURE';
   if(price.shareBasis!=='ORIGINAL_EQUALS_ADJUSTED'&&!samePeriodEvidence(price)){
    try{const verified=await kisHistoricalClose(normalizeProviderSymbol(symbol),f.periodEndDate,options.fetcher??fetch,f.receiptDate);
     if(verified?.value===price.value&&verified.date===price.date&&samePeriodEvidence(verified))price=verified;
    }catch(error){if(error instanceof CollectionExcluded&&!componentExcluded(error))throw error;errors.basis=error instanceof HistoricalPriceError?error.code:'PERIOD_SHARE_BASIS_VERIFICATION_FAILED';}
   }
   const exactShares=shares?.receiptNo===f.receiptNo,compatible=price.shareBasis==='ORIGINAL_EQUALS_ADJUSTED'||samePeriodEvidence(price);
   const ordinaryEps=accounts?.sources.basicEps?.ordinaryEpsVerified===true||(f.accountSources as Record<string,{ordinaryEpsVerified?:boolean}>|null)?.basicEps?.ordinaryEpsVerified===true||/보통|ordinary/i.test((f.accountSources as Record<string,{accountName?:string}>|null)?.basicEps?.accountName??accounts?.sources.basicEps?.accountName??'');
   basis={epsPriceCompatible:compatible&&exactShares&&(!shares?.preferred||ordinaryEps),bpsPriceCompatible:compatible&&exactShares&&bookValueShares(shares,f.receiptNo)!==null,source:samePeriodEvidence(price)?'KIS_PERIOD_END_TO_DISCLOSURE_FACTOR_WITH_EXACT_DART_SHARES':'KIS_ORIGINAL_ADJUSTED_CLOSE_COMPARISON_WITH_EXACT_DART_SHARES',verifiedAt:new Date().toISOString(),receiptNo:f.receiptNo,reason:compatible?'ORIGINAL_EQUALS_ADJUSTED_EXACT_RECEIPT_REQUIRED':'CORPORATE_ACTION_BASIS_UNCONFIRMED'};
  }
  if(price?.source==='KRX_UNADJUSTED_CLOSE'&&price.market&&(!basis||basis.receiptNo!==f.receiptNo||!basis.epsPriceCompatible||!basis.bpsPriceCompatible&&bookValueShares(shares,f.receiptNo)!==null)){
   try{
    const receiptDate=f.receiptDate.toISOString().slice(0,10).replaceAll('-','');
    const master=(await configuredKrx().rows(price.market as KrxMarket,receiptDate,'master')).find(row=>row.ISU_SRT_CD===normalizeProviderSymbol(symbol));
    const stable=!!master&&master.ISU_CD===price.isin&&master.KIND_STKCERT_TP_NM==='보통주'&&!!price.parValue&&master.PARVAL?.replaceAll(',','')===price.parValue&&!!price.listedShares&&master.LIST_SHRS?.replaceAll(',','')===price.listedShares;
    const ordinaryEps=accounts?.sources.basicEps?.ordinaryEpsVerified===true||(f.accountSources as Record<string,{ordinaryEpsVerified?:boolean}>|null)?.basicEps?.ordinaryEpsVerified===true||/보통|ordinary/i.test((f.accountSources as Record<string,{accountName?:string}>|null)?.basicEps?.accountName??accounts?.sources.basicEps?.accountName??'');
    const exactShares=shares?.receiptNo===f.receiptNo;
    basis={epsPriceCompatible:stable&&!!exactShares&&(!shares?.preferred||ordinaryEps),bpsPriceCompatible:stable&&!!exactShares&&bookValueShares(shares,f.receiptNo)!==null,source:'KRX_PERIOD_END_AND_DISCLOSURE_DATE_MASTER_WITH_DART_ORDINARY_SHARE_REPORT',verifiedAt:new Date().toISOString(),receiptNo:f.receiptNo,reason:!stable?'CORPORATE_ACTION_OR_MASTER_BASIS_UNCONFIRMED':shares?.preferred?'PREFERRED_EQUITY_ALLOCATION_OR_ORDINARY_EPS_LABEL_REQUIRED':!exactShares?'EXACT_RECEIPT_SHARE_REPORT_REQUIRED':'VERIFIED_NO_MASTER_SHARE_BASIS_CHANGE'};
   }catch(error){if(error instanceof CollectionExcluded&&!componentExcluded(error))throw error;basis=undefined;errors.basis=error instanceof HistoricalPriceError?error.code:'SHARE_BASIS_VERIFICATION_FAILED';}
  }
  if(price?.source==='KRX_UNADJUSTED_CLOSE'&&basis?.epsPriceCompatible!==true){
   try{const checked=await kisHistoricalClose(normalizeProviderSymbol(symbol),f.periodEndDate,options.fetcher??fetch,f.receiptDate);
    if(checked?.value===price.value&&checked.date===price.date&&(checked.shareBasis==='ORIGINAL_EQUALS_ADJUSTED'||checked.periodBasis?.method==='KIS_CONSTANT_ADJUSTMENT_FACTOR_NO_SPLIT_TO_DISCLOSURE')){
     const exact=shares?.receiptNo===f.receiptNo,ordinary=accounts?.sources.basicEps?.ordinaryEpsVerified===true||(f.accountSources as Record<string,{ordinaryEpsVerified?:boolean}>|null)?.basicEps?.ordinaryEpsVerified===true;
     price=checked;basis={receiptNo:f.receiptNo,epsPriceCompatible:!!exact&&(!shares?.preferred||ordinary),bpsPriceCompatible:!!exact&&bookValueShares(shares,f.receiptNo)!==null,source:'KIS_PERIOD_END_TO_DISCLOSURE_FACTOR_WITH_EXACT_DART_SHARES',verifiedAt:new Date().toISOString(),reason:'VERIFIED_PERIOD_SHARE_BASIS'};
    }
   }catch(error){if(error instanceof CollectionExcluded&&!componentExcluded(error))throw error;errors.basis=error instanceof HistoricalPriceError?error.code:'PERIOD_SHARE_BASIS_VERIFICATION_FAILED';}
  }
  return {...saved,...(fiscalDuration?{fiscalDuration}:{}),...(shares?{shares}:{}),...(price?{price}:{}),basis,...(accounts?{accounts}:{}),errors};
 };
}
