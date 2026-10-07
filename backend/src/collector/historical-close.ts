import type { Supplemental } from '../domain/period-valuation.js';
export class HistoricalPriceError extends Error {
 constructor(public readonly code:string, public readonly category:'AUTH'|'COMMUNICATION'|'RATE_LIMIT'|'PROVIDER'|'NO_DATA', public readonly providerCode?:string) { super(code); }
}
const authCodes=['20','21','30','31','32','SERVICE_KEY_IS_NOT_REGISTERED_ERROR','SERVICE_ACCESS_DENIED_ERROR'];
function providerError(code:string):HistoricalPriceError {
 return new HistoricalPriceError(authCodes.includes(code)?'HISTORICAL_PRICE_AUTH':code==='22'?'HISTORICAL_PRICE_RATE_LIMIT':'HISTORICAL_PRICE_PROVIDER',authCodes.includes(code)?'AUTH':code==='22'?'RATE_LIMIT':'PROVIDER',code);
}
/** Exact ordinary-share symbol and period-end window; no live-price fallback. */
export async function historicalClose(symbol:string,end:Date,fetcher:typeof fetch=fetch):Promise<Supplemental['price']> {
 const configured=process.env.DATA_GO_KR_STOCK_PRICE_KEY?.trim()||process.env.DATA_GO_KR_SERVICE_KEY?.trim();
 if(!configured)throw new HistoricalPriceError('HISTORICAL_PRICE_KEY_MISSING','AUTH');
 // Public-data portals offer encoded and decoded keys. URLSearchParams encodes once.
 let key=configured;
 try { if(/%[0-9a-f]{2}/i.test(key))key=decodeURIComponent(key); } catch { throw new HistoricalPriceError('HISTORICAL_PRICE_KEY_FORMAT','AUTH'); }
 const date=(d:Date)=>d.toISOString().slice(0,10).replaceAll('-','');
 const normalized=symbol.replace(/^A/,'');
 const from=date(new Date(end.getTime()-7*86400000));
 const url=new URL('https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo');
 url.search=new URLSearchParams({serviceKey:key,resultType:'json',numOfRows:'100',pageNo:'1',srtnCd:normalized,beginBasDt:from,endBasDt:date(end)}).toString();
 let response:Response;
 try { response=await fetcher(url,{signal:AbortSignal.timeout(15000)}); }
 catch { throw new HistoricalPriceError('HISTORICAL_PRICE_COMMUNICATION','COMMUNICATION'); }
 if(!response.ok)throw new HistoricalPriceError(response.status===401||response.status===403?'HISTORICAL_PRICE_AUTH':response.status===429?'HISTORICAL_PRICE_RATE_LIMIT':'HISTORICAL_PRICE_HTTP',response.status===401||response.status===403?'AUTH':response.status===429?'RATE_LIMIT':'COMMUNICATION',String(response.status));
 const raw=await response.text();
 let body:{response?:{header?:{resultCode?:string};body?:{items?:{item?:{srtnCd:string;basDt:string;clpr:string}[]|{srtnCd:string;basDt:string;clpr:string}}}}};
 try { body=JSON.parse(raw); }
 catch { const code=raw.match(/<(?:returnReasonCode|resultCode)>([^<]+)</)?.[1];throw code?providerError(code):new HistoricalPriceError('HISTORICAL_PRICE_INVALID_RESPONSE','PROVIDER'); }
 const code=body.response?.header?.resultCode??'';
 if(!['00','000'].includes(code))throw providerError(code);
 const items=body.response?.body?.items?.item;
 const rows=Array.isArray(items)?items:items?[items]:[];
 const row=rows.filter(r=>r.srtnCd?.replace(/^A/,'')===normalized&&/^\d{8}$/.test(r.basDt)&&r.basDt<=date(end)&&r.basDt>=from&&Number(r.clpr)>0).sort((a,b)=>b.basDt.localeCompare(a.basDt))[0];
 if(!row)throw new HistoricalPriceError('HISTORICAL_PRICE_NO_DATA','NO_DATA');
 return {value:row.clpr,date:row.basDt.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'),source:'FSC_STOCK_PRICE_UNADJUSTED_CLOSE'};
}
