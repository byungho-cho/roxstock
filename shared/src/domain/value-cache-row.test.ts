import test from 'node:test';import assert from 'node:assert/strict';
import {compactValueCacheRow,detailedCachedValuation} from '../read-model/value-cache-row.js';

function fixture(){
 const raw={source:'OPEN_DART',receiptNo:'20260301000001',periodEnd:'2025-12-31',fsDivision:'CFS',fiscalYear:2025,bpsReferenceOnly:true,accounts:{document:'x'.repeat(100000)},perMetric:{bps:{source:'KIS_API',fiscalYear:2025,bpsReferenceOnly:true,perMetric:{nested:{raw:'y'.repeat(100000)}}}}};
 const valuation={metricDate:'2025-12-31',fiscalYear:2025,periodType:'ANNUAL',currency:'KRW',rimCompatible:false,eps:'0',bps:'-12.3456',roe:'-1.23',per:null,pbr:null,provenance:raw};
 return {raw,row:{id:'1',symbol:'005930',currentPrice:'12345',previousClosePrice:'12000',priceUpdatedAt:'2026-10-23',valuation,metricBasis:{year:2025,source:'OPEN_DART/KIS_API',division:'CFS',provenance:raw},w:null,targetPrice:null,fairPrices:[{price:null}],collectionErrors:['PRICE_COLLECTION_FAILED_LAST_VALUE_RETAINED'],notices:['reference warning']}};
}

test('cache omits duplicate/nested evidence without changing values, source labels or warnings',()=>{
 const {row}=fixture(),before=JSON.stringify(row),packed=compactValueCacheRow(row);
 assert.equal(JSON.stringify(row),before);assert.ok(JSON.stringify(packed).length<1500);
 assert.deepEqual(packed.metricBasis.provenance,{});assert.equal(packed.metricBasis.source,row.metricBasis.source);
 assert.deepEqual(packed.valuation.provenance.perMetric,{bps:{source:'KIS_API',fiscalYear:2025,bpsReferenceOnly:true}});
 const {provenance:_,...numbers}=packed.valuation,{provenance:__,...original}=row.valuation;assert.deepEqual(numbers,original);
 for(const key of ['currentPrice','previousClosePrice','priceUpdatedAt','fairPrices','collectionErrors','notices'] as const)assert.deepEqual(packed[key],row[key]);
 assert.deepEqual(compactValueCacheRow(packed),packed);
});

test('detail evidence is restored only for the same cached values and source identity',()=>{
 const {row,raw}=fixture(),packed=compactValueCacheRow(row);
 assert.equal(detailedCachedValuation(packed.valuation,row.valuation)?.provenance,raw);
 for(const changed of [{eps:'1'},{bps:'0'},{fiscalYear:2024},{rimCompatible:true},{provenance:{...raw,receiptNo:'different'}}]){
  assert.equal(detailedCachedValuation(packed.valuation,{...row.valuation,...changed}),packed.valuation);
 }
 assert.equal(detailedCachedValuation(null,row.valuation),null);
 assert.equal(detailedCachedValuation(packed.valuation,null),packed.valuation);
});
