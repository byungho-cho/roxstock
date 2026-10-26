import test from 'node:test';
import assert from 'node:assert/strict';
import {groupedComposition,compositionAmount} from './assetComposition';
test('purchase weights and grouped Other cost remain independent of valuation',()=>{
 const items=groupedComposition(Array.from({length:9},(_,i)=>({id:String(i),name:String(i),percent:9-i,purchasePercent:10,purchaseAmount:20000})));
 assert.equal(items.at(-1)!.purchaseAmount,40000);
 assert.equal(items.at(-1)!.purchasePercent,20);
});
for(const n of [0,1,5,6,7,8,20])test(`composition ${n}: shared ordered set, conserved sum, eighth palette and final Other`,()=>{
 const rows=Array.from({length:n},(_,i)=>({id:String(i),name:'종목'+i,percent:n-i})).reverse(),items=groupedComposition(rows);
 assert.equal(items.length,Math.min(n,n>7?8:7));assert.equal(items.some(i=>i.id==='other'),n>7);
 assert.equal(items.reduce((s,r)=>s+r.percent,0),rows.reduce((s,r)=>s+r.percent,0));
 assert.equal(new Set(items.map(i=>i.color)).size,items.length);
 if(n>7){assert.equal(items.at(-1)!.id,'other');assert.equal(items.at(-1)!.percent,(n-7)*(n-6)/2);}
 assert.deepEqual(items.filter(i=>i.id!=='other').map(i=>i.id),Array.from({length:Math.min(7,n)},(_,i)=>String(i)));
});

test('zero valuation holding retains its real name; missing names never create Other',()=>{const items=groupedComposition([{id:'1',name:'종목명 미확인 (1)',percent:100},{id:'2',name:'영 평가 종목',percent:0}]);assert.equal(items.length,2);assert.ok(items.every(i=>i.id!=='other'));assert.equal(items[1]!.percent,0);});

test('amount display never changes values and Other aggregates underlying amounts',()=>{
 for(const [n,expected] of [[23070000,'2,307만원'],[1,'1만원 미만'],[9999,'1만원 미만'],[10000,'1만원'],[15000,'2만원'],[0,'0만원']] as const)assert.equal(compositionAmount(n),expected);
 const rows=Array.from({length:10},(_,i)=>({id:String(i),name:String(i),percent:10-i,amount:(10-i)*10000}));
 const copy=structuredClone(rows),items=groupedComposition(rows);assert.equal(items.at(-1)!.amount,60000);assert.deepEqual(rows,copy);
});
