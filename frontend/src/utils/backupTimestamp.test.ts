import test from 'node:test';
import assert from 'node:assert/strict';
import { backupTimestamp } from './backupTimestamp';
test('backup dates use Korean year/month/day and 24-hour local clock at date boundaries', () => { assert.equal(backupTimestamp('2026-12-25T01:20:00Z'), '26/12/25 10:20'); assert.equal(backupTimestamp('2026-12-24T15:00:00Z'), '26/12/25 00:00'); assert.equal(backupTimestamp('2026-12-31T15:05:00Z'), '27/01/01 00:05'); });
