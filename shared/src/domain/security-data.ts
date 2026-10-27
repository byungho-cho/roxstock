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
 return value;
}
export function protectManualWrite(previous:unknown,incoming:Record<string,any>){
 const before=objectValue(previous),saved=objectValue(before.supplemental),manual=objectValue(saved.manualFields);
 if(!Object.keys(manual).length)return incoming;
 if(objectValue(incoming.supplemental).manualEditRevision===(saved.manualEditRevision??0)+1)return incoming;
 const next:Record<string,any>={...incoming,supplemental:{...objectValue(incoming.supplemental),manualFields:manual,manualBasis:saved.manualBasis,manualEditRevision:saved.manualEditRevision,lastManualEditAt:saved.lastManualEditAt}};
 if(incoming.supplemental===undefined)next.supplemental={...saved,manualFields:manual};
 if(incoming.values){next.values={...incoming.values};for(const key of ['eps','bps','per','pbr','roe'])if(manual[key])next.values[key]=manual[key].value;}
 if(incoming.provenance){next.provenance={...incoming.provenance,perMetric:{...objectValue(incoming.provenance.perMetric)}};for(const key of ['eps','bps','per','pbr','roe'])if(manual[key])next.provenance.perMetric[key]={...manual[key],source:'MANUAL'};}
 if(incoming.values&&Object.entries(manual).some(([key,v])=>incoming.values[key]!=null&&incoming.values[key]!==objectValue(v).value))next.supplemental.manualConflict={at:new Date().toISOString(),reason:'AUTOMATIC_VALUE_CONFLICT_MANUAL_PRESERVED'};
 return next;
}
