import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
import {financialCurrency} from './financial-currency.js';
import {storedFinancialAnchorMatches} from './financial-source-anchor.js';
const D=Prisma.Decimal.clone({precision:60}),obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as any:{},compact=(s:unknown)=>typeof s==='string'?s.replace(/\s/g,''):'';
function amount(v:unknown){if(typeof v!=='string')return null;let s=v.replaceAll(',','').trim();if(/^\(\d+\)$/.test(s))s='-'+s.slice(1,-1);return /^-?\d+(?:\.\d+)?$/.test(s)?new D(s):null;}
/** A public table supplements only missing parent inputs. Original API entries retain priority. */
export function publicNativeParentAccount(f:DartFinancialFiling,key:string,raw:unknown){
 const e=obj(raw),p=obj(e.publicNative),end=f.periodEndDate.toISOString().slice(0,10),currency=financialCurrency(f);
 if(!['parentEquity','parentNetIncome'].includes(key)||e.source!=='DART_PUBLIC_NATIVE_PARENT_ACCOUNT'||e.currency!==currency||e.amountMultiplier!=='1'||e.periodEnd!==end||p.currency!==currency||p.receiptNo!==f.receiptNo||p.symbol!==f.collectionSymbol||p.fiscalYear!==f.fiscalYear||p.fsDivision!=='CFS'||f.fsDivision!=='CFS'||f.periodType!=='ANNUAL'||f.isWithdrawn||p.end!==end||!/^\d{4}-\d{2}-\d{2}$/.test(p.start??'')||!Number.isFinite(Date.parse(p.collectedAt))||!/^[a-f0-9]{64}$/.test(p.contentSha256??''))return null;
 try{const u=new URL(p.sourceUrl);if(u.origin!=='https://dart.fss.or.kr'||u.pathname!=='/report/viewer.do'||u.searchParams.get('rcpNo')!==f.receiptNo)return null;}catch{return null;}
 for(const field of['totalAssets','totalLiabilities','totalEquity','revenueYtd','operatingProfitYtd','netIncomeYtd'] as const){const actual=f[field],source=amount(obj(p.financials)[field]);if(actual==null||!source||!storedFinancialAnchorMatches(f,field,source.toString()))return null;}
 const unit=p.reportingMultiplier??'1';if(!['1','1000'].includes(unit)||unit==='1000'&&(currency!=='KRW'||p.reportingUnit!=='천원')||unit==='1'&&p.reportingUnit!=null&&!['원',currency].includes(p.reportingUnit))return null;
 const tableAmount=(v:unknown)=>amount(v)?.mul(unit)??null;
 const value=amount(e.amount);if(!value||e.ytdAmount!=null&&!value.eq(String(e.ytdAmount)))return null;
 if(p.method==='DECLARED_NATIVE_ACCOUNT'){
  const r=p.row;if(!Array.isArray(r)||!tableAmount(r[1])?.eq(value))return null;
  const label=compact(r[0]);if(key==='parentEquity'?!/^지배기업의소유주에게귀속되는자본$/.test(label):!/^지배기업의소유주에게귀속되는당기순이익\(손실\)$/.test(label))return null;
 }else if(p.method==='OWNERS_EQUITY_CHANGE_COLUMN'){
  const i=p.ownerColumn,total=p.totalColumn,opening=p.openingRow,closing=p.closingRow,profit=p.profitRow;
  if(!Number.isInteger(i)||i<1||!Number.isInteger(total)||total<=i||!Array.isArray(opening)||!Array.isArray(closing)||!Array.isArray(profit)||i>=closing.length||total>=closing.length||i>=profit.length||total>=profit.length||!/^(?:지배기업의소유주에게귀속되는(?:지분|자본)|지배기업소유지분)$/.test(compact(p.scopeLabel))||!/^(?:지배기업의소유주에게귀속되는(?:지분|자본)|지배기업소유지분)합계$/.test(compact(p.columnLabel)))return null;
  if(compact(opening[0])!==p.start.replaceAll('-','.')+'(기초자본)'||compact(closing[0])!==end.replaceAll('-','.')+'(기말자본)'||!/^당기순(?:이익(?:\(손실\))?|손실)$/.test(compact(profit[0]))||!tableAmount(closing[total])?.eq(f.totalEquity!.toString())||!storedFinancialAnchorMatches(f,'netIncomeYtd',tableAmount(profit[total])?.toString()??''))return null;
  if(!tableAmount(key==='parentEquity'?closing[i]:profit[i])?.eq(value))return null;
 }else if(p.method==='WHOLLY_OWNED_CFS_REFERENCE'){
  if(compact(p.scopeLabel)!=='지배기업의소유주에게귀속되는자본'||!Array.isArray(p.components)||p.components.length!==5)return null;
  const required=['자본금','자본잉여금','기타자본항목','기타포괄손익누계액','이익잉여금(결손금)'];let sum=new D(0);
  for(let i=0;i<5;i++){const r=p.components[i];if(!Array.isArray(r)||compact(String(r[0]).replace(/\(주[^)]*\)/g,''))!==required[i])return null;const v=amount(r[1]);if(!v)return null;sum=sum.plus(v);}
  if(!sum.eq(f.totalEquity!.toString()))return null;
  const notes=obj(p.notes);try{const u=new URL(notes.sourceUrl);if(u.origin!=='https://dart.fss.or.kr'||u.pathname!=='/report/viewer.do'||u.searchParams.get('rcpNo')!==f.receiptNo||!/^[a-f0-9]{64}$/.test(notes.contentSha256??''))return null;}catch{return null;}
  const ownership=notes.ownership;if(!Array.isArray(ownership)||ownership.length<2||!Array.isArray(ownership[0])||!compact(ownership[0].join('')).includes('당기말지분율(%)전기말지분율(%)'))return null;
  const subsidiaries=ownership.slice(1);if(subsidiaries.some((r:any)=>!Array.isArray(r)))return null;if(new Set(subsidiaries.map((r:any)=>r[0])).size!==subsidiaries.length||subsidiaries.some((r:any)=>!Array.isArray(r)||!r[0]||!amount(r[2])?.eq(100)||!amount(r[3])?.eq(100)))return null;
  const changes=p.changes,columns=p.changeColumns;if(!Array.isArray(changes)||changes.length<3||!Array.isArray(columns)||columns.length!==6||columns.some((c:any)=>compact(c).includes('비지배'))||compact(columns[5])!=='자본합계')return null;
  if(compact(changes[0]?.[0])!==p.start.replaceAll('-','.')+'(기초자본)'||compact(changes.at(-1)?.[0])!==end.replaceAll('-','.')+'(기말자본)')return null;
  const data=changes.filter((r:any)=>Array.isArray(r)&&r.length===7&&r.slice(1).some((c:any)=>c!==''));if(data.length<3)return null;
  for(const r of data){const v=r.slice(1).map(amount);if(v.some((n:any)=>n===null)||!v.slice(0,5).reduce((a:any,n:any)=>a.plus(n),new D(0)).eq(v[5]))return null;}
  for(let col=1;col<=6;col++){const total=data.slice(0,-1).reduce((a:any,r:any)=>a.plus(amount(r[col])!),new D(0));if(!total.eq(amount(data.at(-1)![col])!))return null;}
  const profits=data.filter((r:any)=>compact(r[0])==='당기순이익(손실)');if(profits.length!==1||!amount(profits[0][6])?.eq(f.netIncomeYtd!.toString())||!amount(data.at(-1)![6])?.eq(f.totalEquity!.toString()))return null;
  if(!value.eq((key==='parentEquity'?f.totalEquity:f.netIncomeYtd)!.toString()))return null;
 }else if(p.method==='NET_INCOME_ATTRIBUTION'&&key==='parentNetIncome'){
  const total=p.totalRow,owner=p.ownerRow,minority=p.minorityRow;
  if(!Array.isArray(total)||!Array.isArray(owner)||!Array.isArray(minority)||compact(total[0])!=='당기순이익'||compact(owner[0])!=='지배기업소유주지분'||compact(minority[0])!=='비지배주주지분'||!amount(total[1])?.eq(f.netIncomeYtd!.toString())||!amount(owner[1])?.eq(value))return null;
  const nci=amount(minority[1]);if(!nci||!value.plus(nci).eq(f.netIncomeYtd!.toString()))return null;
 }else return null;
 const direct=obj(obj(f.accountSources)[key]),existing=amount(direct.ytdAmount??direct.amount);if(existing&&!existing.eq(value))return null;
 return value.toString();
}

