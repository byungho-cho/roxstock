import test from 'node:test';
import assert from 'node:assert/strict';
import {publicValueRows} from '../read-model/value-rows.js';
test('compact list retains display/tooltip data and leaves full snapshot evidence intact',()=>{
 const row={id:'1',codeRevision:0,valuation:{bps:'1'},symbol:'000001',name:'종목',w:'1.23456789',fairPrices:[{persistence:'0.8',price:'123'}],notices:['원천 미제공'],sourceReasons:{eps:'NOT_PROVIDED'},missingReasons:{eps:'NOT_PROVIDED'},metricBasis:{year:2025,label:'2025 결산',source:'OPEN_DART',division:'CFS',isEstimated:false,provenance:{raw:'x'.repeat(10000)}},shareBasis:{receiptNo:'receipt',stockKind:'보통주',periodEndDate:'2025-12-31'}};
 const source=[row] as any;
 const full=publicValueRows(source),compact=publicValueRows(source,true);
 const {provenance,...basis}=full[0]!.metricBasis as Record<string,unknown>;
 assert.deepEqual(compact[0],{...full[0],metricBasis:basis});assert.equal((compact[0]!.metricBasis as any).provenance,undefined);
 assert.equal(source[0].metricBasis.provenance.raw.length,10000);
 assert.ok(JSON.stringify(compact).length<JSON.stringify(full).length/10);
 console.log(JSON.stringify({kind:'synthetic-list-transport',fullBytes:Buffer.byteLength(JSON.stringify(full)),compactBytes:Buffer.byteLength(JSON.stringify(compact))}));
});
