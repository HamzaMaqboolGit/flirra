import test from 'node:test';
import assert from 'node:assert/strict';
import { bothCallParticipantsConsented } from '../lib/call-consent';

test('a match only connects after both participants explicitly consent and remain present', () => {
  const accepted = new Date();
  assert.equal(bothCallParticipantsConsented([{consentedAt:accepted,leftAt:null},{consentedAt:null,leftAt:null}]), false);
  assert.equal(bothCallParticipantsConsented([{consentedAt:accepted,leftAt:null},{consentedAt:accepted,leftAt:null}]), true);
  assert.equal(bothCallParticipantsConsented([{consentedAt:accepted,leftAt:null},{consentedAt:accepted,leftAt:new Date()}]), false);
  assert.equal(bothCallParticipantsConsented([{consentedAt:accepted,leftAt:null}]), false);
});
