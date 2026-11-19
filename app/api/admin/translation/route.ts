import { z } from 'zod';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { readProviderSecret, saveProviderSettings } from '@/lib/stripe-secrets';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), enabled: z.boolean(), url: z.string().url().max(500), apiKey: z.string().max(500).optional() }),
  z.object({ action: z.literal('test'), url: z.string().url().max(500).optional(), apiKey: z.string().max(500).optional() }),
]);

export async function GET() {
  const { user, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'settings' });
  if (!user) return error;
  const row = await (await import('@/lib/db')).prisma.platformSetting.findUnique({ where: { key: 'translation.enabled' }, select: { value: true } });
  return ok({ enabled: row?.value === true, url: process.env.TRANSLATION_API_URL || 'https://api-free.deepl.com/v2/translate', apiKeyConfigured: Boolean(await readProviderSecret('translation.apiKey').catch(() => '') || process.env.TRANSLATION_API_KEY) });
}

export async function POST(request: Request) {
  const { user, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'settings' });
  if (!user) return error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Enter a valid DeepL URL and API key.');
  const data = parsed.data;
  const key = data.apiKey || await readProviderSecret('translation.apiKey').catch(() => '') || process.env.TRANSLATION_API_KEY?.trim();
  const url = data.action === 'test' ? data.url || process.env.TRANSLATION_API_URL?.trim() || 'https://api-free.deepl.com/v2/translate' : data.url;
  if (!key) return fail('Enter a DeepL API key before continuing.', 409);
  if (data.action === 'test') {
    const upstream = await fetch(url, { method: 'POST', headers: { Authorization: `DeepL-Auth-Key ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: ['Flirra connection test'], target_lang: 'EN' }), cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (upstream.status === 401 || upstream.status === 403) return fail('DeepL rejected this API key.', 422);
    if (upstream.status === 429 || upstream.status === 456) return fail(upstream.status === 456 ? 'DeepL usage quota has been exceeded.' : 'DeepL rate limit reached. Try again shortly.', 429);
    if (!upstream.ok) return fail('DeepL connection could not be verified.', 502);
    return ok({ connected: true });
  }
  if (data.enabled && !key) return fail('Add a DeepL API key before enabling translation.', 409);
  if (data.apiKey && (!process.env.STRIPE_SETTINGS_ENCRYPTION_KEY || process.env.STRIPE_SETTINGS_ENCRYPTION_KEY.length < 32)) return fail('Set STRIPE_SETTINGS_ENCRYPTION_KEY on the server before saving provider secrets.', 503);
  await saveProviderSettings({ provider: 'translation', action: 'TRANSLATION_SETTINGS_UPDATED', values: { 'translation.enabled': data.enabled, 'translation.url': data.url }, secrets: { 'translation.apiKey': data.apiKey } }, user.id);
  return ok({ saved: true, enabled: data.enabled });
}
