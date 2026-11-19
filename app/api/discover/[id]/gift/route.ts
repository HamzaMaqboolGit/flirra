import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { emitTo } from '@/lib/calls';

const inputSchema = z.object({ giftId: z.string().min(1), quantity: z.number().int().min(1).max(20).default(1), idempotencyKey: z.string().uuid().optional() });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await guard(['MALE', 'FEMALE']); if (!user) return error;
  const { id } = await params;
  if (id === user.id) return fail('You cannot send a gift to yourself.', 400);
  const [recipient, gifts, wallet] = await Promise.all([
    prisma.user.findFirst({ where: { id, status: 'ACTIVE', isGuest: false }, select: { id: true } }),
    prisma.gift.findMany({ where: { enabled: true }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, imageUrl: true, coins: true, category: true, featured: true } }),
    prisma.wallet.findUnique({ where: { userId: user.id }, select: { coinBalance: true } }),
  ]);
  if (!recipient) return fail('This member is unavailable.', 404);
  return ok({ gifts, balance: wallet?.coinBalance ?? 0 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await guard(['MALE', 'FEMALE'], { maintenance: true }); if (!user) return error;
  const { id: recipientId } = await params;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return fail('Choose a valid gift and quantity.');
  if (recipientId === user.id) return fail('You cannot send a gift to yourself.', 400);
  const key = `profile-gift:${parsed.data.idempotencyKey || randomUUID()}`;
  try {
    const result = await prisma.$transaction(async tx => {
      const recipient = await tx.user.findFirst({ where: { id: recipientId, status: 'ACTIVE', isGuest: false }, select: { id: true } });
      if (!recipient) throw new Error('This member is unavailable.');
      const prior = await tx.callGift.findUnique({ where: { idempotencyKey: key }, include: { gift: { select: { imageUrl: true } } } });
      if (prior) return { prior, balance: (await tx.wallet.findUnique({ where: { userId: user.id }, select: { coinBalance: true } }))?.coinBalance ?? 0, duplicate: true };
      const gift = await tx.gift.findFirst({ where: { id: parsed.data.giftId, enabled: true }, select: { id: true, name: true, imageUrl: true, coins: true } });
      if (!gift) throw new Error('This gift is no longer available.');
      const total = gift.coins * parsed.data.quantity;
      const walletRows = await tx.$queryRaw<Array<{ coinBalance: number }>>`SELECT "coinBalance" FROM "Wallet" WHERE "userId"=${user.id} FOR UPDATE`;
      if (!walletRows[0] || walletRows[0].coinBalance < total) throw new Error('You do not have enough coins for this gift.');
      const conversation = await tx.conversation.findFirst({ where: { OR: [{ memberAId: user.id, memberBId: recipientId }, { memberAId: recipientId, memberBId: user.id }] }, select: { id: true } }) || await tx.conversation.create({ data: { memberAId: user.id, memberBId: recipientId }, select: { id: true } });
      await tx.wallet.update({ where: { userId: user.id }, data: { coinBalance: { decrement: total } } });
      const record = await tx.callGift.create({ data: { giftId: gift.id, conversationId: conversation.id, senderId: user.id, recipientId, name: parsed.data.quantity > 1 ? `${gift.name} ×${parsed.data.quantity}` : gift.name, coins: total, idempotencyKey: key } });
      await tx.coinTransaction.create({ data: { userId: user.id, type: 'GIFT_SENT', coins: -total, idempotencyKey: key, metadata: { giftId: gift.id, recipientId, quantity: parsed.data.quantity, profileGift: true } } });
      await tx.notification.create({ data: { userId: recipientId, kind: 'GIFT_RECEIVED', payload: { from: user.displayName, gift: gift.name, coins: total, conversationId: conversation.id } } });
      await tx.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
      return { prior: { ...record, gift }, balance: walletRows[0].coinBalance - total, duplicate: false, conversationId: conversation.id };
    });
    const payload = { id: result.prior.id, conversationId: result.conversationId, senderId: user.id, recipientId, name: result.prior.name, coins: result.prior.coins, createdAt: result.prior.createdAt, gift: { imageUrl: result.prior.gift.imageUrl } };
    if (!result.duplicate) { emitTo(recipientId, 'message:new', { conversationId: result.conversationId, gift: payload }); emitTo(recipientId, 'notification:new', { kind: 'GIFT_RECEIVED', conversationId: result.conversationId }); emitTo(user.id, 'wallet:update', { wallet: { coinBalance: result.balance } }); }
    return ok({ ...payload, balance: result.balance, duplicate: result.duplicate });
  } catch (cause) { const message = cause instanceof Error ? cause.message : 'Could not send this gift.'; return fail(message, message.includes('enough coins') ? 402 : 400); }
}
