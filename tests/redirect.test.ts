import test from 'node:test';
import assert from 'node:assert/strict';
import { postAuthDestination, safeInternalPath } from '../lib/redirect';

test('return paths preserve local matching destinations', () => {
  assert.equal(safeInternalPath('/dashboard?country=Spain&gender=FEMALE&start=1'), '/dashboard?country=Spain&gender=FEMALE&start=1');
});

test('return paths reject external and protocol-relative destinations', () => {
  assert.equal(safeInternalPath('https://example.com'), '/dashboard');
  assert.equal(safeInternalPath('//example.com/path'), '/dashboard');
  assert.equal(safeInternalPath('/\\example.com'), '/dashboard');
});

test('post-auth routing defaults to Random Call and honors only explicit Discover intent', () => {
  assert.equal(postAuthDestination(undefined), '/dashboard');
  assert.equal(postAuthDestination('dashboard'), '/dashboard');
  assert.equal(postAuthDestination('/messages'), '/dashboard');
  assert.equal(postAuthDestination('discover'), '/discover');
  assert.equal(postAuthDestination('/discover'), '/discover');
});
