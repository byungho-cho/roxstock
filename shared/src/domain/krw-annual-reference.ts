import {publishedKrwAnnual} from './published-krw-annual.js';
import {registrationAnnualBasis} from './registration-annual-reference.js';
import {publicNativeParentAccount,publicProviderOperating} from './public-native-parent.js';
import {Prisma,type PeriodValuation,type DartFinancialFiling,type FinancialStatement} from '../generated/prisma/index.js';
import {financialCurrency} from './financial-currency.js';
import {fiscalDurationMatches} from './period-valuation.js';
const D=Prisma.Decimal.clone({precision:60}),obj=(x:unknown):Record<string,any>=>x&&typeof x==='object'&&!Array.isArray(x)?x as any:{},num=(x:unknown)=>typeof x==='string'&&/^-?\d+(?:\.\d+)?$/.test(x)?new D(x):null;
export const krwAnnualReferencePolicy='CROSS_CHECKED_KRW_ANNUAL_REFERENCE_V1';
/** Provider-converted KRW stays separate from native DART. Implied rates only reconcile the
 * published balance/flow tables; they are never advertised as an official exchange-rate feed. */
export function reviewedKrwAnnual(row:PeriodValuation|undefined,filings:DartFinancialFiling[],references:FinancialStatement[]=[]){
 const published=publishedKrwAnnual(row,filings,references);if(published)return published;
 if(!row||row.periodType!=='ANNUAL'||!row.collectionSymbol)return null;
 const s=obj(row.supplemental),proof=obj(s.krwAnnualReference),n=obj(proof.naver),k=obj(proof.kis),manual=obj(s.manualFields);
 if(proof.policy!==krwAnnualReferencePolicy||proof.securityId!==String(row.securityId)||proof.symbol!==row.collectionSymbol||['eps','bps','roe','per','pbr'].some(key=>manual[key]))return null;
 const apiF=filings.find(f=>!f.isWithdrawn&&f.securityId===row.securityId&&f.collectionSymbol===row.collectionSymbol&&f.fiscalYear===row.fiscalYear&&f.periodType==='ANNUAL'&&f.receiptNo===proof.receiptNo);
 const publicBasis=!apiF?registrationAnnualBasis(row):null;
 if(publicBasis&&references.some(r=>r.securityId===row.securityId&&r.fiscalYear===row.fiscalYear&&r.periodType==='ANNUAL'&&r.source!=='KIS_API_REFERENCE'))return null;
 if(publicBasis&&filings.some(f=>!f.isWithdrawn&&f.securityId===row.securityId&&f.fiscalYear===row.fiscalYear&&f.periodType==='ANNUAL'))return null;
 const f=apiF??publicBasis;
 if(publicBasis&&(proof.receiptNo!==publicBasis.receiptNo||proof.duration?.method!=='DART_PUBLIC_FILING_ACCOUNTS_MATCH'||proof.duration?.sourceUrl!==publicBasis.sourceUrl||proof.duration?.contentSha256!==publicBasis.contentSha256))return null;
 if(!f||f.fsDivision!=='CFS'||!['USD','CNY','JPY','GBP','EUR','HKD','SGD'].includes(financialCurrency(f!)))return null;
 const end=f.periodEndDate.toISOString().slice(0,10),duration=proof.duration;
 if(!fiscalDurationMatches(f,duration)||duration.months!==12||proof.periodEnd!==end)return null;
 if(n.source!=='NAVER_FNGUIDE_ANNUAL'||n.kind!=='FINAL_ANNUAL'||n.division!=='CFS'||n.fiscalYear!==row.fiscalYear||n.fiscalMonth!==f.periodEndDate.getUTCMonth()+1||!Number.isFinite(Date.parse(n.collectedAt)))return null;
 try{const u=new URL(n.sourceUrl);if(u.origin!=='https://navercomp.wisereport.co.kr'||u.pathname!=='/v3/company/c1010001.aspx'||u.searchParams.get('cmp_cd')!==row.collectionSymbol)return null;}catch{return null;}
 if(k.source!=='KIS_API'||k.currency!=='KRW'||k.periodType!=='ANNUAL'||k.fiscalYear!==row.fiscalYear||k.periodEnd!==end||k.stacYymm!==end.slice(0,7).replace('-','')||k.amountUnit!=='HUNDRED_MILLION_KRW'||!Number.isFinite(Date.parse(k.collectedAt)))return null;
 if(Date.parse(n.collectedAt)<Date.parse(end)||Date.parse(k.collectedAt)<Date.parse(end))return null;
 const unreportedRevenue=publicBasis?.revenueState==='NOT_REPORTED_DASH'&&obj(n.financials).revenue==null&&num(k.revenue)?.eq(0)===true;
 const values=obj(n.values),amounts=obj(n.financials),bps=num(values.bps),eps=num(values.eps),kbps=num(k.bps),keps=num(k.eps);
 if(!bps?.gt(0)||!eps||!kbps||!keps||bps.minus(kbps).abs().gt(1)||eps.minus(keps).abs().gt(1))return null;
 // KIS annual financials are rounded at 1억원, Naver at 0.01억원. No relative-error relaxation.
 for(const [nk,kk] of [['totalAssets','assets'],['totalEquity','equity'],['netIncome','netIncome'],['revenue','revenue']]){if(nk==='revenue'&&unreportedRevenue)continue;const a=num(amounts[nk!]),b=num(k[kk!]);if(!a||!b||a.minus(b).abs().gt('50500000'))return null;}
 const assets=num(amounts.totalAssets),liabilities=num(amounts.totalLiabilities),equity=num(amounts.totalEquity),parent=num(amounts.parentEquity),profit=num(amounts.parentNetIncome);
 if(!assets?.gt(0)||!liabilities||liabilities.lt(0)||!equity?.gt(0)||!parent?.gt(0)||!profit||assets.minus(liabilities).minus(equity).abs().gt('1500000'))return null;
 if(publicBasis&&(!parent.eq(equity)||!profit.eq(String(amounts.netIncome))))return null;
 const direct=obj(f.accountSources),extra=obj(proof.accounts),linked=extra.receiptNo===f.receiptNo&&extra.fsDivision===f.fsDivision&&extra.currency===financialCurrency(f!);
 function native(key:string){const d=obj(direct[key]);if(d.currency&&d.currency!==financialCurrency(f!)||d.periodEnd&&d.periodEnd!==end)return null;if(d.amount!=null||d.ytdAmount!=null)return num(d.ytdAmount??d.amount);const e=obj(obj(extra.sources)[key]);if(e.source==='DART_PUBLIC_NATIVE_PARENT_ACCOUNT')return apiF&&linked&&e.publicNative?.start===duration.start&&e.publicNative?.end===duration.end?num(publicNativeParentAccount(apiF!,key,e)):null;if(!linked||e.source==='NAVER_FNGUIDE_ANNUAL'||e.derivation||e.currency&&e.currency!==financialCurrency(f!))return null;return num(e.ytdAmount??e.amount);}
 const parentNative=native('parentEquity'),profitNative=native('parentNetIncome'),nativeEquity=f.totalEquity==null?null:num(f.totalEquity.toString()),nativeRevenue=f.revenueYtd==null?null:num(f.revenueYtd.toString());
 if(!parentNative?.gt(0)||!profitNative||!nativeEquity?.gt(0)||!nativeRevenue&&!unreportedRevenue)return null;
 const providerOperating=apiF?publicProviderOperating(apiF,obj(proof).operatingPresentation):null;
 const flows=[['revenue',nativeRevenue],['operatingProfit',providerOperating===null?(f.operatingProfitYtd==null?null:new D(f.operatingProfitYtd.toString())):new D(providerOperating)],['netIncome',f.netIncomeYtd==null?null:new D(f.netIncomeYtd.toString())],['parentNetIncome',profitNative]] as const;
 // Anchor the common flow rate to the largest absolute amount, so a tiny rounded revenue
 // cannot amplify a 0.01억원 rounding error into a false mismatch on large losses.
 const anchor=flows.filter((entry):entry is readonly [typeof entry[0],NonNullable<typeof entry[1]>]=>entry[1]!==null&&!entry[1].eq(0)).sort((a,b)=>b[1].abs().cmp(a[1].abs()))[0];
 const balanceRate=equity.div(nativeEquity),flowRate=anchor?num(amounts[anchor[0]])?.div(anchor[1]):null;
 if(!balanceRate.gt(0)||!flowRate?.gt(0))return null;
 const agrees=(source:unknown,target:unknown,rate:Prisma.Decimal)=>{const a=num(source),b=num(target);return !!a&&!!b&&a.mul(rate).minus(b).abs().lte('1500000');};
 for(const [nk,source]of [['totalAssets',f.totalAssets],['totalLiabilities',f.totalLiabilities],['totalEquity',f.totalEquity],['parentEquity',parentNative]]as const)if(!agrees(source?.toString(),amounts[nk],balanceRate))return null;
 for(const [nk,source]of [['revenue',f.revenueYtd],['operatingProfit',providerOperating===null?f.operatingProfitYtd:new D(providerOperating)],['netIncome',f.netIncomeYtd],['parentNetIncome',profitNative]]as const){if(nk==='revenue'&&unreportedRevenue)continue;if(!agrees(source?.toString(),amounts[nk],flowRate))return null;}
 const roe=profit.div(parent).mul(100).toDecimalPlaces(4).toString(),ratio=(key:string)=>{const v=num(values[key]);return v&&v.gt(0)?v.toString():null;};
 const old=num(obj(row.values).roe),difference=old?new D(roe).minus(old):null;
 return {eps:eps.toString(),bps:bps.toString(),roe,per:eps.gt(0)?ratio('per'):null,pbr:ratio('pbr'),equity:parent.toString(),profit:profit.toString(),totalEquity:equity.toString(),netIncome:String(amounts.netIncome),currency:'KRW',nativeCurrency:financialCurrency(f!),periodEnd:end,receiptNo:f.receiptNo,source:'NAVER_KIS_KRW_REFERENCE',fsDivision:f.fsDivision,nativeSourceKind:publicBasis?'DART_REGISTRATION_COMPARATIVE':'DART_ANNUAL_FILING',policy:krwAnnualReferencePolicy,impliedBalanceRate:balanceRate.toString(),impliedFlowRate:flowRate.toString(),roeDifferencePP:difference?.toString()??null,warning:'투자 주의 · 원화 참고 W: 네이버·한투 연간 지표와 외화 DART의 자본·손익을 대조했습니다. 제공처 환산 금액·수정 주식수 BPS를 사용하며 외화 원문은 보존합니다. 기말 자본과 연간 손익의 환산 기준은 구분합니다.'+(obj(obj(obj(proof.accounts).sources).parentNetIncome).publicNative?.method==='WHOLLY_OWNED_CFS_REFERENCE'?' 지배주주 귀속은 연결 종속기업 기초·기말 100% 지분과 연간 자본변동표를 대조한 참고 계산입니다.':'')+(publicBasis?' 증권신고서의 비교 연간 열과 연결 자본변동표 및 제공처 귀속에 근거한 참고 계산입니다. 매출 미제공은 별도로 유지합니다.':'')+(difference?.abs().gte(1)?` ROE 기준 변경 차이 ${difference.toDecimalPlaces(2)}%p.`:'')};
}
