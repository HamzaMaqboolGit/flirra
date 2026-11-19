import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { z } from 'zod';

export async function GET() {
  const { user, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'payments' });
  if (!user) return error;
  const [gifts, transactions, total] = await Promise.all([
    prisma.gift.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.callGift.findMany({ take: 50, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, coins: true, createdAt: true, sender: { select: { displayName: true } }, recipient: { select: { displayName: true } }, gift: { select: { category: true } } } }),
    prisma.callGift.aggregate({ _sum: { coins: true }, _count: true }),
  ]);
  return ok({ gifts, transactions, totalCoinsSpent: total._sum.coins || 0, transactionCount: total._count });
}

const schema = z.object({ id: z.string().min(1).optional(), name: z.string().trim().min(2).max(48), imageUrl: z.string().trim().max(500).refine((value) => !value || value.startsWith('/') || /^https:\/\//i.test(value), 'Use an HTTPS image URL or a local path.'), coins: z.number().int().min(1).max(100000), category: z.string().trim().min(2).max(32).default('Popular'), featured: z.boolean().default(false), enabled: z.boolean(), sortOrder: z.number().int().min(0).max(9999) });

export async function POST(request: Request) {
  const { user: admin, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'payments' });
  if (!admin) return error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Invalid gift settings.');
  try {
    const { id, ...data } = parsed.data;
    const gift = id ? await prisma.gift.update({ where: { id }, data }) : await prisma.gift.create({ data });
    await prisma.adminAuditLog.create({ data: { adminId: admin.id, action: id ? 'GIFT_UPDATED' : 'GIFT_CREATED', targetId: gift.id, metadata: { name: gift.name, coins: gift.coins, category: gift.category, enabled: gift.enabled } } });
    return ok({ gift });
  } catch (cause) { return fail(cause instanceof Error ? cause.message : 'Could not save this gift.'); }
}

export async function DELETE(request: Request) {
  const { user: admin, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'payments' });
  if (!admin) return error;
  const parsed = z.object({ id: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Choose a valid gift.');
  try {
    const existing = await prisma.gift.findUnique({ where: { id: parsed.data.id }, select: { id: true, name: true } });
    if (!existing) return fail('This gift no longer exists.', 404);
    const hasTransactions = await prisma.callGift.count({ where: { giftId: existing.id } }) > 0;
    if (hasTransactions) {
      const gift = await prisma.gift.update({ where: { id: existing.id }, data: { enabled: false } });
      await prisma.adminAuditLog.create({ data: { adminId: admin.id, action: 'GIFT_DISABLED', targetId: gift.id, metadata: { name: gift.name, reason: 'preserve_gift_transaction_history' } } });
      return ok({ gift, deleted: false });
    }
    await prisma.gift.delete({ where: { id: existing.id } });
    await prisma.adminAuditLog.create({ data: { adminId: admin.id, action: 'GIFT_DELETED', targetId: existing.id, metadata: { name: existing.name } } });
    return ok({ gift: existing, deleted: true });
  } catch (cause) { return fail(cause instanceof Error ? cause.message : 'Could not remove this gift.'); }
}
