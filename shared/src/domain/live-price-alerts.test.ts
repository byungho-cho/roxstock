import test from 'node:test';
import assert from 'node:assert/strict';
import {priceAmount,pauseEnd,freshAlertTrade,matchesPrice} from './live-price-alerts.js';
import type {LiveQuote} from './live-quotes.js';
test('positive integer KRW amounts only; comparison boundaries inclusive',()=>{
 for(const amount of ['1','222750','999999999999'])assert.equal(priceAmount(amount),Number(amount));
 for(const value of ['','0','-1','1.5','NaN','1e3','1,000','100원','1000000000000',null,1])assert.throws(()=>priceAmount(value));
 assert.ok(matchesPrice(19000,19000,'BELOW'));assert.ok(matchesPrice(19000,19000,'ABOVE'));
 assert.equal(matchesPrice(19001,19000,'BELOW'),false);assert.equal(matchesPrice(18999,19000,'ABOVE'),false);
});
test('per-condition pause durations and Korean midnight across month/year boundaries',()=>{
 for(const start of ['2026-11-01T05:00:00Z','2026-12-31T14:59:59Z']){
  const now=new Date(start);for(const [key,minutes]of [['30m',30],['1h',60],['2h',120],['3h',180]] as const)assert.equal(+pauseEnd(key,now)-+now,minutes*60000);
 }
 assert.equal(pauseEnd('day',new Date('2026-12-31T14:59:59Z')).toISOString(),'2026-12-31T15:00:00.000Z');
 assert.equal(pauseEnd('day',new Date('2026-12-31T15:00:00Z')).toISOString(),'2027-01-01T15:00:00.000Z');
 for(const invalid of ['10m','24h','',null])assert.throws(()=>pauseEnd(invalid));
});
test('cache, delayed, halted and pre-activation quotes never trigger; market snapshot not re-evaluated',()=>{
 const now=new Date('2026-11-02T00:10:10Z'),fence=new Date(+now-2000);
 const q:LiveQuote={symbol:'005930',market:'TOTAL',price:19000,change:-100,rate:-0.5,observedAt:new Date(+now-500).toISOString(),receivedAt:+now,source:'KIS'};
 assert.ok(freshAlertTrade(q,fence,now));
 for(const patch of [{source:'CACHE' as const},{halted:true},{receivedAt:+fence},{observedAt:fence.toISOString()},{observedAt:new Date(+now-4000).toISOString()},{receivedAt:+now-4000},{price:0},{price:NaN},{rate:NaN},{observedAt:new Date(+now+5000).toISOString()}])assert.equal(freshAlertTrade({...q,...patch},fence,now),false);
});