/** Preserve the original operating profit; only reconcile a separately labelled provider presentation. */
export function publicProviderOperating(f:DartFinancialFiling,raw:unknown){
 const p=obj(raw);if(p.method!=='PUBLIC_OPERATING_PRESENTATION_RECONCILED'||publicNativeParentAccount(f,'parentNetIncome',p.parentEntry)===null)return null;
 const rows=obj(p.rows),values:Record<string,Prisma.Decimal>={},labels:Record<string,string>={revenue:'수익(매출액)',cost:'매출원가',gross:'매출총이익',selling:'판매비와관리비',otherIncome:'기타영업수익',otherExpense:'기타영업비용',reported:'영업이익'};
 for(const [key,label]of Object.entries(labels)){const r=rows[key];if(!Array.isArray(r)||compact(r[0])!==label)return null;const v=amount(r[1]);if(!v)return null;values[key]=v;}
 if(!values.revenue!.eq(f.revenueYtd!.toString())||!values.revenue!.minus(values.cost!).eq(values.gross!)||!values.reported!.eq(f.operatingProfitYtd!.toString()))return null;
 const core=values.gross!.minus(values.selling!);if(!core.plus(values.otherIncome!).minus(values.otherExpense!).eq(values.reported!))return null;
 return core.toString();
}
