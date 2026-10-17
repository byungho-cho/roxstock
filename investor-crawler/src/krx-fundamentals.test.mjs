import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KrxFundamentalProvider,mergeCurrentFundamentals} from './krx-fundamentals.mjs';
import {supplementData,mergeStoredSnapshot} from './kis-supplements.mjs';

test('KIS wins; KRX only fills missing listed shares, never invents fiscal shares or mixed-date ownership',()=>{
 const date=new Date('2026-10-17T01:00:00Z');
 const krx={listedShares:'2000',sourceAsOf:'2026-10-16',collectedAt:date,raw:{LIST_SHRS:'2,000'}};
 const kis={per:'6.3',pbr:'0.22',eps:'323',bps:'9280',listedShares:'1000',foreignHoldingShares:'25',foreignExhaustionRate:'2.5',collectedAt:date,raw:{}};
 const preferred=mergeCurrentFundamentals(kis,krx);assert.equal(preferred.listedShares,'1000');assert.equal(preferred.source,'KIS_API');
 const merged=mergeCurrentFundamentals({...kis,listedShares:null},krx);
 assert.equal(merged.listedShares,'2000');assert.equal(merged.per,'6.3');assert.equal(merged.raw.fieldSources.listedShares.sourceAsOf,'2026-10-16');assert.equal(merged.source,'KIS_API+KRX');
 const data=supplementData(merged,{id:1n,symbol:'008420',isActive:true,collectionExcluded:false,excludedFeatures:[]},date);
 assert.equal(data.foreignHoldingRatio,null);assert.ok(!('issuedShares' in data));assert.ok(!('treasuryShares' in data));assert.ok(!('outstandingShares' in data));
 const excluded=supplementData(merged,{id:1n,symbol:'008420',isActive:true,collectionExcluded:false,excludedFeatures:['share-counts']},date);
 assert.equal(excluded.listedShares,null);assert.equal(excluded.raw.krx,undefined);assert.equal(excluded.raw.fieldSources.listedShares,undefined);
 const fallback=mergeCurrentFundamentals(null,krx);assert.equal(fallback.per,null);assert.equal(fallback.source,'KRX');
 assert.throws(()=>mergeCurrentFundamentals(null,null),{code:'NO_FUNDAMENTAL_DATA'});
});

test('KRX authenticates safely, checks exact symbol/date, caches full market and skips only empty market days',async()=>{
 let requests=0,delays=[];
 const provider=new KrxFundamentalProvider({key:'private-key',sleep:async ms=>delays.push(ms),fetcher:async(url,init)=>{
  requests++;assert.equal(init.headers.AUTH_KEY,'private-key');assert.ok(!url.includes('private-key'));
  const day=new URL(url).searchParams.get('basDd');
  return Response.json({OutBlock_1:day==='20261017'?[]:[{ISU_CD:'008420',BAS_DD:'20261016',LIST_SHRS:'20,503,505'}]});
 }});
 const row=await provider.currentFundamentals('008420','KOSPI','2026-10-17');assert.equal(row.listedShares,'20503505');assert.equal(row.sourceAsOf,'2026-10-16');assert.equal(requests,2);assert.equal(delays.length,1);
 await provider.currentFundamentals('008420','KOSPI','2026-10-17');assert.equal(requests,2);
 await assert.rejects(provider.currentFundamentals('000660','KOSPI','2026-10-17'),{code:'KRX_SYMBOL_NO_DATA_OR_DUPLICATE'});assert.equal(requests,2);
 assert.ok(!JSON.stringify(row).includes('private-key'));
});

test('KRX rejects mismatched dates and malformed shares rather than storing misleading fallback values',async()=>{
 for(const row of [{ISU_CD:'008420',BAS_DD:'20261015',LIST_SHRS:'200'},{ISU_CD:'008420',BAS_DD:'20261016',LIST_SHRS:'-1'}]){
  const provider=new KrxFundamentalProvider({key:'key',fetcher:async()=>Response.json({OutBlock_1:[row]})});
  await assert.rejects(provider.currentFundamentals('008420','KOSPI','2026-10-16'),{code:'KRX_INVALID_SHARE_COUNT_OR_DATE'});
 }
});

test('same-day shared row upgrades KRX to KIS, preserves useful missing-field fallback and never downgrades KIS',()=>{
 const observedDate=new Date('2026-10-17'),security={id:1n,symbol:'008420',isActive:true,collectionExcluded:false,excludedFeatures:[]},permissions={valuation:true,shares:true};
 const krx={listedShares:'2000',sourceAsOf:'2026-10-16',collectedAt:new Date('2026-10-17T01:00:00Z'),raw:{LIST_SHRS:'2000'}};
 const existing=supplementData(mergeCurrentFundamentals(null,krx),security,observedDate);
 const kis={per:'6.3',pbr:'0.22',eps:'323',bps:'9280',listedShares:null,foreignHoldingShares:'25',foreignExhaustionRate:'2.5',collectedAt:new Date('2026-10-17T02:00:00Z'),raw:{}};
 const first=mergeStoredSnapshot(existing,supplementData(mergeCurrentFundamentals(kis,null),security,observedDate),permissions);
 assert.equal(first.listedShares,'2000');assert.equal(first.per,'6.3');assert.equal(first.foreignHoldingRatio,null);assert.equal(first.raw.fieldSources.listedShares.source,'KRX');
 const second=mergeStoredSnapshot(first,supplementData(mergeCurrentFundamentals({...kis,listedShares:'1000'},null),security,observedDate),permissions);
 assert.equal(second.listedShares,'1000');assert.equal(second.source,'KIS_API');assert.equal(second.foreignHoldingRatio,'2.5');
 const downgrade=mergeStoredSnapshot(second,existing,permissions);assert.equal(downgrade.listedShares,'1000');assert.equal(downgrade.per,'6.3');assert.equal(downgrade.source,'KIS_API');
 const excluded=mergeStoredSnapshot(second,existing,{valuation:false,shares:true});assert.equal(excluded.per,null);assert.equal(excluded.foreignHoldingShares,null);assert.equal(excluded.foreignHoldingRatio,null);assert.equal(excluded.raw.fieldSources.per,undefined);
});
