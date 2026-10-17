import {ProviderError} from './provider.mjs';

/** Official authenticated daily API. It supplies listed shares, not fiscal EPS/PER. */
export class KrxFundamentalProvider {
 constructor({key=process.env.KRX_API_KEY,fetcher=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){this.key=key?.trim();this.fetcher=fetcher;this.sleep=sleep;this.cache=new Map();this.lastRequestAt=0;}
 async currentFundamentals(symbol,market,observedDate){
  if(!this.key)throw new ProviderError('KRX_KEY_MISSING');
  if(!/^[A-Z0-9]{6}$/.test(symbol)||symbol.startsWith('Z99')||!['KOSPI','KOSDAQ'].includes(market))throw new ProviderError('KRX_INVALID_TARGET');
  for(let offset=0;offset<=7;offset++){
   const date=new Date(Date.parse(observedDate+'T00:00:00Z')-offset*86400000).toISOString().slice(0,10),id=market+':'+date;
   const hit=this.cache.get(id);let rows=hit&&hit.expires>Date.now()?hit.rows:null;
   if(!rows){
    if(this.lastRequestAt)await this.sleep(Math.max(0,2000-(Date.now()-this.lastRequestAt)));
    this.lastRequestAt=Date.now();
    const endpoint=market==='KOSPI'?'stk_bydd_trd':'ksq_bydd_trd';
    let response,body;
    try{response=await this.fetcher('https://data-dbg.krx.co.kr/svc/apis/sto/'+endpoint+'?basDd='+date.replaceAll('-',''),{headers:{AUTH_KEY:this.key,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new ProviderError('KRX_COMMUNICATION');}
    if(!response.ok)throw new ProviderError(response.status===429?'KRX_RATE_LIMIT':'KRX_AUTH_OR_REQUEST_FAILED');
    try{body=await response.json();}catch{throw new ProviderError('KRX_RESPONSE_PARSE');}
    if(!Array.isArray(body.OutBlock_1)||body.OutBlock_1.some(r=>!r||typeof r.ISU_CD!=='string'||typeof r.BAS_DD!=='string'))throw new ProviderError('KRX_RESPONSE_SCHEMA');
    rows=body.OutBlock_1;if(this.cache.size>=32)this.cache.delete(this.cache.keys().next().value);this.cache.set(id,{rows,expires:Date.now()+(rows.length?3600000:30000)});
   }
   // Advance through closed market days only, never through a missing stock.
   if(!rows.length)continue;
   const matches=rows.filter(r=>r.ISU_CD===symbol);
   if(matches.length!==1)throw new ProviderError('KRX_SYMBOL_NO_DATA_OR_DUPLICATE');
   const row=matches[0],listed=typeof row.LIST_SHRS==='string'?row.LIST_SHRS.replaceAll(',','').trim():'';
   if(row.BAS_DD.replaceAll('/','').replaceAll('-','')!==date.replaceAll('-','')||!/^\d{1,24}$/.test(listed)||BigInt(listed)<=0n)throw new ProviderError('KRX_INVALID_SHARE_COUNT_OR_DATE');
   return {source:'KRX',sourceAsOf:date,listedShares:listed,collectedAt:new Date(),raw:{LIST_SHRS:row.LIST_SHRS,BAS_DD:row.BAS_DD,ISU_CD:row.ISU_CD}};
  }
  throw new ProviderError('KRX_NO_RECENT_DATA');
 }
}

/** One shared observation: KIS wins, KRX fills only a missing supported field. */
export function mergeCurrentFundamentals(kis,krx){
 const result={per:null,pbr:null,eps:null,bps:null,listedShares:null,foreignHoldingShares:null,foreignExhaustionRate:null,...kis};
 const fieldSources={};
 for(const key of ['per','pbr','eps','bps','listedShares','foreignHoldingShares','foreignExhaustionRate'])if(result[key]!=null)fieldSources[key]={source:'KIS_API',sourceAsOf:null,collectedAt:kis.collectedAt.toISOString()};
 if(result.listedShares==null&&krx?.listedShares!=null){result.listedShares=krx.listedShares;fieldSources.listedShares={source:'KRX',sourceAsOf:krx.sourceAsOf,collectedAt:krx.collectedAt.toISOString()};}
 // Ownership is derived only from the same KIS observation's numerator/denominator.
 result.ratioCompatible=kis?.listedShares!=null&&kis?.foreignHoldingShares!=null;
 result.source=[...new Set(Object.values(fieldSources).map(v=>v.source))].join('+');
 if(!result.source)throw new ProviderError('NO_FUNDAMENTAL_DATA');
 result.collectedAt=kis?.collectedAt??krx.collectedAt;
 result.raw={...(kis?.raw??{}),fieldSources,krx:krx?.raw??null};
 return result;
}
