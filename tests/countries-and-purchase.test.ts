import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRY_CODES, countryAliases, countryCode, countryName, isCountry } from '../lib/countries';
import { parsePurchaseIntent, PURCHASE_INTENT_TTL_MS } from '../lib/purchase-intent';

test('central country dataset contains 249 unique ISO alpha-2 codes', () => {
  assert.equal(COUNTRY_CODES.length, 249);
  assert.equal(new Set(COUNTRY_CODES).size, 249);
  assert.ok(COUNTRY_CODES.every(code => /^[A-Z]{2}$/.test(code)));
});

test('country selection accepts codes and saved display names while producing aliases', () => {
  assert.equal(countryCode('US'), 'US');
  assert.equal(countryCode('United States'), 'US');
  assert.equal(isCountry('PK'), true);
  assert.equal(countryName('GB'), 'United Kingdom');
  assert.ok(countryAliases('United States').includes('US'));
  assert.ok(countryAliases('US').includes('United States'));
});

test('purchase intent is valid only within its lifetime and with a package id', () => {
  const now = 1_800_000_000_000;
  assert.deepEqual(parsePurchaseIntent({ packageId: 'pkg_1', createdAt: now }, now), { packageId: 'pkg_1', createdAt: now });
  assert.equal(parsePurchaseIntent({ packageId: 'pkg_1', createdAt: now - PURCHASE_INTENT_TTL_MS - 1 }, now), null);
  assert.equal(parsePurchaseIntent({ packageId: '../wallet', createdAt: now }, now), null);
  assert.equal(parsePurchaseIntent({ packageId: 'pkg_1', createdAt: now + 1 }, now), null);
});

test('public and wallet package ordering excludes paused items and shares stable order', async () => {
  const { orderCoinPackages } = await import('../lib/coin-packages');
  const packages = [
    { id: 'fifth', sortOrder: 4, createdAt: '2026-01-05', active: true },
    { id: 'second', sortOrder: 1, createdAt: '2026-01-02', active: true },
    { id: 'paused', sortOrder: 0, createdAt: '2026-01-01', active: false },
    { id: 'first', sortOrder: 0, createdAt: '2026-01-01', active: true },
  ];
  assert.deepEqual(orderCoinPackages(packages, true).map(item => item.id), ['first', 'second', 'fifth']);
  assert.deepEqual(orderCoinPackages(packages).map(item => item.id), ['paused', 'first', 'second', 'fifth']);
});
