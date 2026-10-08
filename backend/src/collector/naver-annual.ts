import { Prisma } from '../generated/prisma/index.js';
import { metricKeys, type MetricValues } from '../domain/period-valuation.js';

export class NaverAnnualError extends Error {
 constructor(public readonly code:string) { super(code); }
}
export type NaverAnnual = {
 fiscalYear:number; kind:'FINAL_ANNUAL'|'ANNUAL_ESTIMATE'; division:'CFS'|'OFS'; values:MetricValues;
 financials:Record<string,string|null>; source:'NAVER_FNGUIDE_ANNUAL'; sourceUrl:string; collectedAt:string;
 pricePolicy:'ADJUSTED_ORDINARY_YEAR_END'|'PREVIOUS_BUSINESS_DAY_ADJUSTED_ORDINARY'; priceDate:string|null;
 sharePolicy:'PROVIDER_ADJUSTED_ORDINARY_AND_PREFERRED_DENOMINATOR'; formulas:Record<string,string>;
};
const plain=(html:string)=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const cells=(html:string,tag:string)=>Array.from(html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`,'gi')));
const numeric=(cell:RegExpMatchArray)=>{
 const raw=(cell[1]??'').match(/\btitle=["']([^"']*)["']/i)?.[1]??plain(cell[2]??'');
 const value=raw.replaceAll(',','').replace(/원|%|배/g,'').trim();
 return /^-?\d+(?:\.\d+)?$/.test(value)?new Prisma.Decimal(value).toString():null;
};
/** Parse only a real annual table. Hidden decoy tables and the top-level TTM panel are never accepted. */
export function parseNaverAnnual(html:string,symbol:string,sourcePage:string,now=new Date()):NaverAnnual[] {
 const tables=Array.from(html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi));
 const table=tables.find(t=>/연간/.test(t[1]??'')&&/\d{4}\/12/.test(t[1]??''));
 if(!table)throw new NaverAnnualError('NAVER_ANNUAL_TABLE_MISSING');
 const head=(table[1]??'').match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i)?.[1]??'';
 const columns=cells(head,'th').flatMap(c=>{const text=plain(c[2]??''),m=text.match(/^(\d{4})\/12(\(E\))?/);return m?[{year:Number(m[1]),estimate:!!m[2],division:/IFRS연결/.test(text)?'CFS' as const:/IFRS별도/.test(text)?'OFS' as const:null}]:[];});
 if(!columns.length||columns.some(c=>!c.division))throw new NaverAnnualError('NAVER_ANNUAL_BASIS_MISSING');
 const body=(table[1]??'').match(/<tbody\b[^>]*>([\s\S]*?)(?:<\/tbody>|$)/i)?.[1]??'';
 const rows=new Map<string,(string|null)[]>();
 for(const tr of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const label=cells(tr[1]??'','th')[0],data=cells(tr[1]??'','td');
  if(!label)continue;
  if(data.length!==columns.length)throw new NaverAnnualError('NAVER_ANNUAL_COLUMNS_MISMATCH');
  rows.set(plain(label[2]??'').replace(/\s+/g,''),data.map(numeric));
 }
 // Source definitions must be present before assigning price/share policies.
 const definitions=plain(sourcePage);
 if(!/단위\s*:\s*억원/.test(definitions))throw new NaverAnnualError('NAVER_ANNUAL_UNIT_UNCONFIRMED');
 if(!/보통주수정주가\s*\(기말\)/.test(definitions)||!/보통주\s*\+\s*우선주/.test(definitions))throw new NaverAnnualError('NAVER_ANNUAL_FORMULA_UNCONFIRMED');
 const asOf=definitions.match(/기준:\s*(\d{4})\.(\d{2})\.(\d{2})/)?.slice(1).join('-')??null;
 return columns.map((column,i)=>{
  const value=(labels:string[])=>labels.map(label=>rows.get(label)?.[i]).find(v=>v!=null)??null;
  const financial=(labels:string[])=>{const v=value(labels);return v===null?null:new Prisma.Decimal(v).mul(100000000).toString();};
  return {fiscalYear:column.year,kind:column.estimate?'ANNUAL_ESTIMATE':'FINAL_ANNUAL',division:column.division!,values:Object.fromEntries(metricKeys.map(k=>[k,value([k.toUpperCase(),`${k.toUpperCase()}(원)`,`${k.toUpperCase()}(배)`,`${k.toUpperCase()}(%)`])])) as MetricValues,
   financials:{revenue:financial(['매출액']),operatingProfit:financial(['영업이익','영업이익(발표기준)']),netIncome:financial(['당기순이익']),parentNetIncome:financial(['당기순이익(지배)']),totalAssets:financial(['자산총계']),totalLiabilities:financial(['부채총계']),totalEquity:financial(['자본총계']),parentEquity:financial(['자본총계(지배)'])},
   source:'NAVER_FNGUIDE_ANNUAL',sourceUrl:`https://navercomp.wisereport.co.kr/v3/company/c1010001.aspx?cmp_cd=${symbol}`,collectedAt:now.toISOString(),pricePolicy:column.estimate?'PREVIOUS_BUSINESS_DAY_ADJUSTED_ORDINARY':'ADJUSTED_ORDINARY_YEAR_END',priceDate:column.estimate?asOf:null,sharePolicy:'PROVIDER_ADJUSTED_ORDINARY_AND_PREFERRED_DENOMINATOR',
   formulas:{eps:'지배순이익 / 수정평균발행주식수(보통주+우선주)',bps:'지배자본 / 수정기말발행주식수(보통주+우선주, 자사주차감)',per:'보통주 수정주가(기말) / 동일 원천 EPS',pbr:'보통주 수정주가(기말) / 동일 원천 BPS',roe:'지배순이익 / 평균 지배자본 * 100'}};
 });
}
/** An instance belongs to one MANUAL request: all its requested years share one bounded crawl. */
export class NaverAnnualProvider {
 private pending=new Map<string,Promise<NaverAnnual[]>>();
 constructor(private fetcher:typeof fetch=fetch) {}
 annual(symbol:string){
  if(!/^\d{6}$/.test(symbol))throw new NaverAnnualError('NAVER_SYMBOL_INVALID');
  let result=this.pending.get(symbol);
  if(!result){result=this.load(symbol);this.pending.set(symbol,result);}
  return result;
 }
 private async text(url:string,referer?:string){
  for(let attempt=0;attempt<2;attempt++){
   let response:Response;
   try{response=await this.fetcher(url,{headers:{accept:'text/html',...(referer?{referer}:{})},signal:AbortSignal.timeout(15000)});}
   catch{if(attempt===0)continue;throw new NaverAnnualError('NAVER_COMMUNICATION');}
   if(!response.ok)throw new NaverAnnualError(response.status===429?'NAVER_RATE_LIMIT':response.status===401?'NAVER_AUTH':response.status===403?'NAVER_PERMISSION':'NAVER_HTTP');
   const body=await response.text();if(body.length>2_000_000)throw new NaverAnnualError('NAVER_RESPONSE_TOO_LARGE');return body;
  }
  throw new NaverAnnualError('NAVER_COMMUNICATION');
 }
 private async load(symbol:string){
  const url=`https://navercomp.wisereport.co.kr/v3/company/c1010001.aspx?cmp_cd=${symbol}`;
  const page=await this.text(url),enc=page.match(/encparam:\s*'([^']+)'/)?.[1],id=page.match(/,\s*id:\s*'([^']+)'/)?.[1];
  if(!enc||!id)throw new NaverAnnualError('NAVER_ANNUAL_ADAPTER_CHANGED');
  const query=new URLSearchParams({cmp_cd:symbol,fin_typ:'4',freq_typ:'Y',extY:'1',extQ:'0',encparam:enc,id});
  return parseNaverAnnual(await this.text('https://navercomp.wisereport.co.kr/v3/company/ajax/cF1001.aspx?'+query,url),symbol,page);
 }
}
