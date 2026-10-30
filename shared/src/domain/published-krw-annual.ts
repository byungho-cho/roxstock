import {Prisma,type PeriodValuation,type DartFinancialFiling,type FinancialStatement} from '../generated/prisma/index.js';
import {financialCurrency} from './financial-currency.js';
import {currentListedShareProof} from './audit-current-share-reference.js';
const D=Prisma.Decimal.clone({precision:60}),obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as any:{},compact=(v:unknown)=>typeof v==='string'?v.replace(/\s/g,''):'',num=(v:unknown)=>typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v)?new D(v):null;
const rawNumber=(v:unknown)=>{if(typeof v!=='string')return null;let s=v.replaceAll(',','').trim();if(/^\(\d+(?:\.\d+)?\)$/.test(s))s='-'+s.slice(1,-1);return num(s);};
export const publishedKrwAnnualPolicy='DART_PUBLISHED_KRW_CURRENT_SHARES_REFERENCE_V1';
const labels:Record<string,RegExp>={totalAssets:/^자산총계$/,totalLiabilities:/^부채총계$/,totalEquity:/^자본총계$/,parentEquity:/^지배기업의소유주에게귀속되는자본$/,revenue:/^(?:수익\(매출액\)|매출액)$/,operatingProfit:/^영업(?:이익|손실)(?:\(손실\))?$/,netIncome:/^(?:연결)?당기순(?:이익|손익|손실)(?:\(손실\))?$/,parentNetIncome:/^(?:지배기업의소유주에게귀속되는당기순이익(?:\(손실\))?|지배회사소유주지분|지배기업주주지분)$/};
/** Read only the published current-year column. No data is inferred from blank cells. */
function tableValues(raw:unknown,kind:'BS'|'IS',currency:string,start:string,end:string,division:'CFS'|'OFS'){
 const t=obj(raw),header=compact(t.header),unit=t.unit,multiplier=unit==='천원'?'1000':'1';
 if(t.kind!==kind||t.currency!==currency||t.start!==start||t.end!==end||t.multiplier!==multiplier||(division==='CFS'?!header.includes('연결'):header.includes('연결'))||!header.includes(kind==='BS'?'재무상태표':'손익계산서')||!header.includes(`(단위:${unit})`)||!(currency==='KRW'?['원','KRW','천원'].includes(unit):unit===currency))return null;
 const dates=header.match(/\d{4}\.\d{2}\.\d{2}/g);if(kind==='BS'?dates?.[0]!==end.replaceAll('-','.'):dates?.[0]!==start.replaceAll('-','.')||dates?.[1]!==end.replaceAll('-','.'))return null;
 const values:Record<string,Prisma.Decimal>={},fields=kind==='BS'?['totalAssets','totalLiabilities','totalEquity',...(division==='CFS'?['parentEquity']:[])]:['revenue','operatingProfit','netIncome',...(division==='CFS'?['parentNetIncome']:[])];
 for(const key of fields){const r=obj(obj(t.fields)[key]),row=r.row,col=r.column;if(!Array.isArray(row)||!Number.isInteger(col)||col<1||col>=row.length||!labels[key]!.test(compact(row[0]).replace(/\(주[^)]*\)/g,'')))return null;const n=rawNumber(row[col]);if(!n||n.abs().gte('1e25'))return null;values[key]=n.mul(multiplier);}
 const parent=obj(obj(t.fields).parentNetIncome);
 if(kind==='IS'&&division==='CFS'&&!compact(parent.row?.[0]).startsWith('지배기업의소유주에게귀속되는당기순이익')){
  const a=obj(t.attribution),minority=rawNumber(a.minorityRow?.[parent.column]);
  if(!/^(?:당기순이익(?:\(손실\))?의귀속|연결당기순이익및총포괄이익의귀속)$/.test(compact(a.heading))||!/^비지배(?:지분|주주지분)$/.test(compact(a.minorityRow?.[0]))||!minority||!values.parentNetIncome!.plus(minority.mul(multiplier)).eq(values.netIncome!))return null;
 }
 if(division==='OFS')values[kind==='BS'?'parentEquity':'parentNetIncome']=values[kind==='BS'?'totalEquity':'netIncome']!;
 return {values,multiplier};
}
/** Official native and KRW tables in the same annual filing, with a separately labelled
 * current-share denominator. This is not a substitute or overwrite of the native filing. */
