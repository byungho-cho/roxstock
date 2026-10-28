/** The editor and collector use the same period/field contract. No prices from today enter period ratios. */
export const objectValue=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
export const securityDataFields=[
 ['eps','EPS','value','direct'],['bps','BPS','value','direct'],['roe','ROE','value','direct'],['per','PER','value','direct'],['pbr','PBR','value','direct'],
 ['dividendPerShare','주당배당금','value','direct'],['dividendYield','배당수익률','value','calculated'],['marketCap','시가총액','value','calculated'],
 ['parentNetIncome','지배주주순손익','value','direct'],['openingEquity','전기 자본','value','readonly'],['issuedShares','발행주식수','value','direct'],['treasuryShares','자기주식수','value','direct'],['outstandingShares','유통주식수','value','calculated'],
 ['revenueQuarter','매출액 · 분기','financial','direct'],['revenueYtd','매출액 · 누적','financial','direct'],['operatingProfitQuarter','영업이익 · 분기','financial','direct'],['operatingProfitYtd','영업이익 · 누적','financial','direct'],['netIncomeQuarter','당기순이익 · 분기','financial','direct'],['netIncomeYtd','당기순이익 · 누적','financial','direct'],['totalAssets','자산총계','financial','direct'],['totalLiabilities','부채총계','financial','direct'],['totalEquity','자본총계','financial','direct'],['operatingCashFlowQuarter','영업현금흐름 · 분기','financial','direct'],['operatingCashFlowYtd','영업현금흐름 · 누적','financial','direct'],['capitalExpenditureQuarter','설비투자 · 분기','financial','direct'],['capitalExpenditureYtd','설비투자 · 누적','financial','direct'],
] as const;
export function completedQuarters(now=new Date()){
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now),year=Number(date.slice(0,4)),quarter=Math.floor((Number(date.slice(5,7))-1)/3)+1;
 return Array.from({length:4},(_,i)=>{const n=year*4+quarter-5+i,y=Math.floor(n/4),q=n%4+1;return {year:y,quarter:q,periodType:q===4?'ANNUAL':`Q${q}`,label:`${y}년 ${q}분기`};});
}
export const editableCurrentPeriod=(year:number,period:string,now=new Date())=>completedQuarters(now).some(q=>q.year===year&&q.periodType===period);
export function validateManualNumber(field:string,value:unknown){
 const spec=securityDataFields.find(f=>f[0]===field);if(!spec||spec[3]!=='direct')throw Error('FIELD_NOT_EDITABLE');
 if(typeof value!=='string'||! /^-?\d{1,24}(?:\.\d{1,4})?$/.test(value))throw Error('INVALID_NUMBER');
 if(['issuedShares','treasuryShares'].includes(field)&&(!/^\d+$/.test(value)||value.length>20))throw Error('INVALID_SHARE_COUNT');
 if(['per','pbr','dividendPerShare','totalAssets','totalLiabilities'].includes(field)&&value.startsWith('-'))throw Error('NEGATIVE_NOT_ALLOWED');
 return value;
}
export function securityDataUnit(field:string,currency:string|null|undefined){
 if(['roe','dividendYield'].includes(field))return '%';
 if(['per','pbr'].includes(field))return '배';
 if(['issuedShares','treasuryShares','outstandingShares'].includes(field))return '주';
 return currency==='KRW'?'원':currency??'';
}
/** Explicit, period-local manual basis. Never infer a fiscal period from the calendar quarter. */
export function validateSecurityDataBasis(value:unknown,year:number,quarter:number){
 const b=objectValue(value),start=String(b.periodStart??''),end=String(b.periodEnd??'');
 const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!validDate(start)||!validDate(end))throw Error('INVALID_BASIS_DATES');
 const days=(Date.parse(end)-Date.parse(start))/86400000+1,months=quarter*3;
 if(days<months*28-7||days>months*31+7||Number(start.slice(0,4))<year-1||Number(end.slice(0,4))>year+1||Number(start.slice(0,4))>year||Number(end.slice(0,4))<year||start>end)throw Error('INVALID_FISCAL_DURATION');
 if(!['CFS','OFS'].includes(b.fsDivision)||!['KRW','USD','CNY','JPY','EUR'].includes(b.currency)||b.shareClass!=='COMMON'||b.kind!=='ACTUAL'||b.amountMultiplier!=='1'||b.receiptNo!==null)throw Error('INVALID_BASIS');
 return {receiptNo:null,fsDivision:String(b.fsDivision),periodStart:start,periodEnd:end,currency:String(b.currency),amountMultiplier:'1',shareClass:'COMMON',kind:'ACTUAL'};
}
export function protectManualWrite(previous:unknown,incoming:Record<string,any>){
 const before=objectValue(previous),saved=objectValue(before.supplemental),manual=objectValue(saved.manualFields);
 if(!Object.keys(manual).length&&!saved.manualBasis)return incoming;
 if(objectValue(incoming.supplemental).manualEditRevision===(saved.manualEditRevision??0)+1)return incoming;
 const next:Record<string,any>={...incoming,supplemental:{...objectValue(incoming.supplemental),manualFields:manual,manualBasis:saved.manualBasis,manualEditRevision:saved.manualEditRevision,lastManualEditAt:saved.lastManualEditAt}};
 if(incoming.supplemental===undefined)next.supplemental={...saved,manualFields:manual};
 if(incoming.values){next.values={...incoming.values};for(const key of ['eps','bps','per','pbr','roe'])if(manual[key])next.values[key]=manual[key].value;}
 if(incoming.provenance){next.provenance={...incoming.provenance,perMetric:{...objectValue(incoming.provenance.perMetric)}};for(const key of ['eps','bps','per','pbr','roe'])if(manual[key])next.provenance.perMetric[key]={...manual[key],source:'MANUAL'};}
 if(incoming.values&&Object.entries(manual).some(([key,v])=>incoming.values[key]!=null&&incoming.values[key]!==objectValue(v).value))next.supplemental.manualConflict={at:new Date().toISOString(),reason:'AUTOMATIC_VALUE_CONFLICT_MANUAL_PRESERVED'};
 return next;
}
/** Public, bounded projection of the new run's result; provider payloads and credentials stay private. */
export function publicSecurityDataResult(value:unknown){
 const d=objectValue(value);if(d.phase!=='SECURITY_DATA'||!['SUCCESS','FAILED','SKIPPED','UNRESOLVED'].includes(d.outcome))return null;
 return {outcome:String(d.outcome),partial:d.partial===true,financialStored:d.financialStored===true,fiscalYear:Number.isInteger(d.fiscalYear)&&d.fiscalYear>=2015&&d.fiscalYear<=9999?d.fiscalYear:null,periodType:['ANNUAL','Q1','Q2','Q3'].includes(d.periodType)?String(d.periodType):null,receiptNo:typeof d.receiptNo==='string'&&/^\d{14}$/.test(d.receiptNo)?d.receiptNo:null};
}
