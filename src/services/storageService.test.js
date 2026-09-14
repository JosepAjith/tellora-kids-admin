import test from 'node:test';
import assert from 'node:assert/strict';
import { extractWorkerErrorMessage } from './workerErrors.js';

test('extractWorkerErrorMessage reads nested worker error messages', () => {
  assert.equal(
    extractWorkerErrorMessage({ error: { code: 'FORBIDDEN', message: 'Administrator access is required.' } }, 'fallback'),
    'Administrator access is required.'
  );
});

test('extractWorkerErrorMessage falls back when worker payload has no message', () => {
  assert.equal(
    extractWorkerErrorMessage({ error: { code: 'FORBIDDEN' } }, 'fallback'),
    'fallback'
  );
});
