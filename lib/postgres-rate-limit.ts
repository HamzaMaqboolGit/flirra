import { prisma } from './db';

export class RateLimitUnavailableError extends Error { readonly code = 'RATE_LIMIT_UNAVAILABLE'; constructor() { super('Authentication throttling is unavailable'); } }
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const now = new Date(); const expiresAt = new Date(now.getTime() + windowSec * 1000);
  try {
    const result = await prisma.$transaction(async tx => {
      const bucket = await tx.rateLimitBucket.findUnique({ where: { key } });
      if (!bucket || bucket.expiresAt <= now) { await tx.rateLimitBucket.upsert({ where: { key }, create: { key, count: 1, windowStart: now, expiresAt }, update: { count: 1, windowStart: now, expiresAt } }); return 1; }
      const updated = await tx.rateLimitBucket.updateMany({ where: { key, expiresAt: { gt: now }, count: { lt: limit + 1 } }, data: { count: { increment: 1 } } });
      return updated.count ? bucket.count + 1 : limit + 1;
    }, { isolationLevel: 'Serializable' });
    return result <= limit;
  } catch (error) { console.error('[rate-limit] database operation failed', typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : 'UNKNOWN'); throw new RateLimitUnavailableError(); }
}
