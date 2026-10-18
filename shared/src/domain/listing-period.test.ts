import test from 'node:test';import assert from 'node:assert/strict';import {preListingPriceReviewMatches} from './listing-period.js';
const identity={symbol:'387690',receiptNo:'20260814000947',periodEnd:'2026-06-30'},review={method:'REVIEWED_PRE_LISTING_NO_MARKET_CLOSE',...identity,listingDate:'2026-07-13',sourceUrls:['https://www.yna.co.kr/view/example','https://www.mt.co.kr/stock/example'],verifiedAt:'2026-10-18T09:00:00Z'};
test('pre-listing review requires exact source identity, real dates and corroborating sources',()=>{
 assert.equal(preListingPriceReviewMatches(review,identity),true);
 for(const change of [{symbol:'365660'},{receiptNo:'20260814000948'},{periodEnd:'2026-09-30'},{listingDate:'2026-06-01'},{listingDate:'2026-02-30'},{sourceUrls:['https://www.yna.co.kr/view/example']},{sourceUrls:['https://www.yna.co.kr/view/example','https://invalid.example/source']}])assert.equal(preListingPriceReviewMatches({...review,...change},identity),false);
});
