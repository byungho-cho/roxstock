import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stockFlows,marketFlows,numeric,dateKey} from './provider.mjs';
const fetchJson=body=>async()=>new Response(JSON.stringify(body),{status:200});
test('stock adapter keeps exact quantities, real zero and missing amounts without mixing NXT',async()=>{
 const rows=await stockFlows('0163Y0',fetchJson({isSuccess:true,result:{items:[{localTradedAt:'2026-10-16',krx:{closingPrice:'73,000',individualBuyVolume:'9007199254740993',individualSellVolume:'0',individualNetVolume:'9007199254740993',foreignBuyVolume:'0',foreignSellVolume:'0',foreignNetVolume:'0'},nxt:{individualNetVolume:'999',closingPrice:'999'}}]}}));
 assert.equal(rows.length,3);assert.equal(rows[0].buyQuantity,'9007199254740993');assert.equal(rows[1].netQuantity,'0');assert.equal(rows[2].netQuantity,null);assert.equal(rows[0].netAmount,null);assert.equal(rows[0].exchangeScope,'KRX');
 assert.equal(rows[0].raw.closingPrice,'73000');
});
test('market raw observations never masquerade as known money or scope',async()=>{
 const rows=await marketFlows('KOSPI',fetchJson({bizdate:'20261016',personalValue:'-1,183',foreignValue:'0',institutionalValue:'+760'}));
 assert.equal(rows[0].raw.reportedValue,'-1183');assert.equal(rows[1].raw.reportedValue,'0');assert.equal(rows[0].netAmount,null);assert.equal(rows[0].exchangeScope,'UNVERIFIED');
});
test('denied, malformed, unavailable and excluded targets are explicit failures',async()=>{
 await assert.rejects(stockFlows('005930',async()=>new Response('',{status:403})),{code:'PROVIDER_ACCESS_DENIED'});
 await assert.rejects(stockFlows('005930',fetchJson({isSuccess:false})),{code:'RESPONSE_SCHEMA'});
 await assert.rejects(stockFlows('Z99001',fetchJson({})),{code:'EXCLUDED_SYMBOL'});
 assert.equal(numeric(null),null);assert.equal(numeric('0'),'0');assert.throws(()=>numeric('123원'));
 assert.equal(dateKey('2026-10-16'),'2026-10-16');assert.throws(()=>dateKey('2026-02-30'));
});
