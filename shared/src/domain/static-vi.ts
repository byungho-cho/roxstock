import type {LiveQuote} from './live-quotes.js';

/** Ordinary KOSPI/KOSDAQ stock ticks (KRX, effective 2023-01-25). */
export function stockTick(price:number):number {
    return price<2000?1:price<5000?5:price<20000?10:price<50000?50:price<200000?100:price<500000?500:1000;
}

/**
 * Static-VI boundaries from the provider's moving reference, never the open/close.
 * Only an actual venue's positive reference for an ordinary stock is supported.
 * KRX/NXT static VI: 10%; round outward to a tradable tick at each boundary.
 * https://www.daolsecurities.com/customer/guide/stockRelieve.jsp
 * https://regulation.krx.co.kr/contents/RGL/03/03020100/RGL03020100.jsp
 */
export function staticViPrices(quote:LiveQuote|null|undefined,eligible:boolean) {
    const market=quote?.sourceMarket??quote?.market,base=quote?.viReferencePrice;
    if(!eligible||quote?.source!=='KIS'||(market!=='KRX'&&market!=='NXT')||!Number.isSafeInteger(base)||!base||base<=0||!Number.isSafeInteger(base*11))return null;
    const upperTick=stockTick(base*11/10),lowerTick=stockTick(base*9/10);
    return {upper:Math.ceil(base*11/(10*upperTick))*upperTick,lower:Math.floor(base*9/(10*lowerTick))*lowerTick,market};
}
