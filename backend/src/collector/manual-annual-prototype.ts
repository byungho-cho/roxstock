import { Prisma, type PrismaClient, type DartFinancialFiling } from '../generated/prisma/index.js';
import { calculatePeriod, metricKeys, type MetricValues, type Supplemental } from '../domain/period-valuation.js';
import { valueCompletion, type CollectionState } from '../domain/collection-status.js';
import { NaverAnnualError, NaverAnnualProvider, type NaverAnnual } from './naver-annual.js';
import { historicalClose } from './historical-close.js';
import { loadPeriodSupplement } from './valuation-supplement.js';
import { OpenDartProvider, DartApiError } from './dart-provider.js';
import { normalizeManualDartAccounts } from './manual-dart-accounts.js';
import { PrismaDartRepository } from './dart-repository.js';
import { getCfsThenOfs, parseDartDate, endOfFiscalPeriod } from './dart-collector.js';
import { getSeoulClock } from './time.js';

const version='MANUAL_ANNUAL_V1';
const safeCode=(e:unknown)=>e instanceof NaverAnnualError||e instanceof DartApiError?e.code:typeof e==='object'&&e&&'code' in e&&/^[A-Z0-9_]+$/.test(String(e.code))?String(e.code):'MANUAL_SUPPLEMENT_ERROR';
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const empty=()=>Object.fromEntries(metricKeys.map(k=>[k,null])) as MetricValues;
const financialComplete=(f:DartFinancialFiling|null)=>!!f&&[f.revenueYtd,f.operatingProfitYtd,f.netIncomeYtd,f.totalAssets,f.totalLiabilities,f.totalEquity].every(v=>v!=null);
type Security={id:bigint;symbol:string;marketType:string;dartCorpMapping:{corpCode:string}|null};

