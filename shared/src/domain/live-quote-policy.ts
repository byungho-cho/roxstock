import {isMarketClosed} from './market-calendar.js';
import {quoteLimit,type LiveQuote,type QuoteMarket} from './live-quotes.js';
export const liveQuotePolicyVersion='dual-market-v1';
const time=(now:Date)=>{const k=new Date(+now+9*3600000);return {day:k.toISOString().slice(0,10),seconds:k.getUTCHours()*3600+k.getUTCMinutes()*60+k.getUTCSeconds()};};
export function quoteSession(now:Date){const {day,seconds}=time(now);if(isMarketClosed(day))return 'closed';if(seconds>=32400&&seconds<55800)return 'regular';if(seconds>=28800&&seconds<31800||seconds>=56400&&seconds<72000)return 'extended';return 'closed';}
/** At most two feeds per logical TOTAL symbol, never three. KRX/NXT direct views stay exact. */
export function physicalQuoteKeys(key:string,now:Date):string[]{const [market,symbol]=key.split(':');return market==='TOTAL'?[key,`${quoteSession(now)==='extended'?'NXT':'KRX'}:${symbol}`]:[key];}
/** Allocate whole logical groups; never silently subscribe half of a fallback pair. */
export function quoteSubscriptionPlan(logical:readonly string[],now:Date,limit=quoteLimit){const keys=new Set<string>(),denied=new Set<string>();for(const key of new Set(logical)){const group=physicalQuoteKeys(key,now),added=group.filter(k=>!keys.has(k));if(keys.size+added.length>limit){denied.add(key);continue;}group.forEach(k=>keys.add(k));}return {keys:[...keys],denied};}
export function freshQuote(q:LiveQuote|undefined,now:Date,since=0):q is LiveQuote{return !!q&&q.source==='KIS'&&q.receivedAt>=since&&q.receivedAt<=+now+60000&&+now-q.receivedAt<=30000&&Date.parse(q.observedAt)<=+now+60000&&+now-Date.parse(q.observedAt)<=30000&&time(new Date(q.observedAt)).day===time(now).day;}
/** Select a complete physical tuple; no mixed price/change/rate/time and no synthetic receipt time. */
export function selectTotalQuote(symbol:string,quotes:ReadonlyMap<string,LiveQuote>,now:Date,since=0):LiveQuote|undefined {
 const phase=quoteSession(now),get=(m:QuoteMarket)=>quotes.get(`${m}:${symbol}`),order:QuoteMarket[]=phase==='extended'?['NXT','TOTAL']:['TOTAL','KRX'];
 const fresh=phase!=='closed'?order.map(get).find(q=>freshQuote(q,now,since)):undefined;
 const candidates=phase==='closed'?(['TOTAL','KRX','NXT'] as const).map(get):[...order.map(get),get(phase==='extended'?'KRX':'NXT')];
 // Preserve the most recent actual trade when no live source exists, then use REST/cache as a reference.
 return fresh??candidates.filter((q):q is LiveQuote=>!!q&&q.source==='KIS').sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0]??candidates.find(q=>!!q);
}
export function logicalTotalQuote(q:LiveQuote):LiveQuote{return {...q,market:'TOTAL',sourceMarket:q.market,sequence:undefined};}
