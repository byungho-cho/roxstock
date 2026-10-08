import assert from 'node:assert/strict';
import test from 'node:test';
import { dartFailure, dartWindowOpen, retryDecision, publicHolidayDates } from './dart-policy.js';

test('general collection uses Seoul nights, all-day weekends and configured holidays', () => {
  assert.equal(dartWindowOpen(new Date('2026-10-06T01:00Z'),18,6),false);
  assert.equal(dartWindowOpen(new Date('2026-10-06T09:00Z'),18,6),true);
  assert.equal(dartWindowOpen(new Date('2026-10-05T20:59Z'),18,6),true);
  assert.equal(dartWindowOpen(new Date('2026-10-05T21:00Z'),18,6),false);
  assert.equal(dartWindowOpen(new Date('2026-10-10T01:00Z'),18,6),true);
  assert.equal(dartWindowOpen(new Date('2026-10-09T01:00Z'),18,6,['2026-10-09']),true);
  assert.equal(dartWindowOpen(new Date('2026-10-10T01:00Z'),18,6,[],false),false);
});

test('quota pauses without failing a task, transient errors back off and structural errors require review', () => {
  const now = new Date('2026-10-06T01:00Z');
  assert.deepEqual(retryDecision('020',1,now),{status:'PENDING',code:'020',nextAttemptAt:null,stop:true});
  assert.equal(retryDecision('HTTP_ERROR',1,now).nextAttemptAt?.getTime(),now.getTime()+900000);
  assert.equal(retryDecision('HTTP_ERROR',2,now).nextAttemptAt?.getTime(),now.getTime()+1800000);
  assert.equal(retryDecision('HTTP_ERROR',5,now).code,'REVIEW_REQUIRED');
  assert.equal(retryDecision('RECEIPT_MISMATCH',2,now).nextAttemptAt?.getTime(),now.getTime()+21600000);
  assert.equal(retryDecision('RECEIPT_MISMATCH',3,now).code,'REVIEW_REQUIRED');
  assert.equal(retryDecision('P2000',3,now).code,'REVIEW_REQUIRED');
});

test('task diagnostics preserve stage and database errors while redacting secrets', () => {
  const failure = dartFailure({code:'P2000',name:'PrismaError',message:'bad amount; api_key=secret123 https://dart.test?crtfc_key=secret123'},'SAVE','secret123');
  assert.equal(failure.code,'P2000');
  assert.match(failure.message,/SAVE: .*DB/);
  assert.equal(failure.message.includes('secret123'),false);
  assert.equal(failure.message.includes('https:'),false);
});

test('official holiday rows are cached and merged with explicitly configured dates', async () => {
  const priorKey = process.env.DATA_GO_KR_SERVICE_KEY;
  const priorDates = process.env.DART_PUBLIC_HOLIDAYS;
  process.env.DATA_GO_KR_SERVICE_KEY='fixture-key';
  process.env.DART_PUBLIC_HOLIDAYS='2026-10-09';
  let calls=0;
  const fetcher = (async () => { calls++; return new Response(JSON.stringify({response:{header:{resultCode:'00'},body:{items:{item:[{locdate:20261005,isHoliday:'Y'},{locdate:20261006,isHoliday:'N'}]}}}})); }) as typeof fetch;
  try {
    assert.deepEqual((await publicHolidayDates(new Date('2026-10-06T01:00Z'),fetcher)).sort(),['2026-10-05','2026-10-09']);
    await publicHolidayDates(new Date('2026-10-06T01:01Z'),fetcher);
    assert.equal(calls,1);
  } finally {
    if(priorKey===undefined) delete process.env.DATA_GO_KR_SERVICE_KEY; else process.env.DATA_GO_KR_SERVICE_KEY=priorKey;
    if(priorDates===undefined) delete process.env.DART_PUBLIC_HOLIDAYS; else process.env.DART_PUBLIC_HOLIDAYS=priorDates;
  }
});
