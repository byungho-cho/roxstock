import {Prisma} from '@roxstock/shared/prisma';
import {persistentKisToken} from '@roxstock/shared/lib/kis-token-cache';
import {request} from './kis-historical-close.js';
import {HistoricalPriceError} from './historical-price-error.js';
/** Same dated annual endpoints/units as investor-crawler; never undated current quote metrics. */
export function kisAnnualPeriodEnd(ym:string,fiscalMonth=12){if(!Number.isInteger(fiscalMonth)||fiscalMonth<1||fiscalMonth>12||!/^\d{6}$/.test(ym)||ym.slice(4)!==String(fiscalMonth).padStart(2,'0'))return null;return new Date(Date.UTC(Number(ym.slice(0,4)),fiscalMonth,0)).toISOString().slice(0,10);}
export async function kisAnnualFundamentals(symbol:string,fetcher:typeof fetch=fetch,fiscalMonth=12){
 if(!Number.isInteger(fiscalMonth)||fiscalMonth<1||fiscalMonth>12)throw new HistoricalPriceError('KIS_ANNUAL_MONTH','PARSE');
 const appkey=process.env.KIS_APP_KEY?.trim(),appsecret=process.env.KIS_APP_SECRET?.trim(),origin='https://openapi.koreainvestment.com:9443';
 if(!appkey||!appsecret)return [];
 if(!/^[A-Z0-9]{6}$/.test(symbol)||symbol.startsWith('Z99'))return [];
 const access=await persistentKisToken({appKey:appkey,appSecret:appsecret,origin,issue:async()=>{const body=await request('/oauth2/tokenP',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',appkey,appsecret})},fetcher,'valuation');if(typeof body.access_token!=='string'||Number(body.expires_in)<=60)throw new HistoricalPriceError('KIS_ANNUAL_TOKEN','AUTH');return {token:body.access_token,expiresAt:Date.now()+Number(body.expires_in)*1000};}});
 const tables:Map<string,Record<string,string>>[]=[];
 for(const [endpoint,tr]of [['financial-ratio','FHKST66430300'],['balance-sheet','FHKST66430100'],['income-statement','FHKST66430200']]){
  const params=new URLSearchParams({FID_DIV_CLS_CODE:'0',fid_div_cls_code:'0',fid_cond_mrkt_div_code:'J',fid_input_iscd:symbol});
  const body=await request('/uapi/domestic-stock/v1/finance/'+endpoint+'?'+params,{headers:{authorization:'Bearer '+access.token,appkey,appsecret,tr_id:tr!,custtype:'P'}},fetcher,'valuation');
  if(!Array.isArray(body.output))throw new HistoricalPriceError('KIS_ANNUAL_SCHEMA','PARSE');
  const table=new Map<string,Record<string,string>>();
  for(const row of body.output){if(!kisAnnualPeriodEnd(row.stac_yymm??'',fiscalMonth))continue;if(table.has(row.stac_yymm))throw new HistoricalPriceError('KIS_ANNUAL_DUPLICATE','PARSE');table.set(row.stac_yymm,row);}tables.push(table);
 }
 const number=(v:unknown)=>{if(v==null||v===''||v==='-')return null;const text=String(v).replaceAll(',','');if(!/^-?\d{1,24}(\.\d{1,4})?$/.test(text))throw new HistoricalPriceError('KIS_ANNUAL_NUMBER','PARSE');return new Prisma.Decimal(text).toString();};
 const won=(v:unknown)=>{const n=number(v);return n===null?null:new Prisma.Decimal(n).mul(100000000).toString();};
 return [...tables[0]!].map(([ym,r])=>{const b=tables[1]!.get(ym),i=tables[2]!.get(ym);return {source:'KIS_API',periodType:'ANNUAL',fiscalYear:Number(ym.slice(0,4)),periodEnd:kisAnnualPeriodEnd(ym,fiscalMonth)!,stacYymm:ym,eps:number(r.eps),bps:number(r.bps),roe:number(r.roe_val),equity:won(b?.total_cptl),assets:won(b?.total_aset),netIncome:won(i?.thtr_ntin),revenue:won(i?.sale_account),collectedAt:new Date().toISOString(),currency:'KRW',amountUnit:'HUNDRED_MILLION_KRW',division:'UNVERIFIED'};});
}
