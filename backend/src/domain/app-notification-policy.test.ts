import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyTargetIdentity,notificationDestination} from '../notifications/policy.js';
import {evaluateTargetLots} from './target-arrival.js';
test('daily event identity persists across reentry/restart and separates Korean date, owner, account, stock and condition',()=>{
 const t=new Date('2026-10-22T14:59:59Z'),c={days:7,rate:'5'};
 const id=dailyTargetIdentity(1n,2n,3n,c,t);assert.equal(id,dailyTargetIdentity(1n,2n,3n,c,new Date(+t-3600000)));
 for(const other of [dailyTargetIdentity(2n,2n,3n,c,t),dailyTargetIdentity(1n,4n,3n,c,t),dailyTargetIdentity(1n,2n,4n,c,t),dailyTargetIdentity(1n,2n,3n,{days:30,rate:'10'},t),dailyTargetIdentity(1n,2n,3n,c,new Date(+t+1000))])assert.notEqual(other,id);
 assert.match(id,/2026-10-22$/);
});
test('original target comparison supports separate 5/10 conditions without rounding or changing home representative',()=>{
 const now=new Date('2026-10-22T00:00:00Z'),lot={id:'1',securityId:'3',symbol:'005380',name:'현대차',boughtAt:new Date('2026-10-21T00:00:00Z'),quantity:'10',soldQuantities:[],unitPrice:'100',currentPrice:'110',priceUpdatedAt:now};
 const cs=[{days:7,rate:'5'},{days:30,rate:'10'}];assert.equal(evaluateTargetLots([lot],cs,now).data.length,1);
 assert.equal(cs.filter(c=>evaluateTargetLots([lot],[c],now).data.length).length,2);
 assert.equal(evaluateTargetLots([{...lot,currentPrice:'104.9999'}],[cs[0]!],now).data.length,0);
 assert.equal(evaluateTargetLots([{...lot,currentPrice:null}],[cs[0]!],now).unavailable.length,1);
});
test('notification navigation is allowlisted',()=>{assert.equal(notificationDestination('NEWS'),'/detail/stock-news');assert.equal(notificationDestination('TARGET'),'/');assert.equal(notificationDestination('https://evil.invalid'),null);});
