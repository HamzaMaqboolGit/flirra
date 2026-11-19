export type StripeCredentials = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  connectSecret: string;
  accountId?: string;
};

export function isStripeSecret(key: string) {
  return /^sk_(?:(?:test|live)_[A-Za-z0-9]+|org_[A-Za-z0-9_]+)$/.test(key);
}

/** A Stripe organization (`org_`) is not an API request context. */
export function stripeAccountIdError(accountId?: string) {
  const value = accountId?.trim() || '';
  if (!value || /^acct_[A-Za-z0-9]+$/.test(value)) return null;
  if (value.startsWith('org_')) return 'Use the platform Stripe account ID beginning acct_. An org_ ID identifies your organization, not the account context.';
  return 'Enter a Stripe account ID beginning acct_, or leave this field empty for an account-level key.';
}

export function stripeKeyMode(key: string, publishableKey: string) {
  if (key.startsWith('sk_org_')) return publishableKey.startsWith('pk_test_') ? 'test' : 'live';
  return key.startsWith('sk_test_') ? 'test' : 'live';
}

export function stripeContextError(key: string, accountId?: string) {
  if (key.startsWith('sk_org_')) {
    const value = accountId?.trim() || '';
    if (!value) return 'Enter the platform Stripe account ID (acct_…) that this organization key should use.';
    return stripeAccountIdError(value);
  }
  return null;
}

export function stripeActivationError(input: {
  credentials: StripeCredentials;
  paymentsEnabled: boolean;
  connectEnabled: boolean;
  paymentsLiveAllowed: boolean;
  connectLiveAllowed: boolean;
}): string | null {
  const { credentials: keys } = input;
  if (input.paymentsEnabled) {
    if (!keys.secretKey || !keys.publishableKey || !keys.webhookSecret) return 'Add a Stripe secret key, publishable key, and webhook signing secret before enabling coin checkout.';
    if (!keys.webhookSecret.startsWith('whsec_')) return 'Use a valid Stripe webhook signing secret beginning with whsec_ before enabling coin checkout.';
    if (!isStripeSecret(keys.secretKey) || !/^pk_(test|live)_[A-Za-z0-9]+$/.test(keys.publishableKey)) return 'Use valid Stripe secret and account publishable keys.';
    const contextError = stripeContextError(keys.secretKey, keys.accountId);
    if (contextError) return contextError;
    const mode = stripeKeyMode(keys.secretKey, keys.publishableKey);
    if (mode !== (keys.publishableKey.startsWith('pk_live_') ? 'live' : 'test')) return 'The Stripe secret and publishable keys must both use test mode or both use live mode.';
    if (mode === 'live' && !input.paymentsLiveAllowed) return 'Live payments are blocked. Verify deployment settings before enabling them.';
  }
  if (input.connectEnabled) {
    const key = keys.connectSecret || keys.secretKey;
    if (!isStripeSecret(key)) return 'Use a valid Stripe secret key before enabling Stripe Connect.';
    const contextError = stripeContextError(key, keys.accountId);
    if (contextError) return contextError;
    if (key.startsWith('sk_org_') && !/^pk_(test|live)_/.test(keys.publishableKey)) return 'Add the account publishable key to identify the organization key mode.';
    const mode = stripeKeyMode(key, keys.publishableKey);
    if (keys.secretKey && mode !== stripeKeyMode(keys.secretKey, keys.publishableKey)) return 'The Stripe Connect secret key must use the same test or live mode as the main secret key.';
    if (mode === 'live' && !input.connectLiveAllowed) return 'Live Stripe Connect is blocked until deployment verification is complete (STRIPE_CONNECT_LIVE is not enabled).';
  }
  return null;
}
