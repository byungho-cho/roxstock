import assert from 'node:assert/strict';
import test from 'node:test';
import { collectorLog } from './logger.js';
test('collector logs redact nested credentials while retaining counters and bigint IDs', () => {
  const original = console.log; let output = '';
  console.log = (text: string) => { output = text; };
  try { collectorLog('info', 'configuration', { config: { realtimeInternalToken: 'private-token', DART_API_KEY: 'private-key', nested: { password: 'private-password' }, interval: 60 }, runId: 1n }); }
  finally { console.log = original; }
  assert.equal(output.includes('private-'), false);
  const data = JSON.parse(output); assert.equal(data.config.realtimeInternalToken, '[redacted]'); assert.equal(data.config.nested.password, '[redacted]'); assert.equal(data.config.interval, 60); assert.equal(data.runId, '1');
});
