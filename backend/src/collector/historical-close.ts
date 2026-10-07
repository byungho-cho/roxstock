import type {Supplemental} from '../domain/period-valuation.js';
/** Public-data credential (dedicated or existing shared key) and bounded request; no live-price fallback. */
export async function historicalClose(symbol:string,end:Date,fetcher:typeof fetch=fetch):Promise<Supplemental['price']> {
 const key=process.env.DATA_GO_KR_STOCK_PRICE_KEY?.trim()||process.env.DATA_GO_KR_SERVICE_KEY?.trim();if(!key)return undefined;
 const date=(d:Date)=>d.toISOString().slice(0,10).replaceAll('-','');
 const url=new URL('https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo');
 url.search=new URLSearchParams({serviceKey:key,resultType:'json',numOfRows:'10',pageNo:'1',likeSrtnCd:symbol.replace(/^A/,''),beginBasDt:date(new Date(end.getTime()-7*86400000)),endBasDt:date(end)}).toString();
 const response=await fetcher(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('HISTORICAL_PRICE_HTTP');
 const body=await response.json() as {response?:{header?:{resultCode:string};body?:{items?:{item?:{srtnCd:string;basDt:string;clpr:string}[]}}}};
 if(!['00','000'].includes(body.response?.header?.resultCode??''))throw new Error('HISTORICAL_PRICE_RESPONSE');
 const rows=body.response?.body?.items?.item??[];
 const row=rows.filter(r=>r.srtnCd.replace(/^A/,'')===symbol.replace(/^A/,'')&&/^\d{8}$/.test(r.basDt)&&r.basDt<=date(end)&&r.basDt>=date(new Date(end.getTime()-7*86400000))&&Number(r.clpr)>0).sort((a,b)=>b.basDt.localeCompare(a.basDt))[0];
 return row?{value:row.clpr,date:row.basDt.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'),source:'FSC_STOCK_PRICE_UNADJUSTED_CLOSE'}:undefined;
}
