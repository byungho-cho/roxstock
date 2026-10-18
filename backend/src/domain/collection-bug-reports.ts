import {reconcileForeignSourceReports} from '@roxstock/shared/collection/foreign-source-reports';
import {preListingPriceReviewMatches} from '@roxstock/shared/domain/listing-period';
import {createHash} from 'node:crypto';
import type {PrismaClient,DartFinancialFiling} from '@roxstock/shared/prisma';
import {valueCompletion} from '@roxstock/shared/domain/collection-status';
import type {MetricValues} from '@roxstock/shared/domain/period-valuation';
import {fiscalDurationMatches,type Supplemental} from '@roxstock/shared/domain/period-valuation';
import {productPolicy} from '@roxstock/shared/domain/product-policy';
export type BugEvent={sourceKey:string;feature:string;code:string;severity:'ERROR'|'WARNING';summary:string;observedAt:Date;securityId?:bigint;symbol?:string;fiscalYear?:number;periodType?:string;runId?:bigint;metric?:string};
const heldFinancialWarning=(event:{feature:string;code:string;severity:string})=>event.feature==='dart-financial-statements'&&event.severity==='WARNING'&&(/^(PERIOD_|DART_REVIEW_)/.test(event.code)||event.code==='DART_SOURCE_REVIEW'||event.code==='KIS_FUNDAMENTAL_NO_DATA'||sharedPriceCause(event.code));
/** Policy exclusions retain their history; actual storage/network and market-price errors remain visible. */
export async function reconcileHeldProductReportsPage(db:PrismaClient,after?:string){
 const rows=await db.collectionBugOccurrence.findMany({where:{resolvedAt:null,securityId:{not:null},report:{feature:'dart-financial-statements',severity:'WARNING'},...(after?{eventKey:{gt:after}}:{})},include:{report:true},orderBy:{eventKey:'asc'},take:50});let resolved=0;
 for(const e of rows){if(!e.report||!heldFinancialWarning(e.report))continue;
  resolved+=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM collection_bug_reports WHERE id=${e.reportId!} FOR UPDATE`;
   const security=await tx.security.findUnique({where:{id:e.securityId!},select:{securityType:true}});
   if(!productPolicy(security?.securityType).held)return 0;
   const changed=await tx.collectionBugOccurrence.updateMany({where:{eventKey:e.eventKey,resolvedAt:null},data:{resolvedAt:new Date(),resolution:'PRODUCT_FINANCIAL_HOLD'}});
   if(!await tx.collectionBugOccurrence.count({where:{reportId:e.reportId,resolvedAt:null}}))await tx.collectionBugReport.updateMany({where:{id:e.reportId!,state:{not:'RESOLVED'}},data:{state:'RESOLVED',resolvedAt:new Date()}});
   return changed.count;
  });
 }
 return {scanned:rows.length,resolved,cursor:rows.at(-1)?.eventKey,hasNext:rows.length===50};
}
let heldProductCursor:string|undefined;
export function financialItemPeriod(symbol:string){
 const match=/^([A-Z0-9]{6}):(\d{4}):(ANNUAL|Q[123])$/.exec(symbol);
 if(!match||Number(match[2])<2015||Number(match[2])>2200)return;
 return {symbol:match[1]!,fiscalYear:Number(match[2]),periodType:match[3]!};
}
/** Recover only the exact source occurrence; do not infer periods from nearby failures. */
export async function repairFinancialOccurrencePeriodsPage(db:PrismaClient,after?:string){
 const events=await db.collectionBugOccurrence.findMany({where:{resolvedAt:null,securityId:{not:null},runId:{not:null},report:{feature:'dart-financial-statements'},OR:[{fiscalYear:null},{periodType:null}],...(after?{eventKey:{gt:after}}:{})},orderBy:{eventKey:'asc'},take:50});let changed=0;
 for(const e of events){
  const items=await db.collectorRunItem.findMany({where:{runId:e.runId!,securityId:e.securityId!,status:'FAILED',OR:[{createdAt:e.observedAt},{observedAt:e.observedAt}]},take:30});
  const item=items.find(i=>hash('item:'+i.id+':'+(i.observedAt&&i.observedAt>i.createdAt?i.observedAt:i.createdAt).toISOString())===e.eventKey),period=item&&financialItemPeriod(item.symbol);
  if(!period||e.fiscalYear!=null&&e.fiscalYear!==period.fiscalYear||e.periodType!=null&&e.periodType!==period.periodType)continue;
  changed+=(await db.collectionBugOccurrence.updateMany({where:{eventKey:e.eventKey,securityId:e.securityId,runId:e.runId,fiscalYear:e.fiscalYear,periodType:e.periodType},data:period})).count;
 }
 return {scanned:events.length,changed,cursor:events.at(-1)?.eventKey,hasNext:events.length===50};
}
let financialPeriodCursor:string|undefined;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const sharedPriceCause=(code:string)=>code==='PERIOD_PRICE_BASIS_UNCONFIRMED'||/^(KIS|HISTORICAL|KRX)_PRICE_/.test(code);
const reportFingerprint=(feature:string,code:string,metric?:string)=>hash(feature+':'+code+':'+(sharedPriceCause(code)?'':metric??''));
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
export const safeBugCode=(v:unknown,fallback='COLLECTION_FAILED')=>typeof v==='string'&&/^(?:(?:KIS|DART|HISTORICAL|SHARES|ACCOUNTS|VALUATION|SUPPLEMENT|MANUAL|HTTP|TASK|DAILY|SOURCE|COLLECTION|SCHEDULE|API|KRX|NAVER|PRICE|PERIOD|DATABASE|DB|PRISMA)_[A-Z0-9_]{1,60}|[0-9]{3})$/.test(v)?v:fallback;
const reviewReasons:Record<string,string>={CLOSING_MONTH_CHANGED:'결산월·결산주기 확인 필요',CLOSING_MONTH_UNAVAILABLE:'결산월 근거 부족',MULTIPLE_ANNUAL_PERIODS:'연중 복수 결산기간 확인 필요',CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION:'정정공시 원본 검증 필요',CORRECTION_RELATION_UNVERIFIED:'정정공시 관계 확인 필요'};
export function collectionFailureDetails(item:{diagnostics:unknown;message:string|null}){
 const d=object(item.diagnostics),fromMessage=(item.message??'').split(/[:·\s]+/).map(v=>safeBugCode(v,'')).find(Boolean);
 if(item.message==='NO_FUNDAMENTAL_DATA')return {code:'KIS_FUNDAMENTAL_NO_DATA',severity:'WARNING' as const,summary:'추가 재무지표 원천 미제공 · 자료 확인 대기'};
 const code=safeBugCode(d.originalCode??d.code??d.errorCode??fromMessage);
 if(code==='DART_SOURCE_REVIEW'){
  const reason=typeof d.validationResult==='string'&&/^[A-Z][A-Z0-9_]{1,60}$/.test(d.validationResult)?d.validationResult:null;
  return {code:reason?'DART_REVIEW_'+reason:code,severity:'WARNING' as const,summary:reason?reviewReasons[reason]??'공시 원천 검증 보류':'공시 원천 검증 보류 · 기간·정정 관계 확인 필요'};
 }
 return {code,severity:'ERROR' as const,summary:'수집 항목 처리 실패 · 원천 응답 또는 저장 처리 확인 필요'};
}
const featureOf=(job:string)=>job.startsWith('investor')?'investor-trends':['VALUATION_SUPPLEMENT','foreign-currency-recovery'].includes(job)?'dart-financial-statements':job==='daily-account-snapshots'?'account-snapshots':job==='realtime-selected-prices'?'realtime-prices':job;
/** A first-pass DART calculation is not an attempted shares/price supplementation. */
export function periodIssueAttempted(row:{status:string;supplemental:unknown;values:unknown},metric:string){
 const s=object(row.supplemental),errors=object(s.errors),v=object(row.values);
 const attempted=Boolean(s.collectionAttempt||s.manualAttempt||s.automaticAttempt||row.status==='FAILED');
 if(metric==='per'&&v.eps==null||metric==='pbr'&&v.bps==null)return false;
 if(metric==='per'||metric==='pbr')return attempted||Boolean(s.price||errors.priceCode||errors.price);
 if(metric==='bps')return attempted||Boolean(s.shares||errors.sharesCode||errors.shares);
 return attempted||Boolean(s.accounts||errors.accounts||(metric==='eps'&&s.kisAnnual));
}
const durationIssueAttempted=(supplemental:unknown)=>{const s=object(supplemental);return Boolean(s.collectionAttempt||s.manualAttempt||s.automaticAttempt||s.fiscalDuration||object(s.errors).durationCode);};
/** Recheck current evidence, bounded by occurrence key. History and replay identity are retained. */
export async function reconcileBugReportsPage(db:PrismaClient,after?:string){
 const rows=await db.collectionBugOccurrence.findMany({where:{resolvedAt:null,report:{code:{in:['PERIOD_EPS_MISSING','PERIOD_BPS_MISSING','PERIOD_PER_MISSING','PERIOD_PBR_MISSING','PERIOD_ROE_MISSING','PERIOD_PRICE_BASIS_UNCONFIRMED','KIS_PRICE_NO_DATA','PERIOD_PRICE_BEFORE_LISTING','DART_REVIEW_FISCAL_DURATION_UNVERIFIED','DART_REVIEW_CLOSING_MONTH_CHANGED','DART_REVIEW_CLOSING_MONTH_UNAVAILABLE','DART_REVIEW_MULTIPLE_ANNUAL_PERIODS','DART_REVIEW_CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION']}},...(after?{eventKey:{gt:after}}:{})},include:{report:true},orderBy:{eventKey:'asc'},take:50});
 let resolved=0;
 for(const e of rows){
  const closingReview=['DART_REVIEW_CLOSING_MONTH_CHANGED','DART_REVIEW_CLOSING_MONTH_UNAVAILABLE','DART_REVIEW_MULTIPLE_ANNUAL_PERIODS','DART_REVIEW_CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION'].includes(e.report!.code);
  let receiptPeriod:{fiscalYear:number;periodType:DartFinancialFiling['periodType'];receiptNo:string}|undefined;
  if(e.securityId!=null&&e.runId!=null&&(closingReview||e.fiscalYear==null||e.periodType==null)){
   const items=await db.collectorRunItem.findMany({where:{runId:e.runId,securityId:e.securityId,status:'FAILED',OR:[{createdAt:e.observedAt},{observedAt:e.observedAt}]},take:30});
   const item=items.find(i=>hash('item:'+i.id+':'+(i.observedAt&&i.observedAt>i.createdAt?i.observedAt:i.createdAt).toISOString())===e.eventKey),d=object(item?.diagnostics);
   const period=({'11011':'ANNUAL','11013':'Q1','11012':'Q2','11014':'Q3'} as Record<string,string>)[d.reportCode];
   if(closingReview&&typeof d.selectedReceiptNo==='string'&&/^\d{14}$/.test(d.selectedReceiptNo)){
    const filing=await db.dartFinancialFiling.findUnique({where:{receiptNo:d.selectedReceiptNo}});
    if(filing&&!filing.isWithdrawn&&filing.securityId===e.securityId){
     const actual=await db.periodValuation.findUnique({where:{securityId_fiscalYear_periodType:{securityId:e.securityId,fiscalYear:filing.fiscalYear,periodType:filing.periodType}}});
     const p=object(actual?.provenance);
     if(actual&&actual.updatedAt>=e.observedAt&&p.receiptNo===filing.receiptNo&&p.periodEnd===filing.periodEndDate.toISOString().slice(0,10)&&fiscalDurationMatches(filing,(actual.supplemental as Supplemental|null)?.fiscalDuration))receiptPeriod={fiscalYear:filing.fiscalYear,periodType:filing.periodType,receiptNo:filing.receiptNo};
    }
   }
   if((e.fiscalYear==null||e.periodType==null)&&Number.isInteger(d.taskFiscalYear)&&period){e.fiscalYear=d.taskFiscalYear;e.periodType=period;await db.collectionBugOccurrence.update({where:{eventKey:e.eventKey},data:{fiscalYear:e.fiscalYear,periodType:e.periodType}});}
  }
  if(e.securityId==null||!receiptPeriod&&(e.fiscalYear==null||e.periodType==null))continue;
  const periodWhere={securityId:e.securityId,fiscalYear:receiptPeriod?.fiscalYear??e.fiscalYear!,periodType:receiptPeriod?.periodType??e.periodType!};
  const current=await db.periodValuation.findUnique({where:{securityId_fiscalYear_periodType:periodWhere}});
  if(!current||current.updatedAt<e.observedAt)continue;
  const values=object(current.values),provenance=object(current.provenance),code=e.report!.code;
  let resolution:string|undefined;
  let publicSourceVerified=false;
  if(closingReview&&provenance.receiptNo&&provenance.periodEnd){
   const filing=await db.dartFinancialFiling.findUnique({where:{receiptNo:String(provenance.receiptNo)}});
   const proof=object(object(filing?.sourceValidation).publicDocument);
   if(filing&&!filing.isWithdrawn&&filing.securityId===e.securityId&&filing.fiscalYear===e.fiscalYear&&filing.periodType===e.periodType&&filing.periodEndDate.toISOString().slice(0,10)===provenance.periodEnd&&proof.method==='DART_PUBLIC_STATEMENT_BALANCE_RECONCILED'&&fiscalDurationMatches(filing,proof.fiscalDuration as Supplemental['fiscalDuration'])&&fiscalDurationMatches(filing,(current.supplemental as Supplemental|null)?.fiscalDuration))publicSourceVerified=true;
  }
  if(['per','pbr'].includes(e.metric??'')&&preListingPriceReviewMatches(object(current.supplemental).priceAvailability,{symbol:current.collectionSymbol,receiptNo:provenance.receiptNo,periodEnd:provenance.periodEnd}))resolution='PRICE_PERIOD_PRE_LISTING';
  else if(publicSourceVerified)resolution='PUBLIC_DISCLOSURE_VERIFIED';
  else if(receiptPeriod&&provenance.receiptNo===receiptPeriod.receiptNo)resolution='RECEIPT_FISCAL_PERIOD_VERIFIED';
  else if(e.metric&&values[e.metric]!=null)resolution='METRIC_FILLED';
  else if(code==='DART_REVIEW_FISCAL_DURATION_UNVERIFIED'&&!durationIssueAttempted(current.supplemental))resolution='SUPPLEMENT_NOT_ATTEMPTED';
  else if(e.metric&&!periodIssueAttempted(current,e.metric))resolution=['per','pbr'].includes(e.metric)&&values[e.metric==='per'?'eps':'bps']==null?'UPSTREAM_METRIC_REVIEW':'SUPPLEMENT_NOT_ATTEMPTED';
  else if(e.metric==='per'&&values.eps!=null&&Number(values.eps)===0)resolution='ZERO_DENOMINATOR_NOT_APPLICABLE';
  else if(e.metric==='pbr'&&values.bps!=null&&Number(values.bps)===0)resolution='ZERO_DENOMINATOR_NOT_APPLICABLE';
  else if(code==='DART_REVIEW_FISCAL_DURATION_UNVERIFIED'&&['DART_MAJOR_ACCOUNTS_MATCH','DART_PUBLIC_FILING_ACCOUNTS_MATCH'].includes(provenance.fiscalDuration?.method)&&provenance.calculationState!=='FISCAL_DURATION_REVIEW_REQUIRED')resolution='FISCAL_DURATION_VERIFIED';
  else if(e.metric&&['eps','per','roe'].includes(e.metric)&&provenance.calculationState==='FISCAL_DURATION_REVIEW_REQUIRED'){for(const event of periodBugEvents(current))await saveBugEvent(db,event);resolution='SUPERSEDED_BY_FISCAL_DURATION_REVIEW';}
  else if(['DART_REVIEW_CLOSING_MONTH_CHANGED','DART_REVIEW_CLOSING_MONTH_UNAVAILABLE','DART_REVIEW_MULTIPLE_ANNUAL_PERIODS'].includes(code)&&provenance.receiptNo&&provenance.periodEnd)resolution='RECEIPT_PERIOD_VERIFIED';
  if(!resolution)continue;
  // Both evidence version and occurrence state are checked inside the transaction.
  resolved+=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM collection_bug_reports WHERE id=${e.reportId!} FOR UPDATE`;
   const latest=await tx.periodValuation.findUnique({where:{securityId_fiscalYear_periodType:periodWhere},select:{updatedAt:true}});
   if(latest?.updatedAt.getTime()!==current.updatedAt.getTime())return 0;
   const changed=await tx.collectionBugOccurrence.updateMany({where:{eventKey:e.eventKey,resolvedAt:null},data:{resolvedAt:new Date(),resolution}});
   if(!await tx.collectionBugOccurrence.count({where:{reportId:e.reportId,resolvedAt:null}}))await tx.collectionBugReport.updateMany({where:{id:e.reportId!,state:{not:'RESOLVED'}},data:{state:'RESOLVED',resolvedAt:new Date()}});
   return changed.count;
  });
 }
 return {scanned:rows.length,resolved,cursor:rows.at(-1)?.eventKey,hasNext:rows.length===50};
}
let reconcileCursor:string|undefined;
let foreignSourceCursor:string|undefined;
/** Only allowlisted diagnostic codes and typed context are stored; never provider bodies or error text. */
export function periodBugEvents(row:{securityId:bigint;fiscalYear:number;periodType:string;status:string;values:unknown;reasons:unknown;supplemental:unknown;attempts:number;updatedAt:Date;collectionSymbol?:string|null;provenance?:unknown}):BugEvent[]{
 if(object(row.provenance).calculationState==='FISCAL_DURATION_REVIEW_REQUIRED'&&!durationIssueAttempted(row.supplemental))return [];
 if(object(row.provenance).calculationState==='FISCAL_DURATION_REVIEW_REQUIRED')return [{sourceKey:'period:'+row.securityId+':'+row.fiscalYear+':'+row.periodType+':'+row.attempts+':fiscal-duration',feature:'dart-financial-statements',code:'DART_REVIEW_FISCAL_DURATION_UNVERIFIED',severity:'WARNING',summary:'실제 회계기간 길이 확인 필요 · 연환산 지표 계산 보류',observedAt:row.updatedAt,securityId:row.securityId,fiscalYear:row.fiscalYear,periodType:row.periodType}];
 if(row.status==='SUCCESS'||valueCompletion(object(row.values) as Partial<MetricValues>).complete)return [];
 const values=object(row.values),reasons=object(row.reasons),errors=object(object(row.supplemental).errors);
 const beforeListing=preListingPriceReviewMatches(object(row.supplemental).priceAvailability,{symbol:row.collectionSymbol,receiptNo:object(row.provenance).receiptNo,periodEnd:object(row.provenance).periodEnd});
 const keys=['eps','bps','per','pbr','roe'].filter(k=>!(object(row.provenance).conversionRequired===true&&['per','pbr'].includes(k))&&!(beforeListing&&['per','pbr'].includes(k))&&values[k]==null&&periodIssueAttempted(row,k)&&!((k==='per'&&values.eps!=null&&Number(values.eps)<=0)||(k==='pbr'&&values.bps!=null&&Number(values.bps)<=0)));
 if(!keys.length)return [];
 return keys.map(metric=>{
  const reason=String(reasons[metric]??'');
  const code=safeBugCode(errors[metric+'Code']??(metric==='per'||metric==='pbr'?errors.priceCode:undefined),/기준.*미확인|액면분할/.test(reason)?'PERIOD_PRICE_BASIS_UNCONFIRMED':'PERIOD_'+metric.toUpperCase()+'_MISSING');
  return {sourceKey:'period:'+row.securityId+':'+row.fiscalYear+':'+row.periodType+':'+row.attempts+':'+metric+':'+code,feature:'dart-financial-statements',code,severity:row.status==='FAILED'?'ERROR':'WARNING',summary:metric.toUpperCase()+' 보완 미완료 · 동일 기간 자료 또는 계산 기준 확인 필요',observedAt:row.updatedAt,securityId:row.securityId,symbol:row.collectionSymbol??undefined,fiscalYear:row.fiscalYear,periodType:row.periodType,metric};
 });
}
export async function saveBugEvent(db:PrismaClient,event:BugEvent){
 const eventKey=hash(event.sourceKey),fingerprint=reportFingerprint(event.feature,event.code,event.metric);
 return db.$transaction(async tx=>{
  if(event.securityId!=null&&heldFinancialWarning(event)){
   const security=await tx.security.findUnique({where:{id:event.securityId},select:{securityType:true}});
   if(productPolicy(security?.securityType).held)return false;
  }
  const inserted=await tx.collectionBugOccurrence.createMany({data:{eventKey,observedAt:event.observedAt,securityId:event.securityId,symbol:event.symbol&&/^[A-Z0-9]{6}$/.test(event.symbol)?event.symbol:null,fiscalYear:event.fiscalYear,periodType:event.periodType,runId:event.runId,metric:event.metric},skipDuplicates:true});
  if(!inserted.count){
   // Reclassify legacy generic occurrences without creating another occurrence or replay count.
   await tx.$queryRaw`SELECT event_key FROM collection_bug_occurrences WHERE event_key=${eventKey} FOR UPDATE`;
   const current=await tx.collectionBugOccurrence.findUnique({where:{eventKey},include:{report:true}});
   if(!current?.report||current.report.code!=='COLLECTION_FAILED'||event.code==='COLLECTION_FAILED')return false;
   const old=current.report;
   await tx.$queryRaw`SELECT id FROM collection_bug_reports WHERE id=${old.id} FOR UPDATE`;
   const target=await tx.collectionBugReport.upsert({where:{fingerprint},create:{fingerprint,feature:event.feature,code:event.code,severity:event.severity,summary:event.summary,occurrences:1,firstSeenAt:event.observedAt,lastSeenAt:event.observedAt,state:old.state,reviewNote:old.reviewNote,resolvedAt:old.resolvedAt},update:{occurrences:{increment:1}}});
   await tx.collectionBugOccurrence.update({where:{eventKey},data:{reportId:target.id}});
   const range=await tx.collectionBugOccurrence.aggregate({where:{reportId:target.id},_min:{observedAt:true},_max:{observedAt:true}});
   await tx.collectionBugReport.update({where:{id:target.id},data:{firstSeenAt:range._min.observedAt!,lastSeenAt:range._max.observedAt!}});
   const left=await tx.collectionBugOccurrence.count({where:{reportId:old.id}});
   if(!left)await tx.collectionBugReport.delete({where:{id:old.id}});
   else{const remaining=await tx.collectionBugOccurrence.aggregate({where:{reportId:old.id},_min:{observedAt:true},_max:{observedAt:true}});await tx.collectionBugReport.update({where:{id:old.id},data:{occurrences:left,firstSeenAt:remaining._min.observedAt!,lastSeenAt:remaining._max.observedAt!}});}
   return true;
  }
  const report=await tx.collectionBugReport.upsert({where:{fingerprint},create:{fingerprint,feature:event.feature,code:event.code,severity:event.severity,summary:event.summary,occurrences:1,firstSeenAt:event.observedAt,lastSeenAt:event.observedAt},update:{occurrences:{increment:1}}});
  await tx.collectionBugReport.updateMany({where:{id:report.id,firstSeenAt:{gt:event.observedAt}},data:{firstSeenAt:event.observedAt}});
  await tx.collectionBugReport.updateMany({where:{id:report.id,lastSeenAt:{lt:event.observedAt}},data:{lastSeenAt:event.observedAt}});
  if(event.severity==='ERROR'&&report.severity!=='ERROR')await tx.collectionBugReport.update({where:{id:report.id},data:{severity:'ERROR'}});
  if(report.state==='RESOLVED'&&(!report.resolvedAt||event.observedAt>report.resolvedAt))await tx.collectionBugReport.update({where:{id:report.id},data:{state:'OPEN',resolvedAt:null}});
  // A new occurrence leaves the reviewed backlog so a fresh incident stays visible.
  if(report.state==='REVIEWING'&&event.observedAt>report.lastSeenAt)await tx.collectionBugReport.update({where:{id:report.id},data:{state:'OPEN',resolvedAt:null}});
  await tx.collectionBugOccurrence.update({where:{eventKey},data:{reportId:report.id}});return true;
 });
}
/** Coalesce PER/PBR warnings caused by the same price evidence, retaining every event key. */
export async function consolidateBugReportsPage(db:PrismaClient,after?:bigint){
 const reports=await db.collectionBugReport.findMany({where:{...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},take:20});let moved=0;
 for(const old of reports){if(!sharedPriceCause(old.code))continue;const fingerprint=reportFingerprint(old.feature,old.code);if(old.fingerprint===fingerprint)continue;
  moved+=await db.$transaction(async tx=>{
   const target=await tx.collectionBugReport.upsert({where:{fingerprint},create:{fingerprint,feature:old.feature,code:old.code,severity:old.severity,summary:'과거 종가·주식 기준 확인 필요 · PER/PBR 공통 원인',state:old.state,reviewNote:old.reviewNote,resolvedAt:old.resolvedAt,firstSeenAt:old.firstSeenAt,lastSeenAt:old.lastSeenAt},update:{}});
   // Differing human review notes must never be silently truncated or discarded.
   if(old.reviewNote&&target.reviewNote&&old.reviewNote!==target.reviewNote)return 0;
   if(old.reviewNote&&!target.reviewNote)await tx.collectionBugReport.update({where:{id:target.id},data:{reviewNote:old.reviewNote}});
   const ids=await tx.collectionBugOccurrence.findMany({where:{reportId:old.id},select:{eventKey:true},take:50});
   const changed=await tx.collectionBugOccurrence.updateMany({where:{reportId:old.id,eventKey:{in:ids.map(e=>e.eventKey)}},data:{reportId:target.id}});
   for(const id of [old.id,target.id]){
    const range=await tx.collectionBugOccurrence.aggregate({where:{reportId:id},_count:{_all:true},_min:{observedAt:true},_max:{observedAt:true}});
    if(!range._count._all){await tx.collectionBugReport.deleteMany({where:{id}});continue;}
    const active=await tx.collectionBugOccurrence.count({where:{reportId:id,resolvedAt:null}});
    await tx.collectionBugReport.update({where:{id},data:{occurrences:range._count._all,firstSeenAt:range._min.observedAt!,lastSeenAt:range._max.observedAt!,...(active?{state:target.state==='REVIEWING'||old.state==='REVIEWING'?'REVIEWING':'OPEN',resolvedAt:null}:{state:'RESOLVED',resolvedAt:target.resolvedAt??new Date()})}});
   }
   return changed.count;
  });
 }
 return {moved,cursor:reports.at(-1)?.id,hasNext:reports.length===20};
}
let consolidationCursor:bigint|undefined;
/** Bounded legacy repair. Exact source hashes preserve occurrence identity and counts. */
export async function reclassifyBugReportsPage(db:PrismaClient,after?:string){
 await db.collectionBugReport.updateMany({where:{severity:'ERROR',OR:[{code:'DART_SOURCE_REVIEW'},{code:{startsWith:'DART_REVIEW_'}}]},data:{severity:'WARNING'}});
 const events=await db.collectionBugOccurrence.findMany({where:{report:{code:'COLLECTION_FAILED'},...(after?{eventKey:{gt:after}}:{})},orderBy:{eventKey:'asc'},take:50,include:{report:{select:{feature:true}}}});let changed=0;
 for(const e of events){if(!e.runId)continue;
  const items=await db.collectorRunItem.findMany({where:{runId:e.runId,status:'FAILED',securityId:e.securityId,OR:[{createdAt:e.observedAt},{observedAt:e.observedAt}]},take:30});
  const item=items.find(i=>hash('item:'+i.id+':'+(i.observedAt&&i.observedAt>i.createdAt?i.observedAt:i.createdAt).toISOString())===e.eventKey);
  if(!item)continue;const classification=collectionFailureDetails(item);if(classification.code==='COLLECTION_FAILED')continue;
  if(await saveBugEvent(db,{sourceKey:'item:'+item.id+':'+e.observedAt.toISOString(),feature:e.report!.feature,...classification,observedAt:e.observedAt,securityId:e.securityId??undefined,runId:e.runId,symbol:e.symbol??undefined}))changed++;
 }
 return {scanned:events.length,changed,cursor:events.at(-1)?.eventKey,hasNext:events.length===50};
}
let legacyRepairCursor:string|undefined;
/** Replay a small overlap; durable occurrence keys prevent duplicate counts and deleted reports resurfacing. */
export async function scanCollectionBugs(db:PrismaClient,now=new Date()){
 const foreign=await reconcileForeignSourceReports(db,foreignSourceCursor);foreignSourceCursor=foreign.hasNext?foreign.cursor:undefined;
 const periods=await repairFinancialOccurrencePeriodsPage(db,financialPeriodCursor);financialPeriodCursor=periods.hasNext?periods.cursor:undefined;
 const held=await reconcileHeldProductReportsPage(db,heldProductCursor);heldProductCursor=held.hasNext?held.cursor:undefined;
 const state=await db.collectionBugScanState.upsert({where:{key:'collection-errors'},create:{key:'collection-errors',scannedAt:now},update:{}});
 const repaired=await reclassifyBugReportsPage(db,legacyRepairCursor);legacyRepairCursor=repaired.hasNext?repaired.cursor:undefined;
 const consolidated=await consolidateBugReportsPage(db,consolidationCursor);consolidationCursor=consolidated.hasNext?consolidated.cursor:undefined;
 const since=new Date(state.scannedAt.getTime()-300000);let count=repaired.changed;
 let after:{updatedAt:Date;securityId:bigint;fiscalYear:number;periodType:string}|undefined;
 for(;;){
  const seek=after?{OR:[{updatedAt:{gt:after.updatedAt}},{updatedAt:after.updatedAt,securityId:{gt:after.securityId}},{updatedAt:after.updatedAt,securityId:after.securityId,fiscalYear:{gt:after.fiscalYear}},{updatedAt:after.updatedAt,securityId:after.securityId,fiscalYear:after.fiscalYear,periodType:{gt:after.periodType}}]}:{};
  const rows=await db.periodValuation.findMany({where:{AND:[{updatedAt:{gte:since,lte:now},status:{not:'SUCCESS'}},seek]},orderBy:[{updatedAt:'asc'},{securityId:'asc'},{fiscalYear:'asc'},{periodType:'asc'}],take:100});
  for(const row of rows)for(const event of periodBugEvents(row))if(await saveBugEvent(db,event))count++;
  if(rows.length<100)break;after=rows.at(-1)!;
 }
 for(let skip=0;;skip+=100){
  const items=await db.collectorRunItem.findMany({where:{OR:[{createdAt:{gte:since,lte:now}},{observedAt:{gte:since,lte:now}}],status:'FAILED'},include:{run:{select:{jobType:true,provider:true}}},orderBy:[{createdAt:'asc'},{id:'asc'}],skip,take:100});
  for(const item of items){const observedAt=item.observedAt&&item.observedAt>item.createdAt?item.observedAt:item.createdAt;const classification=collectionFailureDetails(item),itemPeriod=featureOf(item.run.jobType)==='dart-financial-statements'?financialItemPeriod(item.symbol):undefined;if(await saveBugEvent(db,{sourceKey:'item:'+item.id+':'+observedAt.toISOString(),feature:featureOf(item.run.jobType),...classification,observedAt,securityId:item.securityId??undefined,symbol:itemPeriod?.symbol??item.symbol,runId:item.runId,fiscalYear:itemPeriod?.fiscalYear??(Number.isInteger(object(item.diagnostics).taskFiscalYear)?object(item.diagnostics).taskFiscalYear:undefined),periodType:itemPeriod?.periodType??({'11011':'ANNUAL','11013':'Q1','11012':'Q2','11014':'Q3'} as Record<string,string>)[object(item.diagnostics).reportCode]}))count++;}
  if(items.length<100)break;
 }
 for(let skip=0;;skip+=100){
  const runs=await db.collectorRun.findMany({where:{finishedAt:{gte:since,lte:now},status:{in:['FAILED','PARTIAL']}},include:{items:{where:{status:'FAILED'},take:1,select:{id:true}}},orderBy:[{finishedAt:'asc'},{id:'asc'}],skip,take:100});
  for(const run of runs){const m=object(run.metadata);const results=Array.isArray(m.results)?m.results:[];let emitted=false;
   for(const result of results)for(const source of ['dart','valuation']){const task=object(object(result.tasks)[source]);if(task.state!=='FAILED')continue;emitted=true;const code=safeBugCode(task.code);if(await saveBugEvent(db,{sourceKey:'run:'+run.id+':'+result.fiscalYear+':'+result.period+':'+source,feature:featureOf(run.jobType),code,severity:code==='DART_SOURCE_REVIEW'?'WARNING':'ERROR',summary:code==='DART_SOURCE_REVIEW'?'공시 원천 검증 보류':(source==='dart'?'재무제표':'가치지표')+' 수집 요청 실패',observedAt:run.finishedAt!,securityId:/^\d+$/.test(String(m.securityId))?BigInt(m.securityId):undefined,symbol:m.symbol,fiscalYear:Number.isInteger(result.fiscalYear)?result.fiscalYear:undefined,periodType:['ANNUAL','Q1','Q2','Q3'].includes(result.period)?result.period:undefined,runId:run.id}))count++;}
   if(!emitted&&!run.items.length&&(run.status==='FAILED'||run.failureCount>0)){const code=safeBugCode(run.failureReason);if(await saveBugEvent(db,{sourceKey:'run:'+run.id,feature:featureOf(run.jobType),code,severity:'ERROR',summary:'수집 작업 실행 실패 · 작업 기록 확인 필요',observedAt:run.finishedAt!,runId:run.id}))count++;}
  }
  if(runs.length<100)break;
 }
 for(let skip=0;;skip+=100){
  const rows=await db.realtimeCollectorIssue.findMany({where:{occurredAt:{gte:since,lte:now}},orderBy:[{occurredAt:'asc'},{id:'asc'}],skip,take:100});
  for(const issue of rows)if(await saveBugEvent(db,{sourceKey:'realtime:'+issue.id,feature:'realtime-prices',code:'PRICE_REALTIME_'+(/^[A-Z_]{1,20}$/.test(issue.stage)?issue.stage:'REQUEST')+'_FAILED',severity:'ERROR',summary:'실시간 주가 수집·저장 처리 오류',observedAt:issue.occurredAt,symbol:issue.symbol??undefined}))count++;
  if(rows.length<100)break;
 }
 const reconciled=await reconcileBugReportsPage(db,reconcileCursor);reconcileCursor=reconciled.hasNext?reconciled.cursor:undefined;
 await db.collectionBugScanState.updateMany({where:{key:'collection-errors',scannedAt:{lt:now}},data:{scannedAt:now}});return count;
}
export function startCollectionBugReporter(db:PrismaClient,onError:()=>void){
 let pending:Promise<unknown>|undefined,stopped=false;
 const tick=()=>{if(stopped||pending)return;pending=scanCollectionBugs(db).catch(onError).finally(()=>{pending=undefined;});};
 tick();const timer=setInterval(tick,60000);timer.unref();
 return async()=>{stopped=true;clearInterval(timer);await pending;};
}
