import {closingRoeNotices} from '../domain/closing-parent-roe.js';
import {publicDartReview} from '../domain/dart-review.js';
import {productPolicy} from '../domain/product-policy.js';
import {hasInitialQuery} from '../domain/stock-search.js';
import type {MarketType} from '../generated/prisma/index.js';
export type ValueFilter={query?:string;market?:MarketType};
import {valueCollectionStatus} from '../domain/value-collection-status.js';
import {prisma} from '../lib/prisma.js';
import {selectValueListAnalysis} from '../domain/value-list-analysis.js';
import {latestStoredDisplayShares} from '../domain/share-counts.js';
import {fairPrice} from '../domain/value-analysis.js';
export const valueFinancialInclude=(year:number)=>({
 fundamentals:{select:{updatedAt:true}},
 financialStatements:{where:{fiscalYear:{gte:year-1,lte:year},periodType:'ANNUAL' as const},orderBy:{fiscalYear:'desc' as const}},
 periodValuations:{where:{fiscalYear:{gte:year-1,lte:year},periodType:{in:['ESTIMATE','ANNUAL']}},orderBy:{updatedAt:'desc' as const}},
 valuationMetrics:{where:{metricDate:{gte:new Date(Date.UTC(year-1,0,1)),lt:new Date(Date.UTC(year+1,0,1))}},orderBy:{metricDate:'desc' as const}},
 dartShareSnapshots:{where:{fiscalYear:{lte:year},shareClass:'COMMON',OR:[{issuedShares:{not:null}},{treasuryShares:{not:null}},{outstandingShares:{not:null}}]},orderBy:[{periodEndDate:'desc' as const},{receiptNo:'desc' as const}],take:2},
 dartBackfillTasks:{where:{fiscalYear:{gte:year-1,lte:year},periodType:'ANNUAL' as const},select:{fiscalYear:true,periodType:true,status:true,errorCode:true,diagnostics:true}},
 dartFinancialFilings:{where:{fiscalYear:{gte:year-1,lte:year},isWithdrawn:false},orderBy:[{receiptDate:'desc' as const},{collectedAt:'desc' as const},{receiptNo:'desc' as const}]},
});
type PreviousPrice={symbol:string;codeRevision?:number;currentPrice:string|null;previousClosePrice:string|null;priceUpdatedAt:string|null;collectionErrors?:string[]};
const loadSecurities=(db:typeof prisma,year:number,ids?:bigint[],filter?:ValueFilter)=>db.security.findMany({where:{isActive:true,...(ids?{id:{in:ids}}:{}),...(filter?.market?{marketType:filter.market}:{}),...(filter?.query&&!hasInitialQuery(filter.query)?{OR:[{name:{contains:filter.query}},{symbol:{contains:filter.query}}]}:{})},include:{marketPrice:true,...valueFinancialInclude(year)}});
export async function loadValueRows(year:number,ids?:bigint[],previous?:Map<string,PreviousPrice>,db:typeof prisma=prisma,filter?:ValueFilter){return projectValueRows(await loadSecurities(db,year,ids,filter),year,previous);}
export function projectValueRows(securities:Awaited<ReturnType<typeof loadSecurities>>,year:number,previous?:Map<string,PreviousPrice>){
 return securities.map(s=>{
  const candidate=previous?.get(String(s.id)),prior=candidate?.symbol===s.symbol&&candidate?.codeRevision===s.codeRevision?candidate:undefined;
  // A financial change retains the price snapshot, including a missing price; it is not an intraday price refresh.
  const currentPrice=prior?prior.currentPrice:s.marketPrice?.currentPrice.toString()??null;
  const analysis=selectValueListAnalysis({year,price:currentPrice,metrics:s.valuationMetrics??[],periods:s.periodValuations??[],manual:s.financialStatements??[],filings:(s.dartFinancialFilings??[]).filter(f=>f.periodType==='ANNUAL')});
  const {metric,...selected}=analysis,basisYear=analysis.metricBasis.year??year;
  const shares=latestStoredDisplayShares(s.dartShareSnapshots??[],s.dartFinancialFilings??[],year);
  const selectedRow=(s.periodValuations??[]).find(v=>v.fiscalYear===basisYear&&v.periodType===(analysis.dataPriority===1?'ESTIMATE':'ANNUAL'));
  const tasks=(s.dartBackfillTasks??[]).filter(t=>t.fiscalYear===basisYear&&t.periodType==='ANNUAL');
  const shareMissingReason=shares.issuedShares===null?'선택 연도까지 저장된 해당 주식 종류의 확정 공시 주식수가 없습니다. 임의 역산하지 않습니다.':null;
  const missingReasons={...selected.missingReasons,issuedShares:shares.issuedShares===null?'SHARES_BASIS_UNAVAILABLE':null};
  const {collectionErrors,collectionStatus:financialStatus}=valueCollectionStatus(missingReasons,selectedRow,tasks);collectionErrors.push(...(prior?.collectionErrors??[]).filter(e=>e.startsWith('PRICE_')));const collectionStatus=collectionErrors.length?'ERROR':financialStatus;
  return {id:String(s.id),codeRevision:s.codeRevision,symbol:s.symbol,name:s.name,securityType:s.securityType,productPolicy:productPolicy(s.securityType),marketType:s.marketType,market:s.marketType,currentPrice,
   previousClosePrice:prior?prior.previousClosePrice:s.marketPrice?.previousClosePrice?.toString()??null,
   valuation:metric,
   priceUpdatedAt:prior?prior.priceUpdatedAt:s.marketPrice?.priceUpdatedAt.toISOString()??null,
   per:metric?.per??null,pbr:metric?.pbr??null,metricDate:metric?.metricDate??null,...selected,...shares,
   missingReasons,shareMissingReason,collectionStatus,collectionErrors,sourceReasons:selectedRow?.reasons??{},sourceReviews:tasks.filter(t=>t.errorCode==='REVIEW_REQUIRED'||t.errorCode==='DART_SOURCE_REVIEW').map(t=>publicDartReview(t.diagnostics)),requiredReturn:'8.0',
   statementBasis:selected.netIncomeBasis?.source??null,statementYear:selected.netIncomeBasis?.year??null,
   fundamentalsUpdatedAt:s.fundamentals?.updatedAt.toISOString()??null,
   fairPrices:['0.7','0.8','0.9','1.0'].map(persistence=>({persistence,price:fairPrice(metric,persistence)})),
   notices:[...closingRoeNotices(metric?.provenance),...selected.notices,'발행주식수와 EPS 가중평균 분모 및 RIM 수정 주식수는 다른 기준입니다. 표시 주식수로 임의 대체하지 않습니다.'],
  };
 });
}
export type ValueReadRow=Awaited<ReturnType<typeof loadValueRows>>[number];
/** Omit internal snapshot fields from list transport; retain list basis labels and warnings. */
export const publicValueRows=(rows:ValueReadRow[],compact=false)=>rows.map(({valuation: _valuation,codeRevision: _revision,...row})=>{
 if(!compact)return row;
 // Full calculation evidence is loaded from original period records by the detail route.
 const {provenance:_provenance,...metricBasis}=row.metricBasis;
 return {...row,metricBasis};
});
