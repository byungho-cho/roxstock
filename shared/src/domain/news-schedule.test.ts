import test from 'node:test';
import assert from 'node:assert/strict';
import {nextNewsAt,regularSlot,scheduleAnchor,validateNewsSchedule,newsWindow} from '../news/schedule.js';
const anchor=new Date('2026-10-20T06:00:00+09:00');
for(const hours of [1,3,5,24])test(`${hours}h continuous persisted schedule across midnight/month/year; late ticks coalesce`,()=>{
 const c={intervalHours:hours,startTime:'06:00',anchorAt:anchor,revision:1};
 for(const at of ['2026-10-20T05:59:59+09:00','2026-10-20T06:00:00+09:00','2026-10-21T00:01:00+09:00','2026-11-01T00:00:00+09:00','2027-01-01T00:01:00+09:00']){
  const now=new Date(at),slot=regularSlot(c,now),next=nextNewsAt(c,now);
  assert.ok(slot<=now);assert.ok(next>now);assert.equal(Math.abs((slot.getTime()-anchor.getTime())%(hours*3600000)),0);if(now>=anchor)assert.equal(next.getTime()-slot.getTime(),hours*3600000);else assert.equal(next.toISOString(),anchor.toISOString());
  assert.equal(nextNewsAt({...c,anchorAt:new Date(c.anchorAt)},now).toISOString(),next.toISOString());
 }
});
test('five-hour cycle never restarts at midnight; 24h is daily at the selected minute',()=>{
 const c={intervalHours:5,startTime:'06:00',anchorAt:anchor,revision:1};
 assert.equal(nextNewsAt(c,new Date('2026-10-20T23:59:00+09:00')).toISOString(),new Date('2026-10-21T02:00:00+09:00').toISOString());
 assert.equal(nextNewsAt({...c,intervalHours:24},new Date('2026-10-21T06:00:00+09:00')).toISOString(),new Date('2026-10-22T06:00:00+09:00').toISOString());
 assert.equal(scheduleAnchor(new Date('2026-12-31T23:30:00Z'),'04:07').toISOString(),new Date('2027-01-01T04:07:00+09:00').toISOString());
});
test('server rejects fractional/out-of-range periods and invalid clock; overlap never precedes initial deployment',()=>{
 for(const intervalHours of [0,25,1.5,'3',null])assert.throws(()=>validateNewsSchedule({intervalHours,startTime:'06:00'}));
 for(const startTime of ['6:00','24:00','06:60',' 06:00','',null])assert.throws(()=>validateNewsSchedule({intervalHours:3,startTime}));
 assert.deepEqual(validateNewsSchedule({intervalHours:3,startTime:'06:01'}),{intervalHours:3,startTime:'06:01'});
 assert.equal(newsWindow('2026-10-19',new Date('2026-10-20T00:00:00+09:00'),new Date()).toISOString(),new Date('2026-10-19T00:00:00+09:00').toISOString());
});

test('a future start time is the first anchor; never runs a negative-index cycle before it',()=>{const c={intervalHours:5,startTime:'18:00',anchorAt:new Date('2026-10-20T18:00:00+09:00'),revision:2};assert.equal(nextNewsAt(c,new Date('2026-10-20T10:00:00+09:00')).toISOString(),c.anchorAt.toISOString());});
