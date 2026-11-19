import { readProviderSecret, readProviderFlags } from './stripe-secrets';

export type PayPalConfig = { enabled: boolean; environment: 'sandbox'|'live'; clientId: string; clientSecret: string; webhookId: string };
export async function paypalConfig(): Promise<PayPalConfig> {
  const [flags, clientSecret, webhookId] = await Promise.all([
    readProviderFlags('paypal'), readProviderSecret('paypal.clientSecret'), readProviderSecret('paypal.webhookId'),
  ]);
  return { enabled: flags['paypal.enabled'] === true, environment: flags['paypal.environment'] === 'live' ? 'live' : 'sandbox', clientId: typeof flags['paypal.clientId'] === 'string' ? flags['paypal.clientId'] : '', clientSecret, webhookId };
}
export function paypalBase(environment: PayPalConfig['environment']) { return environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; }
export async function paypalAccessToken(config: PayPalConfig) {
  if (!config.clientId || !config.clientSecret) throw new Error('PayPal Client ID and Client Secret are required.');
  const response = await fetch(`${paypalBase(config.environment)}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(response.status === 401 ? 'PayPal rejected these credentials.' : 'PayPal connection could not be verified.');
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error('PayPal did not return an access token.');
  return body.access_token;
}