/** Reachable exclusively from a claimed MANUAL run; automatic collection never imports or calls this path. */
export async function refreshManualAnnual(db:PrismaClient,security:Security,year:number,provider:OpenDartProvider,naver:NaverAnnualProvider,repo:PrismaDartRepository,runId:bigint) {
 const currentYear=Number(getSeoulClock().dateKey.slice(0,4)),estimated=year===currentYear,periodType=estimated?'ESTIMATE':'ANNUAL';
 const where={securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year,periodType}};
 const existing=await db.periodValuation.findUnique({where}),oldSupplement=(existing?.supplemental??{}) as Supplemental&Record<string,unknown>;
 const startedAt=new Date().toISOString();
 await db.periodValuation.upsert({where,create:{securityId:security.id,fiscalYear:year,periodType,status:'PROCESSING',values:{},provenance:{},reasons:{},supplemental:json({manualAttempt:{runId:String(runId),version,startedAt,phase:'PROCESSING'}})},update:{supplemental:json({...oldSupplement,manualAttempt:{runId:String(runId),version,startedAt,phase:'PROCESSING'}})}});
 const errors:Record<string,string>={},reasons:Record<string,string>={};let source:NaverAnnual|undefined,filing:DartFinancialFiling|null=null,disclosureChecked=false;
 try{source=(await naver.annual(security.symbol)).find(r=>r.fiscalYear===year&&r.kind===(estimated?'ANNUAL_ESTIMATE':'FINAL_ANNUAL'));if(!source)reasons.source=estimated?'CONSENSUS_NOT_PROVIDED':'NAVER_YEAR_NOT_PROVIDED';}catch(e){errors.naver=safeCode(e);}
 let supplemental:Supplemental={...oldSupplement};
 let freshValues=source?{...source.values}:empty();
 if(freshValues.eps!=null&&Number(freshValues.eps)<=0)freshValues.per=null;
 if(freshValues.bps!=null&&Number(freshValues.bps)<=0)freshValues.pbr=null;
 let perMetric:Record<string,unknown>=source?Object.fromEntries(metricKeys.filter(k=>freshValues[k]!=null).map(k=>[k,{...source,values:undefined,financials:undefined,method:'COLLECTED',version,periodType:'ANNUAL'}])):{};
 if(!estimated){
  filing=await db.dartFinancialFiling.findFirst({where:{securityId:security.id,fiscalYear:year,periodType:'ANNUAL',isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]});
  disclosureChecked=!!filing;
  try{
   // Existing complete disclosures avoid broad list/refetch calls. Missing statements use normal shared-budget DART requests.
   if(!financialComplete(filing)){
    if(!security.dartCorpMapping)throw new DartApiError('DART_CORP_CODE_NOT_MAPPED','DART 기업코드가 없습니다.');
    const reports=await provider.listPeriodicReports(security.dartCorpMapping.corpCode,year);disclosureChecked=true;
    const report=reports.find(r=>r.reportCode==='11011'&&!r.withdrawn);
    if(!report)reasons.financials='NO_PERIODIC_FILING';
    else{
     const response=await getCfsThenOfs(provider,security.dartCorpMapping.corpCode,year,'11011');
     if(!response.rows.length)reasons.financials='FINANCIAL_ROWS_NOT_PUBLISHED';
     else{
      if(response.rows.some(r=>r.receiptNo!==report.receiptNo))throw new DartApiError('RECEIPT_MISMATCH','공시번호 불일치');
      await repo.saveFiling({securityId:security.id,fiscalYear:year,periodType:'ANNUAL',reportCode:'11011',fsDivision:response.division,receiptNo:report.receiptNo,reportName:report.reportName,receiptDate:parseDartDate(report.receiptDate),periodEndDate:endOfFiscalPeriod(year,'ANNUAL'),collectedAt:new Date(),values:normalizeManualDartAccounts(response.rows)});
      filing=await db.dartFinancialFiling.findFirst({where:{receiptNo:report.receiptNo}});
     }
    }
   }
  }catch(e){errors.financials=safeCode(e);}
  if(source&&filing&&source.division!==filing.fsDivision){errors.naver='NAVER_DART_DIVISION_MISMATCH';source=undefined;freshValues=empty();perMetric={};}
  try{
   if(!supplemental.price)supplemental.price=await historicalClose(security.symbol,new Date(`${year}-12-31`),fetch,security.marketType,'MANUAL_PROTOTYPE');
   if(source&&supplemental.price)for(const key of Object.keys(perMetric))perMetric[key]={...(perMetric[key] as object),priceDate:supplemental.price.date,calendarVerification:'ACTUAL_LAST_TRADING_DAY',verificationClose:supplemental.price};
  }catch(e){errors.price=safeCode(e);}
  if(filing&&!valueCompletion(freshValues).complete&&security.dartCorpMapping){
   try{
    supplemental=await loadPeriodSupplement(provider,security.symbol,security.dartCorpMapping.corpCode,undefined,security.marketType,'MANUAL_PROTOTYPE')(filing,supplemental);
    const previous=await db.dartFinancialFiling.findFirst({where:{securityId:security.id,fiscalYear:year-1,periodType:'ANNUAL',isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'}]});
    const calculated=calculatePeriod(filing,previous??undefined,supplemental);
    const calculationEvidence=(key:typeof metricKeys[number])=>({...calculated.provenance,method:key==='eps'?'COLLECTED_DART_ACCOUNT':'CALCULATED',manualVersion:version,formula:{eps:'DISCLOSED_ANNUAL_BASIC_ORDINARY_EPS',bps:'OWNERS_EQUITY / PERIOD_END_OUTSTANDING_ORDINARY_SHARES',per:'LAST_TRADING_DAY_CLOSE / ANNUAL_EPS',pbr:'LAST_TRADING_DAY_CLOSE / YEAR_END_BPS',roe:'ANNUAL_PROFIT / AVERAGE_PREVIOUS_AND_CURRENT_YEAR_END_EQUITY * 100'}[key],accountEvidence:{stored:filing!.accountSources,supplement:supplemental.accounts?.sources??null},sharesEvidence:supplemental.shares??null,financialInputs:{netIncome:filing!.netIncomeYtd?.toString()??null,equity:filing!.totalEquity?.toString()??null,previousEquity:previous?.totalEquity?.toString()??null}});
    if(filing.fsDivision==='CFS'&&calculated.provenance.roeBasis!=='OWNERS_OF_PARENT'){calculated.values.roe=null;calculated.reasons.roe='OWNERS_PROFIT_AND_AVERAGE_EQUITY_BASIS_UNCONFIRMED';}
    // A public-data close without verified share/adjustment evidence cannot unlock manual ratio calculations.
    if(supplemental.price?.source!=='KRX_UNADJUSTED_CLOSE'&&!supplemental.basis){calculated.values.per=null;calculated.values.pbr=null;calculated.reasons.per='PUBLIC_PRICE_SHARE_BASIS_UNCONFIRMED';calculated.reasons.pbr='PUBLIC_PRICE_SHARE_BASIS_UNCONFIRMED';}
    // Ratios use the same denominator group. A Naver denominator is never silently combined with DART/KRX.
    for(const [base,ratio] of [['eps','per'],['bps','pbr']] as const){
     if(freshValues[base]==null&&calculated.values[base]!=null){freshValues[base]=calculated.values[base];perMetric[base]=calculationEvidence(base);}
     if(freshValues[ratio]==null&&calculated.values[ratio]!=null&&freshValues[base]===calculated.values[base]&&!(base in perMetric&&source?.values[base]!=null)) {freshValues[ratio]=calculated.values[ratio];perMetric[ratio]=calculationEvidence(ratio);}
    }
    if(freshValues.roe==null&&calculated.values.roe!=null){freshValues.roe=calculated.values.roe;perMetric.roe=calculationEvidence('roe');}
    Object.assign(reasons,calculated.reasons);Object.assign(errors,supplemental.errors??{});
   }catch(e){errors.supplement=safeCode(e);}
  }
 }
 const completion=valueCompletion(freshValues),hasFresh=metricKeys.some(k=>freshValues[k]!=null),statementsComplete=financialComplete(filing);
 for(const k of metricKeys)if(freshValues[k]==null&&!completion.notApplicable[k])reasons[k]=reasons[k]??(estimated?'CONSENSUS_ITEM_NOT_PROVIDED':'REQUIRED_METRIC_UNAVAILABLE_AFTER_SUPPLEMENT');
 for(const k of metricKeys)if(freshValues[k]!=null)delete reasons[k];
 Object.assign(reasons,completion.notApplicable);
 const state:CollectionState=estimated?(completion.complete?'ESTIMATE_READY':Object.keys(errors).length?'FINAL_FAILED':hasFresh?'PARTIAL_ESTIMATE':'NOT_COLLECTED'):
  statementsComplete&&completion.complete?'COMPLETE':'FINAL_FAILED';
 const oldValues=(existing?.values??{}) as Partial<MetricValues>,values=empty(),oldProvenance=(existing?.provenance??{}) as Record<string,unknown>,replacements:Record<string,unknown>={};
 for(const k of metricKeys){
  values[k]=k in completion.notApplicable?null:freshValues[k]??oldValues[k]??null;
  if((freshValues[k]!=null||k in completion.notApplicable)&&oldValues[k]!=null&&values[k]!==oldValues[k])replacements[k]={before:oldValues[k],after:values[k],previousEvidence:(oldProvenance.perMetric as Record<string,unknown>|undefined)?.[k]??oldProvenance,reason:k in completion.notApplicable?'VERIFIED_NON_POSITIVE_DENOMINATOR':'VERIFIED_SOURCE_GROUP_OR_DISCLOSURE_VERSION_REFRESH',version};
  if(freshValues[k]==null&&oldValues[k]!=null)perMetric[k]=(oldProvenance.perMetric as Record<string,unknown>|undefined)?.[k]??oldProvenance;
 }
 for(const [base,ratio] of [['eps','per'],['bps','pbr']] as const)if(oldValues[ratio]!=null&&freshValues[ratio]==null&&!(ratio in completion.notApplicable)&&oldValues[base]!=null&&values[base]!==oldValues[base]){values[base]=oldValues[base]!;delete replacements[base];perMetric[base]=(oldProvenance.perMetric as Record<string,unknown>|undefined)?.[base]??oldProvenance;reasons[ratio]='NEW_DENOMINATOR_WITHOUT_MATCHING_RATIO_OLD_GROUP_PRESERVED';}
 const finishedAt=new Date().toISOString(),attempt={version,mode:'MANUAL_PROTOTYPE',runId:String(runId),startedAt,finishedAt,phase:'FINISHED',state,disclosureChecked,disclosureSource:filing?'STORED_DART_FILING':'DART_REQUEST',financialComplete:statementsComplete,valueComplete:completion.complete,notApplicable:completion.notApplicable,errors,reasons,replacements};
 const data={status:completion.complete?'SUCCESS':hasFresh?'PARTIAL':'FAILED',values:json(values),provenance:json({version,kind:estimated?'ANNUAL_ESTIMATE':'FINAL_ANNUAL',periodEnd:`${year}-12-31`,fsDivision:source?.division??filing?.fsDivision??null,roeBasis:(perMetric.roe as {roeBasis?:string}|undefined)?.roeBasis??((perMetric.roe as {source?:string}|undefined)?.source==='NAVER_FNGUIDE_ANNUAL'?'OWNERS_OF_PARENT':oldProvenance.roeBasis??null),perMetric}),reasons:json(reasons),supplemental:json({...supplemental,...(source?{manualSource:source}:{}),manualAttempt:attempt,manualHistory:[...((oldSupplement.manualHistory??[]) as unknown[]),...(oldSupplement.manualAttempt?[oldSupplement.manualAttempt]:[])].slice(-5),...(estimated&&source?{estimateFinancials:source.financials}:{} )}),attempts:{increment:1},nextAttemptAt:null};
 await db.periodValuation.update({where,data});
 if(estimated&&source&&hasFresh){
  await db.annualConsensusSnapshot.upsert({where:{securityId_fiscalYear_source_asOf:{securityId:security.id,fiscalYear:year,source:source.source,asOf:new Date(source.collectedAt)}},create:{securityId:security.id,fiscalYear:year,source:source.source,asOf:new Date(source.collectedAt),data:json(source)},update:{}});
 }
 return {fiscalYear:year,period:'ANNUAL' as const,status:(estimated?hasFresh:disclosureChecked)?'SUCCESS' as const:Object.keys(errors).length?'FAILED' as const:'NO_DATA' as const,created:false,valuationStatus:completion.complete?'SUCCESS':'FAILED',valuationErrors:errors,valuationReasons:reasons,collectionState:state,kind:estimated?'ANNUAL_ESTIMATE':'FINAL_ANNUAL',financialComplete:statementsComplete,disclosureChecked};
}
