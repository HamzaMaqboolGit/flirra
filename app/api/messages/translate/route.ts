import { z } from 'zod';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { rateLimit } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { readProviderSecret } from '@/lib/stripe-secrets';

const schema = z.object({ text: z.string().trim().min(1).max(5000), target: z.enum(['BG','CS','DA','DE','EL','EN','ES','ET','FI','FR','HU','ID','IT','JA','KO','LT','LV','NB','NL','PL','PT','RO','RU','SK','SL','SV','TR','UK','ZH']) });

export async function POST(request: Request) {
  const { user, error } = await guard(['MALE', 'FEMALE']);
  if (!user) return error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Choose a supported language and enter a message to translate.');
  try { if (!await rateLimit(`message-translate:${user.id}`, 30, 60)) return fail('Translation rate limit reached. Try again in a minute.', 429); } catch { return fail('Translation is temporarily unavailable.', 503); }
  const row = await prisma.platformSetting.findUnique({ where: { key: 'translation.enabled' }, select: { value: true } });
  if (row?.value !== true) return fail('Translation is disabled by the administrator.', 503);
  const key = await readProviderSecret('translation.apiKey').catch(() => '') || process.env.TRANSLATION_API_KEY?.trim();
  const url = (await prisma.platformSetting.findUnique({ where: { key: 'translation.url' }, select: { value: true } }))?.value;
  const endpoint = typeof url === 'string' && url ? url : process.env.TRANSLATION_API_URL?.trim() || 'https://api-free.deepl.com/v2/translate';
  if (!key) return fail('Translation is not configured yet.', 503);
  try {
    const upstream = await fetch(endpoint, { method: 'POST', headers: { Authorization: `DeepL-Auth-Key ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: [parsed.data.text], target_lang: parsed.data.target }), cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (upstream.status === 429 || upstream.status === 456) return fail(upstream.status === 456 ? 'DeepL usage quota has been exceeded.' : 'DeepL rate limit reached. Try again shortly.', 429);
    if (upstream.status === 401 || upstream.status === 403) return fail('The translation provider rejected its server configuration.', 503);
    const body = await upstream.json().catch(() => null) as { translations?: Array<{ text?: unknown }> } | null;
    const translation = body?.translations?.[0]?.text;
    if (!upstream.ok || typeof translation !== 'string') return fail('This message could not be translated.', 502);
    return ok({ translation });
  } catch { return fail('Translation is temporarily unavailable.', 502); }
}