export function publishedKrwAnnual(row:PeriodValuation|undefined,filings:DartFinancialFiling[],references:FinancialStatement[]=[]){
 if(!row||row.periodType!=='ANNUAL'||!row.collectionSymbol)return null;
 const sup=obj(row.supplemental),p=obj(sup.publishedKrwAnnual),manual=obj(sup.manualFields);
 if(p.policy!==publishedKrwAnnualPolicy||p.securityId!==String(row.securityId)||p.symbol!==row.collectionSymbol||p.fiscalYear!==row.fiscalYear||Object.keys(manual).length||references.some(f=>f.securityId===row.securityId&&f.fiscalYear===row.fiscalYear&&f.periodType==='ANNUAL'&&!['KIS_API_REFERENCE','DART_PUBLIC_REFERENCE'].includes(f.source)))return null;
 const f=filings.find(f=>!f.isWithdrawn&&f.securityId===row.securityId&&f.collectionSymbol===row.collectionSymbol&&f.receiptNo===p.receiptNo&&f.fiscalYear===row.fiscalYear&&f.periodType==='ANNUAL'&&f.fsDivision===(p.fsDivision??'CFS'));
 if(!f||(f.fsDivision!=='CFS'&&f.fsDivision!=='OFS')||!['CNY','USD','JPY','GBP','EUR','HKD','SGD'].includes(financialCurrency(f))||p.nativeCurrency!==financialCurrency(f)||!/^[a-f0-9]{64}$/.test(p.contentSha256??''))return null;
 const end=f.periodEndDate.toISOString().slice(0,10),start=`${row.fiscalYear}-01-01`;if(end!==`${row.fiscalYear}-12-31`||p.start!==start||p.end!==end)return null;
 try{const url=new URL(p.sourceUrl);if(url.origin!=='https://dart.fss.or.kr'||url.pathname!=='/report/viewer.do'||url.searchParams.get('rcpNo')!==f.receiptNo)return null;}catch{return null;}
 const nbs=tableValues(obj(p.native).BS,'BS',p.nativeCurrency,start,end,f.fsDivision),nis=tableValues(obj(p.native).IS,'IS',p.nativeCurrency,start,end,f.fsDivision),wbs=tableValues(obj(p.krw).BS,'BS','KRW',start,end,f.fsDivision),wis=tableValues(obj(p.krw).IS,'IS','KRW',start,end,f.fsDivision);if(!nbs||!nis||!wbs||!wis)return null;
 const n={...nbs.values,...nis.values},w={...wbs.values,...wis.values};
 for(const [key,field]of Object.entries({totalAssets:'totalAssets',totalLiabilities:'totalLiabilities',totalEquity:'totalEquity',revenue:'revenueYtd',operatingProfit:'operatingProfitYtd',netIncome:'netIncomeYtd'})){const actual=f[field as keyof DartFinancialFiling];if(actual==null||!n[key]!.eq(String(actual)))return null;}
 for(const key of f.fsDivision==='CFS'?['parentEquity','parentNetIncome']:[]){const direct=obj(obj(f.accountSources)[key]),v=num(direct.ytdAmount??direct.amount);if(v&&!v.eq(n[key]!))return null;}
 if(!n.parentEquity!.gt(0)||!w.parentEquity!.gt(0)||!n.totalEquity!.gt(0)||!w.totalEquity!.gt(0)||!n.totalAssets!.gt(0)||n.totalLiabilities!.lt(0)||w.totalLiabilities!.lt(0)||!n.totalAssets!.minus(n.totalLiabilities!).eq(n.totalEquity!)||w.totalAssets!.minus(w.totalLiabilities!).minus(w.totalEquity!).abs().gt(new D(wbs.multiplier).mul(2)))return null;
 const balanceRate=w.totalEquity!.div(n.totalEquity!),flowKeys=['revenue','operatingProfit','netIncome','parentNetIncome'],anchor=flowKeys.filter(k=>!n[k]!.eq(0)).sort((a,b)=>n[b]!.abs().cmp(n[a]!.abs()))[0];if(!anchor)return null;const flowRate=w[anchor]!.div(n[anchor]!);if(!balanceRate.gt(0)||!flowRate.gt(0))return null;
 for(const [keys,rate,tolerance]of [[['totalAssets','totalLiabilities','totalEquity','parentEquity'],balanceRate,new D(wbs.multiplier).mul(2)],[flowKeys,flowRate,new D(wis.multiplier).mul(2)]]as const)for(const key of keys)if(n[key]!.mul(rate).minus(w[key]!).abs().gt(tolerance))return null;
 const current=currentListedShareProof(row,p.snapshot,p.reviewedAt,end);if(!current)return null;const count=new D(current.count),eps=w.parentNetIncome!.div(count).toDecimalPlaces(4),bps=w.parentEquity!.div(count).toDecimalPlaces(4),roe=w.parentNetIncome!.div(w.parentEquity!).mul(100).toDecimalPlaces(4).toString();
 const q=obj(sup.price),quote=num(q.value),date=Date.parse(q.date),endDate=Date.parse(end),price=(!q.symbol||q.symbol===row.collectionSymbol)&&['KRX_UNADJUSTED_CLOSE','KIS_KRX_UNADJUSTED_CLOSE'].includes(q.source)&&['ORDINARY_UNADJUSTED','ORIGINAL_EQUALS_ADJUSTED'].includes(q.shareBasis)&&Number.isFinite(date)&&date<=endDate&&endDate-date<=7*86400000&&quote?.gt(0)?quote:null;
 const difference=num(obj(row.values).roe)?new D(roe).minus(String(obj(row.values).roe)):null;
 return {eps:eps.toString(),bps:bps.toString(),roe,per:price&&eps.gt(0)?price.div(eps).toDecimalPlaces(4).toString():null,pbr:price?price.div(bps).toDecimalPlaces(4).toString():null,equity:w.parentEquity!.toString(),profit:w.parentNetIncome!.toString(),totalEquity:w.totalEquity!.toString(),netIncome:w.netIncome!.toString(),currency:'KRW',nativeCurrency:p.nativeCurrency,periodEnd:end,receiptNo:f.receiptNo,source:'DART_PUBLISHED_KRW_CURRENT_SHARES_REFERENCE',nativeSourceKind:'DART_ANNUAL_FILING',fsDivision:f.fsDivision,policy:publishedKrwAnnualPolicy,impliedBalanceRate:balanceRate.toString(),impliedFlowRate:flowRate.toString(),roeDifferencePP:difference?.toString()??null,warning:`투자 주의 · 공시의 ${row.fiscalYear}년 ${f.fsDivision==='CFS'?'연결':'별도'} 원화 환산 재무제표와 ${current.shareDate} 현재 상장주식수로 계산한 참고 W·EPS·BPS입니다. 과거 주식수·주식 종류별 권리는 반영하지 않습니다. 외화 원문은 보존하며 공시의 기말 자본·연간 손익 환산 기준을 구분합니다.`+(difference?.abs().gte(1)?` ROE 기준 변경 차이 ${difference.toDecimalPlaces(2)}%p.`:'')};
}
