import {Prisma,type PeriodValuation,type FinancialStatement,type DartFinancialFiling} from '../generated/prisma/index.js';
const D=Prisma.Decimal.clone({precision:60}),obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as any:{},dec=(v:unknown)=>typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v)?new D(v):null;
export const auditCurrentSharePolicy='PUBLIC_AUDIT_CURRENT_SHARES_REFERENCE_V1';
/** Explicit, labelled approximation approved for the historical annual bucket.
 * A current listed-share count never becomes a claimed historical share table. */
export function auditCurrentShareReference(row:PeriodValuation|undefined,references:FinancialStatement[],filings:DartFinancialFiling[]){
 if(!row||row.periodType!=='ANNUAL')return null;
 const sup=obj(row.supplemental),proof=obj(sup.auditCurrentShareReference),manual=obj(sup.manualFields),p=obj(row.provenance);
 if(proof.policy!==auditCurrentSharePolicy||proof.securityId!==String(row.securityId)||proof.symbol!==row.collectionSymbol||proof.fiscalYear!==row.fiscalYear||manual.bps||manual.roe||p.currency!=='KRW'||p.fsDivision!=='OFS'||filings.some(f=>!f.isWithdrawn&&f.securityId===row.securityId&&f.fiscalYear===row.fiscalYear&&f.periodType==='ANNUAL'))return null;
 const f=references.find(f=>f.securityId===row.securityId&&f.fiscalYear===row.fiscalYear&&f.periodType==='ANNUAL'),m=obj(f?.sourceMetadata),end=`${row.fiscalYear}-12-31`,start=`${row.fiscalYear}-01-01`;
 if(!f||f.source!=='DART_PUBLIC_REFERENCE'||m.referenceOnly!==true||m.notSyntheticBusinessReport!==true||m.currency!=='KRW'||m.fsDivision!=='OFS'||!['KIFRS','KGAAP'].includes(m.accountingStandard)||m.periodStart!==start||m.periodEnd!==end||f.periodEndDate.toISOString().slice(0,10)!==end||proof.receiptNo!==m.sourceReceiptNo||!/^[a-f0-9]{64}$/.test(m.contentSha256??''))return null;
 try{const url=new URL(m.sourceUrl);if(url.origin!=='https://dart.fss.or.kr'||url.pathname!=='/report/viewer.do'||url.searchParams.get('rcpNo')!==m.sourceReceiptNo)return null;}catch{return null;}
 for(const field of ['totalAssets','totalLiabilities','totalEquity','revenue','operatingProfit','netIncome']as const){const table=obj(obj(m.tables)[['revenue','operatingProfit','netIncome'].includes(field)?'IS':'BS']),value=dec(obj(table.values)[field]);if(f[field]==null||!value?.eq(f[field]!.toString())||table.year!==row.fiscalYear||obj(table.period).start!==start||obj(table.period).end!==end)return null;}
 const equity=f.totalEquity,profit=f.netIncome;if(!equity?.gt(0)||profit==null||f.totalAssets==null||f.totalLiabilities==null||new D(f.totalAssets.toString()).minus(f.totalLiabilities.toString()).minus(equity.toString()).abs().gt(1))return null;
 const current=currentListedShareProof(row,proof.snapshot,proof.reviewedAt,end);if(!current)return null;const count=new D(current.count);
 const bps=new D(equity.toString()).div(count),roe=new D(profit.toString()).div(equity.toString()).mul(100).toDecimalPlaces(4).toString(),shareDate=current.shareDate;
 return {policy:auditCurrentSharePolicy,bps:bps.toDecimalPlaces(4).toString(),rimBps:bps.toString(),roe,equity:equity.toString(),profit:profit.toString(),shares:count.toString(),shareDate,receiptNo:m.sourceReceiptNo,periodEnd:end,year:row.fiscalYear,division:'OFS' as const,source:'DART_PUBLIC_AUDIT_CURRENT_SHARES_REFERENCE',isReference:true,warning:`투자 주의 · ${row.fiscalYear}년 별도 감사자료와 ${shareDate} 현재 상장주식수를 사용한 참고 W입니다. 과거 주식수·종류별 권리 차이는 반영하지 않으며 ROE는 연말 별도 자본 기준입니다.`};
}

export function currentListedShareProof(row:Pick<PeriodValuation,'securityId'|'collectionSymbol'>,snapshotValue:unknown,reviewedAt:string,periodEnd:string){
 const snapshot=obj(snapshotValue),raw=obj(snapshot.raw),count=dec(snapshot.listedShares),source=obj(obj(raw.fieldSources).listedShares);
 const observed=Date.parse(snapshot.observedDate),collected=Date.parse(snapshot.collectedAt),reviewed=Date.parse(reviewedAt);
 if(snapshot.securityId!==String(row.securityId)||snapshot.collectionSymbol!==row.collectionSymbol||snapshot.source!=='KIS_API'||raw.periodBasis!=='CURRENT_REFERENCE_ONLY'||raw.shareUnit!=='SHARE'||source.source!=='KIS_API'||source.collectedAt!==snapshot.collectedAt||!count?.isInteger()||!count.gt(0)||count.gte('1e18')||!dec(obj(raw.fields).lstn_stcn)?.eq(count)||![observed,collected,reviewed].every(Number.isFinite)||observed<Date.parse(periodEnd)||collected<observed||reviewed<collected)return null;
 return {count:count.toString(),shareDate:new Date(observed).toISOString().slice(0,10)};
}
