import Stripe from 'stripe';
import { readStripeCredentials, readStripeFlags } from './stripe-secrets';
import { stripeActivationError, stripeContextError } from './stripe-configuration';

export function createStripeClient(key: string, accountId?: string) {
  const error = stripeContextError(key, accountId);
  if (error) throw new Error(error);
  // stripe-node supplies Stripe-Version. Organization keys also require account context.
  return new Stripe(key, { ...(key.startsWith('sk_org_') ? { stripeContext: accountId } : {}), timeout: 10000 });
}

export async function paymentsConfig() {
  try {
    const [credentials, flags] = await Promise.all([readStripeCredentials(), readStripeFlags()]);
    if (!flags.paymentsEnabled) return { ok: false as const, reason: 'Stripe checkout is disabled.' };
    const reason = stripeActivationError({ credentials, paymentsEnabled: true, connectEnabled: false,
      paymentsLiveAllowed: process.env.PAYMENTS_LIVE === 'true' || flags.liveApproved, connectLiveAllowed: false });
    if (reason) return { ok: false as const, reason };
    return { ok: true as const, key: credentials.secretKey, webhookSecret: credentials.webhookSecret, accountId: credentials.accountId };
  } catch {
    return { ok: false as const, reason: 'Stripe credentials are unavailable. Verify STRIPE_SETTINGS_ENCRYPTION_KEY on the server.' };
  }
}

/** Webhook verification must remain available even when the checkout toggle is off.
 * Providers can deliver a completed event after an admin toggle or deployment
 * restart; gating signature verification on the UI activation flag strands paid
 * purchases in PENDING forever.
 */
export async function stripeWebhookConfig() {
  try {
    const credentials = await readStripeCredentials();
    if (!credentials.secretKey || !credentials.webhookSecret) {
      return { ok: false as const, reason: 'Stripe webhook credentials are unavailable.' };
    }
    return { ok: true as const, key: credentials.secretKey, webhookSecret: credentials.webhookSecret, accountId: credentials.accountId };
  } catch {
    return { ok: false as const, reason: 'Stripe webhook credentials are unavailable.' };
  }
}

export async function getStripe() {
  const config = await paymentsConfig();
  if (!config.ok) throw new Error(config.reason);
  return createStripeClient(config.key, config.accountId);
}

export async function getStripeConnect() {
  const [credentials, flags] = await Promise.all([readStripeCredentials(), readStripeFlags()]);
  if (!flags.connectEnabled) throw new Error('Stripe Connect is disabled.');
  const reason = stripeActivationError({ credentials, paymentsEnabled: false, connectEnabled: true,
    paymentsLiveAllowed: false, connectLiveAllowed: process.env.STRIPE_CONNECT_LIVE === 'true' || flags.liveApproved });
  if (reason) throw new Error(reason);
  return createStripeClient(credentials.connectSecret || credentials.secretKey, credentials.accountId);
}

export async function connectedAccountOptions(accountId: string) {
  if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) throw new Error('Invalid connected account.');
  const credentials = await readStripeCredentials();
  const key = credentials.connectSecret || credentials.secretKey;
  return key.startsWith('sk_org_')
    ? { stripeContext: `${credentials.accountId}/${accountId}` }
    : { stripeAccount: accountId };
}

export async function identityEnabled() {
  return process.env.STRIPE_IDENTITY_ENABLED === 'true' && (await paymentsConfig()).ok;
}

export async function connectEnabled() {
  try { await getStripeConnect(); return true; } catch { return false; }
}
