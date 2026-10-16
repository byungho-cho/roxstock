import {test} from 'node:test';
import assert from 'node:assert/strict';
import {investorMonitorCounts} from './investor-monitor.js';
test('investor monitoring separates raw, validated quantity, pending and failed targets without inventing successes',()=>{
 const group=(status:string,message:string|null,n:number)=>({status,message,_count:{_all:n}});
 const counts=investorMonitorCounts([group('STALE','RAW_OBSERVATION_ONLY: 시장 단위 검증 대기',2),group('STALE','PARTIAL_FIELDS: KRX 수량 저장',3),group('SKIPPED','NO_CURRENT_DATA: 미제공',4),group('FAILED','NET_VALUE_MISMATCH',1),group('STALE','UNKNOWN',5),group('FAILED','RAW_OBSERVATION_ONLY: not stored',1)]);
 assert.deepEqual(counts,{rawOnly:2,quantityStored:3,waiting:4,failed:2,other:5});assert.equal(Object.values(counts).reduce((a,b)=>a+b),16);
 assert.deepEqual(investorMonitorCounts([]),{rawOnly:0,quantityStored:0,waiting:0,failed:0,other:0});
});
