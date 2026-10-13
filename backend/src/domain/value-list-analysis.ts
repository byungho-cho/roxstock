import {Prisma,type PeriodValuation,type DartFinancialFiling} from '../generated/prisma/index.js';
import {fairPrice,weight,type StoredValuation,mergeStatements} from './value-analysis.js';
import {selectStoredAnalysis} from './stored-analysis.js';
const ExactDecimal=Prisma.Decimal.clone({precision:60});
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const dec=(v:unknown)=>typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v)?new Prisma.Decimal(v):null;
type Input=Parameters<typeof selectStoredAnalysis>[0];
export function shareholderTotals(metric:StoredValuation|null,row:PeriodValuation|undefined,filings:DartFinancialFiling[]){
 const unavailable=(reason:string)=>({excessEarnings:null,shareholderValue:null,rimReason:reason,rimBasis:null,rimComparison:null});
 if(!metric||!row)return unavailable('RIM 계산에 사용한 기간별 원천 근거가 없습니다.');
 if(metric.rimCompatible===false)return unavailable('기존 RIM 가격의 자기자본·ROE 기준이 확인되지 않았습니다.');
 const p=obj(row.provenance),per=obj(p.perMetric),bpsEvidence=obj(per.bps??p),roeEvidence=obj(per.roe??p);
 // A same-provider annual estimate proves parent equity + annual ROE without inventing a BPS denominator.
 // Totals do not require shares. The per-share reconciliation stays null until that independent input is known.
 const supplement=obj(row.supplemental),sourceEstimate=obj(supplement.manualSource),sourceFinancials=obj(sourceEstimate.financials),estimatedFinancials=obj(supplement.estimateFinancials),sourceValues=obj(sourceEstimate.values);
 if(row.periodType==='ESTIMATE'&&sourceEstimate.source==='NAVER_FNGUIDE_ANNUAL'){
  const parent=dec(estimatedFinancials.parentEquity),sourceParent=dec(sourceFinancials.parentEquity),roe=dec(metric.roe),sourceRoe=dec(sourceValues.roe);
  const confirmed=sourceEstimate.kind==='ANNUAL_ESTIMATE'&&sourceEstimate.fiscalYear===row.fiscalYear&&sourceEstimate.division==='CFS'&&p.fsDivision==='CFS'&&p.roeBasis==='OWNERS_OF_PARENT'&&p.periodEnd===`${row.fiscalYear}-12-31`&&roeEvidence.source===sourceEstimate.source&&roeEvidence.kind===sourceEstimate.kind&&roeEvidence.fiscalYear===row.fiscalYear&&roeEvidence.division==='CFS'&&parent!==null&&sourceParent!==null&&parent.eq(sourceParent)&&roe!==null&&sourceRoe!==null&&roe.eq(sourceRoe);
  if(!confirmed)return unavailable('연간 추정 지배주주자본·ROE의 원천 값·연도·연결·소유주 귀속 기준을 확인할 수 없습니다.');
  const capital=new ExactDecimal(parent.toString()),excess=capital.mul(new ExactDecimal(roe.toString()).div(100).minus('0.08')),total=capital.plus(excess.mul('0.8').div('0.08'));
  const reason='제공처 BPS의 수정 기말 주식수 분모가 확인되지 않아 주당 가치·W0.8 대조는 계산하지 않습니다. 표시 보통주 수로 대체하지 않습니다.';
  return {excessEarnings:excess.toString(),shareholderValue:total.toString(),rimReason:null,rimShareReason:reason,rimBasis:{year:row.fiscalYear,period:'ESTIMATE',division:'CFS',receiptNo:null,periodEnd:p.periodEnd,equity:capital.toString(),shares:null,shareClass:null,sharePolicy:'PROVIDER_ADJUSTED_DENOMINATOR_UNVERIFIED',source:sourceEstimate.source,collectedAt:sourceEstimate.collectedAt,isEstimated:true,equityAttribution:'OWNERS_OF_PARENT',roeBasis:'ANNUAL_ESTIMATE_OWNERS_OF_PARENT'},rimComparison:{perShare:null,existingW08:fairPrice(metric,'0.8'),difference:null,matchesAtStoredPrecision:false,reason}};
 }
 if(bpsEvidence.source!=='OPEN_DART'||roeEvidence.source!=='OPEN_DART')return unavailable('제공처 BPS의 수정 주식수·주식 종류 분모를 확인할 수 없습니다.');
 const f=filings.find(f=>!f.isWithdrawn&&f.periodType==='ANNUAL'&&f.fiscalYear===row.fiscalYear&&f.receiptNo===bpsEvidence.receiptNo);
 if(!f||roeEvidence.receiptNo!==f.receiptNo||bpsEvidence.periodEnd!==f.periodEndDate.toISOString().slice(0,10)||roeEvidence.periodEnd!==bpsEvidence.periodEnd||bpsEvidence.fsDivision!==f.fsDivision||roeEvidence.fsDivision!==f.fsDivision)return unavailable('자기자본·BPS·ROE의 연간 기간·접수번호·연결/별도 기준이 일치하지 않습니다.');
 const expected=f.fsDivision==='CFS'?'OWNERS_EQUITY_DIV_PERIOD_END_OUTSTANDING_NO_PREFERRED':'OFS_TOTAL_EQUITY_DIV_PERIOD_END_OUTSTANDING_NO_PREFERRED';
 if(bpsEvidence.bpsBasis!==expected||roeEvidence.roeBasis!==(f.fsDivision==='CFS'?'OWNERS_OF_PARENT':'TOTAL_SAME_DIVISION'))return unavailable('BPS와 ROE의 소유주 귀속·보통주 자본 기준이 확인되지 않았습니다.');
 const supplemental=obj(row.supplemental),shares=obj(bpsEvidence.sharesEvidence??supplemental.shares),accounts=obj(supplemental.accounts);
 if(shares.receiptNo!==f.receiptNo||bpsEvidence.sharesReceiptNo!==f.receiptNo||shares.preferred!==false)return unavailable('동일 공시의 우선주 없는 보통주 유통주식수 근거가 없습니다.');
 const n=dec(shares.outstanding),source=obj(f.accountSources),parent=dec(obj(source.parentEquity).amount)??(accounts.receiptNo===f.receiptNo&&accounts.fsDivision===f.fsDivision?dec(obj(obj(accounts.sources).parentEquity).amount):null);
 const equity=f.fsDivision==='CFS'?parent:f.totalEquity,roe=dec(metric.roe),bps=dec(metric.bps);
 if(!n?.gt(0)||equity==null||roe==null||bps==null)return unavailable('검증된 자기자본·ROE·BPS·동일 기준 주식수가 누락되었습니다.');
 // Stored ratios are rounded to four decimals. Compare at that existing storage precision.
 const capital=new ExactDecimal(equity.toString()),shareCount=new ExactDecimal(n.toString());
 if(!capital.div(shareCount).toDecimalPlaces(4).eq(bps.toDecimalPlaces(4).toString()))return unavailable('원천 자본/주식수와 저장 BPS가 불일치합니다. 기존 가격은 변경하지 않습니다.');
 const excess=capital.mul(new ExactDecimal(roe.toString()).div(100).minus('0.08')),total=capital.plus(excess.mul('0.8').div('0.08')),perShare=total.div(shareCount),existing=dec(fairPrice(metric,'0.8'));
 const difference=existing?perShare.minus(existing.toString()):null;
 return {excessEarnings:excess.toString(),shareholderValue:total.toString(),rimReason:null,rimBasis:{year:f.fiscalYear,period:'ANNUAL',division:f.fsDivision,receiptNo:f.receiptNo,periodEnd:bpsEvidence.periodEnd,equity:equity.toString(),shares:n.toString(),shareClass:'COMMON',sharePolicy:'PERIOD_END_OUTSTANDING_NO_PREFERRED',source:'OPEN_DART'},rimComparison:{perShare:perShare.toString(),existingW08:existing?.toString()??null,difference:difference?.toString()??null,matchesAtStoredPrecision:difference!==null&&difference.abs().lte('0.0001'),reason:difference?.eq(0)?null:difference!==null&&difference.abs().lte('0.0001')?'저장 BPS 반올림 정밀도 내의 차이입니다. 기존 적정주가를 보존합니다.':'원천 자기자본/주식수와 반올림된 저장 BPS의 가격 차이입니다. 기존 적정주가를 보존하며 값을 대조해야 합니다.'}};
}
export function selectValueListAnalysis(input:Input){
 const {year,periods,metrics,filings,manual,price}=input;
 const hasValues=(r:PeriodValuation)=>Object.values(obj(r.values)).some(v=>dec(v)!==null)||Object.values(obj(obj(r.supplemental).estimateFinancials)).some(v=>dec(v)!==null);
 const estimates=periods.filter(r=>r.fiscalYear===year&&r.periodType==='ESTIMATE'&&hasValues(r)&&obj(obj(r.supplemental).manualSource).kind==='ANNUAL_ESTIMATE'&&obj(obj(r.supplemental).manualSource).fiscalYear===year);
 const estimate=estimates[0],final=periods.find(r=>r.fiscalYear===year-1&&r.periodType==='ANNUAL'&&hasValues(r));
 const annual=mergeStatements(manual,filings.filter(f=>f.periodType==='ANNUAL')).find(r=>r.fiscalYear===year-1&&[r.revenue,r.netIncome,r.totalEquity].some(v=>v!==null));
 // A December 31 date alone does not prove annual rather than Q4 data.
 const legacy=annual?metrics.find(r=>r.metricDate.toISOString().slice(0,10)===`${year-1}-12-31`&&[r.eps,r.bps,r.roe].some(v=>v!==null)):undefined;
 const priority=estimate?1:final||annual||legacy?2:3,chosen=estimate??final,basisYear=priority===1?year:year-1;
 const selected=selectStoredAnalysis({...input,year:basisYear,periods:chosen?[chosen]:[],metrics:legacy&&!chosen?[legacy]:[]});
 let metric:StoredValuation|null=null;
 if(priority!==3){
  const values=obj(chosen?.values),p=obj(chosen?.provenance);
  metric=chosen?{...selected.metric,kind:priority===1?'ANNUAL_ESTIMATE':'FINAL_ANNUAL',fiscalYear:basisYear,periodType:priority===1?'ESTIMATE':'ANNUAL',provenance:chosen.provenance,metricDate:p.periodEnd??`${basisYear}-12-31`,eps:values.eps??null,bps:values.bps??null,per:values.per??null,pbr:values.pbr??null,roe:values.roe??null,rimCompatible:p.fsDivision==='OFS'||p.roeBasis==='OWNERS_OF_PARENT'}:selected.metric;
 }
 const totals=shareholderTotals(metric,chosen,filings as DartFinancialFiling[]);
 const capital=priority===3?null:(selected.capitalYear===basisYear||priority===1&&selected.capitalYear===year-1)?selected.capital:null,capitalBasis=capital===null?null:selected.capitalBasis;
 const source=chosen?obj(chosen.provenance).source??(Array.from(new Set(Object.values(obj(obj(chosen.provenance).perMetric)).map(v=>obj(v).source).filter(Boolean))).join('/')||'저장 자료'):legacy?'LEGACY_STORED':annual?.basis??null;
 const targetPrice=fairPrice(metric,'0.8'),w=weight(metric,price),epsYield=metric?.eps!=null&&price!==null&&new Prisma.Decimal(price).gt(0)?new Prisma.Decimal(metric.eps).div(price).mul(100).toString():null;
 const missingReasons={...selected.missingReasons,eps:metric?.eps==null?'NOT_PROVIDED':null,roe:metric?.roe==null?'NOT_PROVIDED':null,targetPrice:targetPrice===null?'RIM_BASIS_UNCONFIRMED':null,capital:capital===null?'NOT_PROVIDED':null,w:w===null?'VALUATION_MISSING':null};
 const metricBasis={...selected.metricBasis,year:basisYear,period:priority===1?'ESTIMATE':priority===2?'ANNUAL':'NONE',label:priority===1?`${year}E`:priority===2?`${year-1}년 결산`:`${year}년 유효 자료 없음`,isEstimated:priority===1,source};
 return {...selected,metric,eps:metric?.eps??null,roe:metric?.roe??null,targetPrice,w,value:w,epsYield,missingReasons,netIncome:priority===3?null:selected.netIncome,netIncomeBasis:priority===3?null:selected.netIncomeBasis,capital,capitalBasis,capitalYear:capitalBasis?.year??null,metricBasis,...totals,dataPriority:priority,dataColor:priority===1?'#C8FF9E':priority===2?'#FFD96E':'#BDC3CC',basisText:`${metricBasis.label} · ${priority===1?'연간 추정':priority===2?'연간 결산':'미표시'} · ${capitalBasis?`자본 ${capitalBasis.year}년 결산`:'자본 기준 미확인'} · ${source??'출처 없음'}`,notices:[priority===3?'선택 연도의 연간 추정 또는 직전 연도의 연간 결산 자료가 없습니다. 반기·분기만 있는 종목은 기본 목록에서 제외합니다.':'최근 수집 실패 여부와 무관하게 기존 유효 연간 자료를 표시합니다.',totals.rimReason??'주주가치 총액은 동일 공시·동일 주식수·연결/별도 기준으로 계산합니다.',...(totals.rimComparison?.reason?[totals.rimComparison.reason]:[])]};
}
export function orderValueGroups<T extends {dataPriority:number;w:string|null;symbol:string;id:string}>(rows:T[]){return [...rows].sort((a,b)=>a.dataPriority-b.dataPriority||(a.w===null?b.w===null?0:1:b.w===null?-1:new Prisma.Decimal(b.w).cmp(a.w))||a.symbol.localeCompare(b.symbol)||a.id.localeCompare(b.id));}
