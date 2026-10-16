import type {KisFundamentalSnapshot} from '../generated/prisma/index.js';
/** Keep current KIS references separate from fiscal-period values and RIM inputs. */
export function currentKisSupplement(row:KisFundamentalSnapshot|null){
 if(!row)return null;
 return {source:row.source,collectedAt:row.collectedAt.toISOString(),observedDate:row.observedDate.toISOString().slice(0,10),sourceAsOf:null,basis:'CURRENT_REFERENCE_ONLY',per:row.per?.toString()??null,pbr:row.pbr?.toString()??null,eps:row.eps?.toString()??null,bps:row.bps?.toString()??null,listedShares:row.listedShares?.toString()??null,foreignHoldingShares:row.foreignHoldingShares?.toString()??null,foreignHoldingRatio:row.foreignHoldingRatio?.toString()??null,foreignExhaustionRate:row.foreignExhaustionRate?.toString()??null,ratioBasis:'FOREIGN_SHARES_DIVIDED_BY_LISTED_SHARES'};
}
