import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiJson } from '../lib/client-api';

test('API reader turns an empty server error into a readable message', async () => {
  const result = await readApiJson(new Response(null, { status: 503 }), 'Request failed');
  assert.equal(result.error, 'Request failed (HTTP 503)');
});

test('API reader returns valid JSON response objects', async () => {
  const result = await readApiJson(Response.json({ ok: true, role: 'MALE' }), 'Request failed');
  assert.deepEqual(result, { ok: true, role: 'MALE' });
});
