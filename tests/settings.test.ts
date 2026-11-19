import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeSettings } from '../lib/settings';

test('unconfigured numeric platform settings stay null instead of receiving seeded defaults', () => {
  const settings = shapeSettings([]);
  assert.equal(settings.coinsPerMinute, null);
  assert.equal(settings.womanShareBps, null);
  assert.equal(settings.creditValueCents, null);
  assert.equal(settings.minWithdrawalCredits, null);
  assert.equal(settings.guestWelcomeCoins, null);
  assert.equal(settings.maxPromoCoins, null);
  assert.equal(settings.dailyRewardsEnabled, false);
});

test('manually saved numeric settings, including intentional zero, are preserved', () => {
  const settings = shapeSettings([
    { key: 'coinsPerMinute', value: 9 },
    { key: 'womanShareBps', value: 0 },
    { key: 'creditValueCents', value: 3 },
  ]);
  assert.equal(settings.coinsPerMinute, 9);
  assert.equal(settings.womanShareBps, 0);
  assert.equal(settings.creditValueCents, 3);
});
