/** A reviewed IPO date only establishes absence of a market close, never a substitute price. */
export type ListingPeriodReview={method:'REVIEWED_PRE_LISTING_NO_MARKET_CLOSE';symbol:string;receiptNo:string;periodEnd:string;listingDate:string;sourceUrls:string[];verifiedAt:string};
const day=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function preListingPriceReviewMatches(review:unknown,identity:{symbol?:string|null;receiptNo?:string|null;periodEnd?:string|null}){
 const r=review as ListingPeriodReview|undefined;if(!r||r.method!=='REVIEWED_PRE_LISTING_NO_MARKET_CLOSE'||r.symbol!==identity.symbol||r.receiptNo!==identity.receiptNo||r.periodEnd!==identity.periodEnd||!/^\d{14}$/.test(r.receiptNo)||!day(r.periodEnd)||!day(r.listingDate)||r.listingDate<=r.periodEnd||!Number.isFinite(Date.parse(r.verifiedAt))||!Array.isArray(r.sourceUrls)||new Set(r.sourceUrls).size<2)return false;
 return r.sourceUrls.every(source=>{try{const u=new URL(source);return u.protocol==='https:'&&!u.username&&!u.password&&['dart.fss.or.kr','kind.krx.co.kr','www.yna.co.kr','www.mt.co.kr','m.inews24.com'].includes(u.hostname);}catch{return false;}});
}
