import test from 'node:test';
import assert from 'node:assert/strict';
import {groupedComposition} from './assetComposition';
for(const n of [0,1,5,6,7,8,20])test(`composition ${n}: shared ordered set, conserved sum, eighth palette and final Other`,()=>{
 const rows=Array.from({length:n},(_,i)=>({id:String(i),name:'종목'+i,percent:n-i})).reverse(),items=groupedComposition(rows);
 assert.equal(items.length,Math.min(n,n>7?8:7));assert.equal(items.some(i=>i.id==='other'),n>7);
 assert.equal(items.reduce((s,r)=>s+r.percent,0),rows.reduce((s,r)=>s+r.percent,0));
 assert.equal(new Set(items.map(i=>i.color)).size,items.length);
 if(n>7){assert.equal(items.at(-1)!.id,'other');assert.equal(items.at(-1)!.percent,(n-7)*(n-6)/2);}
 assert.deepEqual(items.filter(i=>i.id!=='other').map(i=>i.id),Array.from({length:Math.min(7,n)},(_,i)=>String(i)));
});
