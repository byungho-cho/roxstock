import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMonitorStatuses} from './monitorStatusSummary.js';
test('every feature belongs to exactly one summary category; partial and delayed are warnings',()=>{
  const statuses=['OK','SUCCESS','FAILED','PARTIAL','DELAYED','WAITING','RUNNING'];
  assert.deepEqual(summarizeMonitorStatuses(statuses.map(status=>({status}))),{completed:2,failed:1,warning:2,waiting:1,running:1});
});
test('missing settings require attention, while expected absence and waiting remain distinct',()=>{
  assert.deepEqual(summarizeMonitorStatuses(['NOT_CONFIGURED','NOT_IMPLEMENTED','UNKNOWN','NO_DATA','NO_FILING','NOT_APPLICABLE','SKIPPED'].map(status=>({status}))),{completed:3,failed:0,warning:3,waiting:1,running:0});
});
