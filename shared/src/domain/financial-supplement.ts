import type {FundamentalSnapshot} from '../generated/prisma/index.js';
/** Shared current references for both screens; never substitute them for fiscal values. */
export function currentFundamentalSupplement(row:FundamentalSnapshot|null){
 if(!row)return null;
 const raw=row.raw&&typeof row.raw==='object'&&!Array.isArray(row.raw)?row.raw:{};
 return {fieldSources:'fieldSources' in raw?raw.fieldSources:null,source:row.source,collectedAt:row.collectedAt.toISOString(),observedDate:row.observedDate.toISOString().slice(0,10),sourceAsOf:null,basis:'CURRENT_REFERENCE_ONLY',per:row.per?.toString()??null,pbr:row.pbr?.toString()??null,eps:row.eps?.toString()??null,bps:row.bps?.toString()??null,listedShares:row.listedShares?.toString()??null,foreignHoldingShares:row.foreignHoldingShares?.toString()??null,foreignHoldingRatio:row.foreignHoldingRatio?.toString()??null,foreignExhaustionRate:row.foreignExhaustionRate?.toString()??null,ratioBasis:'FOREIGN_SHARES_DIVIDED_BY_LISTED_SHARES'};
}
