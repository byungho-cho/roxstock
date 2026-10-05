import assert from 'node:assert/strict';
import test from 'node:test';

import { isAccountDataResetEnabled, normalizeAccountNumber } from './accounts.js';

test('account number normalization removes whitespace and hyphens', () => {
  assert.equal(normalizeAccountNumber(' 1234-56 7890\t'), '1234567890');
  assert.equal(normalizeAccountNumber(' - \t'), null);
  assert.equal(normalizeAccountNumber(null), null);
});

test('account data reset is opt-in only', () => {
  assert.equal(isAccountDataResetEnabled('true'), true);
  assert.equal(isAccountDataResetEnabled('TRUE'), false);
  assert.equal(isAccountDataResetEnabled('false'), false);
  assert.equal(isAccountDataResetEnabled(undefined), false);
});
