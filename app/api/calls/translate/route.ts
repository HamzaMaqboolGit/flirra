import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { rateLimit } from '@/lib/redis';

const schema = z.object({ callId: z.string().min(1), text: z.string().trim().min(1).max(500), target: z.enum(['en','es','fr','de','it','pt','ar','ur','hi','ko','ja','zh']) });

export async function POST(request: Request) {
  const { user, error } = await guard(['MALE','FEMALE']);
  if (!user) return error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Choose a supported language and enter a message to translate.');
  let allowed = false;
  try { allowed = await rateLimit(`call-translate:${user.id}`, 30, 60); }
  catch (cause) { console.error('[call-translate:rate-limit]',cause); return fail('Translation is temporarily unavailable.',503); }
  if (!allowed) return fail('Translation is temporarily unavailable. Try again in a minute.',429);
  const call = await prisma.videoCall.findFirst({
    where: { id: parsed.data.callId, status: 'ACTIVE', OR: [{ callerId:user.id },{ recipientId:user.id }], participants: { some: { userId:user.id, consentedAt:{not:null}, leftAt:null } }, AND: [{ participants: { some: { userId:{not:user.id}, consentedAt:{not:null}, leftAt:null } } }] },
    select: { id:true },
  });
  if (!call) return fail('Translation is available only during a consented call.',403);
  const endpoint = process.env.TRANSLATION_API_URL?.trim();
  const key = process.env.TRANSLATION_API_KEY?.trim();
  if (!endpoint) return fail('Translation is not configured yet.',503);
  try {
    const upstream = await fetch(endpoint, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ q:parsed.data.text, source:'auto', target:parsed.data.target, format:'text', ...(key?{api_key:key}:{}) }), signal:AbortSignal.timeout(8000), cache:'no-store' });
    const data = await upstream.json().catch(()=>null) as { translatedText?:unknown } | null;
    if (!upstream.ok || typeof data?.translatedText !== 'string' || data.translatedText.length > 2000) return fail('This message could not be translated. Try the original text.',502);
    return ok({ translation:data.translatedText });
  } catch (cause) {
    console.error('[call-translate:provider]',cause);
    return fail('Translation is temporarily unavailable. Try the original text.',502);
  }
}
