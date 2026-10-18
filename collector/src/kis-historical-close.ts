import {Prisma} from '@roxstock/shared/prisma';
import {persistentKisToken} from '@roxstock/shared/lib/kis-token-cache';
import {collectionFetch,CollectionExcluded} from '@roxstock/shared/collection/collection-policy';
import type {Supplemental} from '@roxstock/shared/domain/period-valuation';
import {HistoricalPriceError} from './historical-price-error.js';
const origin='https://openapi.koreainvestment.com:9443';
let lastRequest=0;
async function request(path:string,init:RequestInit,fetcher:typeof fetch):Promise<any>{
 const at=Math.max(Date.now(),lastRequest+2000);lastRequest=at;const wait=at-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));
 let response:Response;try{response=await collectionFetch(fetcher,'market-prices')(origin+path,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});}catch(error){if(error instanceof CollectionExcluded)throw error;throw new HistoricalPriceError('KIS_PRICE_COMMUNICATION','COMMUNICATION');}
 let body:any;try{body=await response.json();}catch{throw new HistoricalPriceError('KIS_PRICE_PARSE','PARSE');}
 if(!response.ok||body.error_code||body.rt_cd!=null&&body.rt_cd!=='0')throw new HistoricalPriceError(response.status===429?'KIS_PRICE_RATE_LIMIT':'KIS_PRICE_PROVIDER',response.status===429?'RATE_LIMIT':response.status===401||response.status===403?'AUTH':'PROVIDER');
 return body;
}
/** Original KRX close, with a separate adjusted-price comparison; never a current quote. */
export async function kisHistoricalClose(symbol:string,end:Date,fetcher:typeof fetch=fetch,disclosedAt?:Date):Promise<Supplemental['price']>{
 const appkey=process.env.KIS_APP_KEY?.trim(),appsecret=process.env.KIS_APP_SECRET?.trim();
 if(!appkey||!appsecret)throw new HistoricalPriceError('KIS_PRICE_KEY_MISSING','AUTH');
 if(!/^[A-Z0-9]{6}$/.test(symbol)||symbol.startsWith('Z99'))throw new HistoricalPriceError('KIS_PRICE_SYMBOL','PARSE');
 const date=(d:Date)=>d.toISOString().slice(0,10).replaceAll('-','');
 const periodEnd=date(end),to=date(disclosedAt??end),from=date(new Date(end.getTime()-7*86400000));
 if(disclosedAt&&(disclosedAt<end||disclosedAt.getTime()-end.getTime()>150*86400000))throw new HistoricalPriceError('KIS_PRICE_DISCLOSURE_WINDOW','NO_DATA');
 if(to>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-',''))throw new HistoricalPriceError('KIS_PRICE_FUTURE_PERIOD','NO_DATA');
 const access=await persistentKisToken({appKey:appkey,appSecret:appsecret,origin,issue:async()=>{
  const body=await request('/oauth2/tokenP',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',appkey,appsecret})},fetcher);
  if(typeof body.access_token!=='string'||!body.access_token||!Number.isFinite(Number(body.expires_in))||Number(body.expires_in)<=60)throw new HistoricalPriceError('KIS_PRICE_TOKEN_PARSE','PARSE');
  return {token:body.access_token,expiresAt:Date.now()+Math.min(86400,Number(body.expires_in))*1000};
 }});
 const rows=[];
 for(const adjusted of ['1','0']){
  const params=new URLSearchParams({FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:symbol,FID_INPUT_DATE_1:from,FID_INPUT_DATE_2:to,FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:adjusted});
  const body=await request('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?'+params,{headers:{authorization:'Bearer '+access.token,appkey,appsecret,tr_id:'FHKST03010100',custtype:'P'}},fetcher);
  if(body.output1?.stck_shrn_iscd!==symbol||!Array.isArray(body.output2))throw new HistoricalPriceError('KIS_PRICE_SYMBOL_OR_SCHEMA','PARSE');
  const valid=body.output2.filter((r:any)=>/^\d{8}$/.test(r.stck_bsop_date??'')&&r.stck_bsop_date>=from&&r.stck_bsop_date<=to&&/^\d+$/.test(r.stck_clpr??'')&&BigInt(r.stck_clpr)>0n).sort((a:any,b:any)=>b.stck_bsop_date.localeCompare(a.stck_bsop_date));
  if(!valid.length)throw new HistoricalPriceError('KIS_PRICE_NO_DATA','NO_DATA');
  if(new Set(valid.map((r:any)=>r.stck_bsop_date)).size!==valid.length)throw new HistoricalPriceError('KIS_PRICE_DUPLICATE_DATE','PARSE');rows.push(valid);
 }
 const rawSeries=rows[0]!,adjustedSeries=rows[1]!;
 const raw=rawSeries.find((r:any)=>r.stck_bsop_date<=periodEnd),adjusted=adjustedSeries.find((r:any)=>r.stck_bsop_date===raw?.stck_bsop_date);
 if(!raw||!adjusted)throw new HistoricalPriceError('KIS_PRICE_PERIOD_COVERAGE','NO_DATA');
 const compatible=raw.stck_clpr===adjusted.stck_clpr;
 const periodBasis=disclosedAt?verifyPeriodPriceBasis(rawSeries,adjustedSeries,raw.stck_bsop_date,to):undefined;
 return {symbol,value:raw.stck_clpr,date:raw.stck_bsop_date.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'),source:'KIS_KRX_UNADJUSTED_CLOSE',collectedAt:new Date().toISOString(),shareBasis:compatible?'ORIGINAL_EQUALS_ADJUSTED':'CORPORATE_ACTION_BASIS_UNCONFIRMED',...(periodBasis?{periodBasis:{...periodBasis,symbol,periodEnd:end.toISOString().slice(0,10),disclosedAt:disclosedAt!.toISOString().slice(0,10)}}:{})};
}

/** Later corporate actions may adjust the entire past series. Check only the reporting interval.
 * An intersecting factor interval permits one won of provider rounding, not percentage drift. */
export function verifyPeriodPriceBasis(raw:any[],adjusted:any[],start:string,end:string){
 const originals=raw.filter(r=>r.stck_bsop_date>=start&&r.stck_bsop_date<=end).sort((a,b)=>a.stck_bsop_date.localeCompare(b.stck_bsop_date));
 const adjustedRows=adjusted.filter(r=>r.stck_bsop_date>=start&&r.stck_bsop_date<=end);
 if(originals.length<2||originals.length!==adjustedRows.length||originals[0]?.stck_bsop_date!==start)return undefined;
 const byDate=new Map(adjustedRows.map(r=>[r.stck_bsop_date,r]));
 if(byDate.size!==adjustedRows.length||new Set(originals.map(r=>r.stck_bsop_date)).size!==originals.length)return undefined;
 const day=(s:string)=>Date.parse(s.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'));
 if(day(end)-day(originals.at(-1)!.stck_bsop_date)>7*86400000)return undefined;
 let lower=new Prisma.Decimal(0),upper=new Prisma.Decimal('1e20');
 for(let i=0;i<originals.length;i++){
  const r=originals[i]!,a=byDate.get(r.stck_bsop_date);
  if(!a||!/^\d+$/.test(r.stck_clpr??'')||!/^\d+$/.test(a.stck_clpr??'')||BigInt(r.stck_clpr)<=0n||BigInt(a.stck_clpr)<=0n)return undefined;
  if(r.mod_yn!=='N'||!/^0(?:\.0+)?$/.test(r.prtt_rate??'')||r.revl_issu_reas?.trim())return undefined;
  if(i&&day(r.stck_bsop_date)-day(originals[i-1]!.stck_bsop_date)>10*86400000)return undefined;
  const price=new Prisma.Decimal(r.stck_clpr),adjustedPrice=new Prisma.Decimal(a.stck_clpr);
  lower=Prisma.Decimal.max(lower,adjustedPrice.minus(1).div(price));upper=Prisma.Decimal.min(upper,adjustedPrice.plus(1).div(price));
  if(lower.gt(upper))return undefined;
 }
 return {method:'KIS_CONSTANT_ADJUSTMENT_FACTOR_NO_SPLIT_TO_DISCLOSURE',from:start.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'),through:originals.at(-1)!.stck_bsop_date.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'),observations:originals.length,verifiedAt:new Date().toISOString()};
}
