import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdminTableId } from '../lib/admin-table-ids';
import { stripeActivationError, type StripeCredentials } from '../lib/stripe-configuration';

test('admin table uses raw database IDs for React-normalized explicit row keys', () => {
  assert.equal(normalizeAdminTableId('.$user_123', 0), 'user_123');
  assert.equal(normalizeAdminTableId('.$pay_123', 9), 'pay_123');
});

test('admin table retains fallback keys when a row has no explicit key', () => {
  assert.equal(normalizeAdminTableId(null, 4), '4');
});

const testKeys: StripeCredentials = {
  secretKey: 'sk_test_valid',
  publishableKey: 'pk_test_valid',
  webhookSecret: 'whsec_valid',
  connectSecret: '',
};
const flags = { paymentsEnabled: true, connectEnabled: false, paymentsLiveAllowed: false, connectLiveAllowed: false };

test('Stripe checkout cannot be enabled until all server credentials are present', () => {
  assert.match(stripeActivationError({ ...flags, credentials: { ...testKeys, webhookSecret: '' } }) || '', /webhook signing secret/);
});

test('Stripe checkout rejects non-webhook secrets', () => {
  assert.match(stripeActivationError({ ...flags, credentials: { ...testKeys, webhookSecret: 'not-a-whsec-secret' } }) || '', /beginning with whsec_/);
});

test('Stripe checkout requires matching test/live publishable and secret key modes', () => {
  assert.match(stripeActivationError({ ...flags, credentials: { ...testKeys, publishableKey: 'pk_live_valid' } }) || '', /both use test mode or both use live mode/);
});

test('Stripe organization keys require an account context', () => {
  assert.match(stripeActivationError({ ...flags, credentials: { ...testKeys, secretKey: 'sk_org_live_example' } }) || '', /account ID/);
});

test('Stripe Connect organization keys require account context', () => {
  assert.match(stripeActivationError({ ...flags, connectEnabled: true, credentials: { ...testKeys, connectSecret: 'sk_org_live_example' } }) || '', /account ID/);
});

test('Stripe Connect keys cannot mix test and live modes', () => {
  assert.match(stripeActivationError({ ...flags, connectEnabled: true, credentials: { ...testKeys, connectSecret: 'sk_live_valid' } }) || '', /same test or live mode/);
});

test('Stripe Connect live activation reports deployment verification exactly', () => {
  const credentials = { ...testKeys, secretKey: 'sk_live_valid', publishableKey: 'pk_live_valid', connectSecret: 'sk_live_connect' };
  assert.equal(stripeActivationError({ ...flags, paymentsEnabled: false, connectEnabled: true, credentials }), 'Live Stripe Connect is blocked until deployment verification is complete (STRIPE_CONNECT_LIVE is not enabled).');
  assert.equal(stripeActivationError({ ...flags, paymentsEnabled: false, connectEnabled: true, connectLiveAllowed: true, credentials }), null);
});

test('live payments remain disabled until the deployment enables live mode', () => {
  assert.match(stripeActivationError({ ...flags, credentials: { ...testKeys, secretKey: 'sk_live_valid', publishableKey: 'pk_live_valid' } }) || '', /Live payments are blocked/);
  assert.equal(stripeActivationError({ ...flags, paymentsLiveAllowed: true, credentials: { ...testKeys, secretKey: 'sk_live_valid', publishableKey: 'pk_live_valid' } }), null);
});


test('organization keys work for Checkout and Connect with a selected account', () => {
  const credentials = { ...testKeys, secretKey: 'sk_org_example', accountId: 'acct_example' };
  assert.equal(stripeActivationError({ ...flags, credentials, connectEnabled: true }), null);
  assert.match(stripeActivationError({ ...flags, credentials: { ...credentials, accountId: 'org_wrong' } }) || '', /account ID/);
  assert.match(stripeActivationError({ ...flags, credentials: { ...credentials, publishableKey: 'pk_live_example' } }) || '', /Live payments/);
});
