import {createHash} from 'node:crypto';
import {Prisma} from '@roxstock/shared/prisma';
import {fiscalDurationMatches,metricKeys,type Supplemental} from '@roxstock/shared/domain/period-valuation';
import {financialCurrency} from '@roxstock/shared/domain/financial-currency';
import {supplementedFilings} from '@roxstock/shared/domain/financial-evidence';
import {valueCompletion} from '@roxstock/shared/domain/collection-status';
import {bookValueShares,periodEndBookShares} from '@roxstock/shared/domain/share-counts';
import {supplementStoredPeriod,supplementIdentityConflict} from './valuation-supplement.js';
import {financialRevenueReview} from './financial-revenue.js';
import {validateStoredDartRows} from './dart-filing-validation.js';
import type {DartFinancialRow} from './dart-provider.js';

export const fillFields=[...metricKeys,'revenue'] as const;
export type FillField=typeof fillFields[number];
export type FillTarget={symbol:string;year:number;period:'ANNUAL';receiptNo:string;fields:FillField[]};
export type FillState={security:any;filings:any[];valuations:any[]};
export type FillEvidence={symbol:string;receiptNo:string;supplemental:Supplemental;financialRows?:DartFinancialRow[]};
export const json=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v);
function canonical(value:any):any{return value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;}
export const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(JSON.parse(json(value))))).digest('hex');
export const fieldPlanFingerprint=(value:unknown)=>fingerprint(JSON.parse(json(value),(key,v)=>key==='calculatedAt'?undefined:v));
export function reviveModel(name:string,row:any){
 const result={...row};for(const f of Prisma.dmmf.datamodel.models.find(m=>m.name===name)!.fields){const value=result[f.name];if(value!=null){if(f.type==='DateTime')result[f.name]=new Date(value);if(f.type==='BigInt')result[f.name]=BigInt(value);if(f.type==='Decimal')result[f.name]=new Prisma.Decimal(value);}}return result;
}
/** RFC4180 quoting, bounded explicit DEVELOPMENT_WAIT scope; no all-security fallback. */
export function parseFillTargets(csv:string):FillTarget[]{
 const lines:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<csv.length;i++){const c=csv[i]!;if(c==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));if(row.some(Boolean))lines.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('CSV_UNCLOSED_QUOTE');if(cell||row.length){row.push(cell.replace(/\r$/,''));lines.push(row);}
 const headers=lines.shift()!.map(h=>h.replace(/^\uFEFF/,''));
 for(const key of ['symbol','fiscal_year','period','category','missing_fields','receipt_no'])if(!headers.includes(key))throw Error('CSV_HEADER_MISSING:'+key);
 const targets:FillTarget[]=[],seen=new Set<string>();
 for(const cells of lines){if(cells.length!==headers.length)throw Error('CSV_COLUMN_COUNT');const r=Object.fromEntries(headers.map((h,i)=>[h,cells[i]!]));if(r.category!=='DEVELOPMENT_WAIT')continue;
  if(!/^\d{6}$/.test(r.symbol!)||r.fiscal_year!=='2025'||r.period!=='ANNUAL'||!/^\d{14}$/.test(r.receipt_no!))throw Error('CSV_SCOPE_INVALID');
  const fields=r.missing_fields!.split('|');if(!fields.length||fields.some(k=>!fillFields.includes(k as FillField))||new Set(fields).size!==fields.length)throw Error('CSV_FIELD_INVALID');
  if(seen.has(r.symbol!))throw Error('CSV_DUPLICATE_TARGET');seen.add(r.symbol!);targets.push({symbol:r.symbol!,year:2025,period:'ANNUAL',receiptNo:r.receipt_no!,fields:fields as FillField[]});
 }if(!targets.length)throw Error('CSV_EMPTY_SCOPE');return targets.sort((a,b)=>a.symbol.localeCompare(b.symbol));
}
function evidenceConflict(f:any,s:Supplemental){
 if(supplementIdentityConflict(f,s))return 'COMMON_SOURCE_IDENTITY_MISMATCH';
 if(!s.accounts||!f.accountSources)return 'COMMON_ORIGINAL_EVIDENCE_MISSING';
 const numeric=(v:unknown)=>typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v)?new Prisma.Decimal(v):null;
 let anchors=0;
 for(const key of ['totalAssets','totalLiabilities','totalEquity','netIncome','revenue']){
  const a=f.accountSources[key],b=s.accounts.sources[key];
  const old=numeric(a?.amount??a?.ytdAmount),candidate=numeric(b?.amount??b?.ytdAmount);
  if(old&&candidate){if(!old.eq(candidate))return 'COMMON_ACCOUNT_ANCHOR_CONFLICT';anchors++;}
 }
 if(anchors<3)return 'COMMON_ACCOUNT_ANCHORS_INSUFFICIENT';
 for(const entry of Object.values(s.accounts.sources))for(const v of [entry.amount,entry.ytdAmount])if(v!=null&&!numeric(v))return 'ACCOUNT_AMOUNT_UNVERIFIED';
 const a=numeric(s.accounts.sources.totalAssets?.amount),l=numeric(s.accounts.sources.totalLiabilities?.amount),e=numeric(s.accounts.sources.totalEquity?.amount);
 if(a&&l&&e&&!a.eq(l.plus(e)))return 'BALANCE_NOT_RECONCILED';
 return null;
}
/** Replays the production calculator without network or writes. Evidence files stay private. */
export async function planFinancialFill(target:FillTarget,state:FillState,evidence:FillEvidence|undefined){
 const security=state.security,filings=state.filings.map(f=>reviveModel('DartFinancialFiling',f)).sort((a,b)=>b.receiptDate-a.receiptDate||b.collectedAt-a.collectedAt||b.receiptNo.localeCompare(a.receiptNo)),valuations=state.valuations.map(v=>reviveModel('PeriodValuation',v));
 const filing=filings.filter(f=>f.fiscalYear===target.year&&f.periodType===target.period&&!f.isWithdrawn).sort((a,b)=>b.receiptDate-a.receiptDate||b.collectedAt-a.collectedAt||b.receiptNo.localeCompare(a.receiptNo))[0];
 const old=valuations.find(v=>v.fiscalYear===target.year&&v.periodType===target.period)??null;
 const before=fingerprint(state),projected=filing?supplementedFilings([filing],old?[old]:[])[0]:null;
 let reason=!security||security.symbol!==target.symbol||security.securityType!=='STOCK'||security.collectionExcluded||security.codeRevision&&filing?.collectionSymbol!==target.symbol?'SECURITY_SCOPE_CHANGED':!filing||filing.receiptNo!==target.receiptNo?'LATEST_FILING_CHANGED':!evidence||evidence.symbol!==target.symbol||evidence.receiptNo!==target.receiptNo?'EVIDENCE_MISSING':null;
 let supplemental=structuredClone(evidence?.supplemental??{});
 if(!reason)reason=evidenceConflict(filing,supplemental);
 if(!reason&&evidence?.financialRows){try{validateStoredDartRows(evidence.financialRows,filing,security.dartCorpMapping?.corpCode,filing.fsDivision);const review=financialRevenueReview(evidence.financialRows);if(review.state==='MAPPED')supplemental.accounts!.sources.revenue=review.source;}catch{reason='FINANCIAL_ROWS_IDENTITY_CONFLICT';}}
 if(!reason&&old?.supplemental){
  const saved=old.supplemental as Supplemental;
  if(supplementIdentityConflict(filing,saved))reason='EXISTING_SUPPLEMENT_SOURCE_CONFLICT';
  else {
   const incoming=supplemental.shares,stored=saved.shares;
   const enrichShares=!bookValueShares(stored,filing.receiptNo)&&periodEndBookShares(incoming,filing)&&(!stored?.outstanding||stored.outstanding===incoming?.outstanding)&&(!stored?.collectedAt||Date.parse(incoming?.collectedAt??'')>=Date.parse(stored.collectedAt));
   supplemental={...supplemental,...saved,...(enrichShares?{shares:incoming}:{}),accounts:{...supplemental.accounts!,...saved.accounts,sources:{...supplemental.accounts!.sources,...saved.accounts?.sources}}};
  }
 }
 const noWrite=()=>{throw Error('DRY_RUN_WRITE_ATTEMPT');};
 const db:any={security:{findMany:async()=>[],findUnique:async()=>reviveModel('Security',security)},dartFinancialFiling:{findFirst:async(q:any)=>filings.find(f=>q.where.id?String(f.id)===String(q.where.id):f.fiscalYear===q.where.fiscalYear&&f.periodType===(q.where.periodType??target.period))??null},periodValuation:{findUnique:async(q:any)=>valuations.find(v=>v.fiscalYear===q.where.securityId_fiscalYear_periodType.fiscalYear)??null,upsert:noWrite,update:noWrite},dartShareSnapshot:{upsert:noWrite,create:noWrite},$executeRaw:noWrite};
 const candidate:any=reason?null:await supplementStoredPeriod(db,BigInt(security.id),target.year,target.period,{dryRun:true,fillOnly:true,fields:target.fields.filter(k=>k!=='revenue'),load:async(f,saved)=>f?.receiptNo===target.receiptNo?supplemental:saved});
 if(candidate?.candidateReview)reason=candidate.candidateReview.code;
 const fields=target.fields.map(field=>{
  const current=field==='revenue'?projected?.revenueYtd?.toString()??null:old?.values?.[field]??null;
  let value=field==='revenue'?supplemental.accounts?.sources.revenue?.ytdAmount??supplemental.accounts?.sources.revenue?.amount??null:candidate?.values?.[field]??null;
  let hold=reason??candidate?.reasons?.[field]??'SOURCE_EVIDENCE_INSUFFICIENT';
  if(!reason&&!['EPS_NON_POSITIVE','BPS_NON_POSITIVE'].includes(hold)&&['eps','roe','per'].includes(field)&&!fiscalDurationMatches(filing,supplemental.fiscalDuration)){value=null;hold='FISCAL_DURATION_UNVERIFIED';}
  if(!reason&&(field==='per'||field==='pbr')&&value!=null){const base=field==='per'?'eps':'bps',baseEvidence=old?.provenance?.perMetric?.[base]??old?.provenance;if(old?.values?.[base]!=null&&(baseEvidence?.receiptNo!==filing.receiptNo||baseEvidence?.fsDivision!==filing.fsDivision||baseEvidence?.periodEnd!==filing.periodEndDate.toISOString().slice(0,10))){value=null;hold='EXISTING_DENOMINATOR_SOURCE_UNVERIFIED';}}
  const metricSource=candidate?.provenance?.perMetric?.[field]??candidate?.provenance;
  if(field!=='revenue'&&!reason&&current==null&&value!=null&&(metricSource?.receiptNo!==filing.receiptNo||metricSource?.fsDivision!==filing.fsDivision||metricSource?.periodEnd!==filing.periodEndDate.toISOString().slice(0,10))){value=null;hold='CANDIDATE_SOURCE_IDENTITY_MISMATCH';}
  if(field==='revenue'&&!reason&&(!evidence?.financialRows?.length||financialRevenueReview(evidence.financialRows).state!=='MAPPED')){value=null;hold='FINANCIAL_REVENUE_POLICY_REVIEW';}
  const disposition=current!=null?'PRESERVE_EXISTING':reason?'HOLD':['EPS_NON_POSITIVE','BPS_NON_POSITIVE'].includes(hold)?'NOT_APPLICABLE':value!=null?'SAVE':'HOLD';
  return {field,current,candidate:value,disposition,reason:disposition==='PRESERVE_EXISTING'?'EXISTING_VALUE_PROTECTED':disposition==='SAVE'?'VERIFIED_SAME_PERIOD':hold,source:field==='revenue'?supplemental.accounts?.sources.revenue:candidate?.provenance?.perMetric?.[field]??null};
 });
 // A plan contains only allowed additions. Preserve existing per-field evidence verbatim.
 const values={...(old?.values??{})},perMetric={...(old?.provenance?.perMetric??{})};
 for(const f of fields.filter(f=>f.disposition==='SAVE'&&f.field!=='revenue')){values[f.field]=f.candidate;perMetric[f.field]=f.source;}
 for(const key of metricKeys)values[key]??=null;
 const completion=valueCompletion(values,filing?financialCurrency(filing):'KRW');
 const added=fields.filter(f=>f.disposition==='SAVE').map(f=>f.field);
 const needed=new Set<string>(added.flatMap(k=>k==='revenue'?['revenue']:k==='eps'||k==='per'?['basicEps','parentNetIncome']:k==='bps'||k==='pbr'?['parentEquity','totalEquity']:['netIncome','parentNetIncome','totalEquity','parentEquity','openingTotalEquity','openingParentEquity']));
 const storedSupplement=old?.supplemental??{};
 const sources={...Object.fromEntries(Object.entries(supplemental.accounts?.sources??{}).filter(([key])=>needed.has(key))),...(storedSupplement.accounts?.sources??{})};
 const proposedSupplement=added.some(k=>k!=='revenue')?{...storedSupplement,...supplemental}:{...storedSupplement};
 proposedSupplement.accounts={...supplemental.accounts,...storedSupplement.accounts,sources};
 const data=added.length?{values,status:completion.complete?'SUCCESS':'PARTIAL',provenance:{...(old?.provenance??candidate?.provenance??{}),perMetric},reasons:{...(old?.reasons??{}),...completion.notApplicable},supplemental:proposedSupplement}:null;
 if(data){for(const f of fields.filter(f=>f.disposition==='SAVE'))delete data.reasons[f.field];}
 return {target,before,fields,data,old:old?JSON.parse(json(old)):null,expectedSaves:fields.filter(f=>f.disposition==='SAVE').length};
}
