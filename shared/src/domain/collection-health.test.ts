import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyScheduleHealth,priceRunResult,skipKind} from './collection-health.js';
const at=(s:string)=>new Date(s+'+09:00');
test('yesterday completed daily slot remains healthy across midnight until next due grace',()=>{
  const run={startedAt:at('2026-10-12T23:00:09'),status:'SUCCESS'};
  for(const now of ['2026-10-13T00:00:00','2026-10-13T06:00:00','2026-10-13T22:59:59']) assert.equal(dailyScheduleHealth(at(now),[23],run,10,10).status,'WAITING');
  assert.equal(dailyScheduleHealth(at('2026-10-13T23:10:00'),[23],run,10,10).status,'WAITING');
  assert.equal(dailyScheduleHealth(at('2026-10-13T23:10:01'),[23],run,10,10).reason,'예정 회차 시작 누락');
  assert.equal(run.status,'SUCCESS');
});
test('multiple configured slots and long-running boundary are independent of result',()=>{
  const run={startedAt:at('2026-10-13T06:00:00'),status:'RUNNING'};
  assert.equal(dailyScheduleHealth(at('2026-10-13T06:30:00'),[6,23],run,10,30).status,'RUNNING');
  assert.equal(dailyScheduleHealth(at('2026-10-13T06:30:01'),[6,23],run,10,30).reason,'실행 제한 시간 초과');
});
test('only proven exclusions count as normal; empty, unknown, lock, stale, inactive are not success',()=>{
  assert.equal(skipKind('사용자 설정: 해당 기능 수집에서 제외'),'EXCLUDED');
  assert.equal(skipKind('Z99 코드: 수집 제외'),'EXCLUDED');
  assert.equal(skipKind('빈 계좌 수집 제외: 예수금과 매수 내역이 없어 스냅샷을 생성하지 않습니다.'),'EXCLUDED');
  assert.equal(skipKind('another execution holds the collector lock'),'LOCK_CONFLICT');
  assert.equal(skipKind(null),'UNKNOWN');
  assert.equal(priceRunResult({success:2,failed:0,stale:0,skipped:1},1),'SUCCESS');
  assert.equal(priceRunResult({success:0,failed:0,stale:0,skipped:1},1),'SUCCESS');
  assert.equal(priceRunResult({success:2,failed:0,stale:0,skipped:1},0),'PARTIAL');
  assert.equal(priceRunResult({success:0,failed:0,stale:0,skipped:1},0),'SKIPPED');
  assert.equal(priceRunResult({success:0,failed:0,stale:0,skipped:0},0),'SKIPPED');
  assert.equal(priceRunResult({success:0,failed:1,stale:0,skipped:0},0),'FAILED');
});
