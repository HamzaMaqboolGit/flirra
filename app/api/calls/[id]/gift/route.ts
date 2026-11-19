import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { emitTo } from '@/lib/calls';
import { fail, ok } from '@/lib/http';
import { z } from 'zod';
import { getSettings } from '@/lib/settings';
import { paidCoinsSpent, splitCredits } from '@/lib/billing-math';

type Context = { params: Promise<{ id: string }> };

async function activeConsentedCall(callId: string, userId: string) {
  return prisma.videoCall.findFirst({
    where: {
      id: callId,
      status: 'ACTIVE',
      OR: [{ callerId: userId }, { recipientId: userId }],
      participants: { some: { userId, consentedAt: { not: null }, leftAt: null } },
      AND: [{ participants: { some: { consentedAt: { not: null }, leftAt: null, userId: { not: userId } } } }],
    },
    select: { id: true, callerId: true, recipientId: true },
  });
}

export async function GET(_request: Request, context: Context) {
  const { user, error } = await guard(['MALE', 'FEMALE']);
  if (!user) return error;
  const { id } = await context.params;
  const call = await activeConsentedCall(id, user.id);
  if (!call) return fail('Gifts are available only during a consented active call.', 404);
  const [gifts, wallet] = await Promise.all([
    prisma.gift.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, imageUrl: true, coins: true, category: true, featured: true } }),
    prisma.wallet.findUnique({ where: { userId: user.id }, select: { coinBalance: true } }),
  ]);
  return ok({ gifts, balance: wallet?.coinBalance ?? 0 });
}

const bodySchema = z.object({ giftId: z.string().min(1), idempotencyKey: z.string().uuid().optional() });

export async function POST(request: Request, context: Context) {
  const { user, error } = await guard(['MALE', 'FEMALE']);
  if (!user) return error;
  const { id: callId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Choose a valid gift.');
  const idempotencyKey = parsed.data.idempotencyKey || randomUUID();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; callerId: string; recipientId: string; status: string }>>`
        SELECT id, "callerId", "recipientId", status::text AS status FROM "VideoCall" WHERE id = ${callId} FOR UPDATE
      `;
      const call = rows[0];
      if (!call || call.status !== 'ACTIVE' || ![call.callerId, call.recipientId].includes(user.id)) throw new Error('This call is no longer active.');
      const participants = await tx.callParticipant.findMany({ where: { callId, userId: { in: [call.callerId, call.recipientId] }, consentedAt: { not: null }, leftAt: null }, select: { userId: true } });
      if (new Set(participants.map((item) => item.userId)).size !== 2) throw new Error('Both people must consent before sending gifts.');
      const gift = await tx.gift.findFirst({ where: { id: parsed.data.giftId, enabled: true }, select: { id: true, name: true, coins: true, imageUrl: true, category: true, featured: true } });
      if (!gift) throw new Error('This gift is no longer available.');
      const recipientId = call.callerId === user.id ? call.recipientId : call.callerId;
      if (recipientId === user.id) throw new Error('You cannot send a gift to yourself.');
      const prior = await tx.callGift.findUnique({ where: { idempotencyKey: `gift:${idempotencyKey}` } });
      if (prior) {
        const wallet = await tx.wallet.findUnique({ where: { userId: user.id }, select: { coinBalance: true } });
        return { prior, gift, balance: wallet?.coinBalance ?? 0, recipientId, duplicate: true };
      }
      const walletRows = await tx.$queryRaw<Array<{ coinBalance: number; promotionalCoins: number }>>`
        SELECT "coinBalance", "promotionalCoins" FROM "Wallet" WHERE "userId" = ${user.id} FOR UPDATE
      `;
      const wallet = walletRows[0];
      if (!wallet || wallet.coinBalance < gift.coins) throw new Error('You do not have enough coins for this gift.');
      const promoSpent = Math.min(wallet.promotionalCoins, gift.coins);
      const nextWallet = await tx.wallet.update({ where: { userId: user.id }, data: { coinBalance: { decrement: gift.coins }, promotionalCoins: { decrement: promoSpent } }, select: { coinBalance: true } });
      const key = `gift:${idempotencyKey}`;
      const giftRecord = await tx.callGift.create({ data: { giftId: gift.id, callId, senderId: user.id, recipientId, name: gift.name, coins: gift.coins, idempotencyKey: key } });
      await tx.notification.create({ data: { userId: recipientId, kind: 'GIFT_RECEIVED', payload: { from: user.displayName, gift: gift.name, coins: gift.coins, callId } } });
      await tx.coinTransaction.create({ data: { userId: user.id, type: 'GIFT_SENT', coins: -gift.coins, promotionalCoins: -promoSpent, idempotencyKey: key, metadata: { callId, giftId: gift.id, recipientId, name: gift.name } } });
      const paidSpent = paidCoinsSpent(gift.coins, promoSpent);
      const settings = await getSettings();
      if (paidSpent > 0 && settings.womanShareBps == null) throw new Error('Gift earnings are not configured yet. Please try again later.');
      const split = splitCredits(paidSpent, settings.womanShareBps ?? 0);
      if (split.woman > 0) {
        const giftNumber = await tx.callGift.count({ where: { callId } });
        await tx.wallet.update({ where: { userId: recipientId }, data: { pendingCredits: { increment: split.woman } } });
        await tx.earning.create({ data: { userId: recipientId, callId, minuteNumber: -giftNumber, credits: split.woman, status: 'PENDING', idempotencyKey: `${key}:earn` } });
      }
      if (split.company > 0) {
        const giftNumber = await tx.callGift.count({ where: { callId } });
        await tx.companyCommission.create({ data: { callId, minuteNumber: -giftNumber, credits: split.company, idempotencyKey: `${key}:commission` } });
      }
      return { prior: giftRecord, gift, balance: nextWallet.coinBalance, recipientId, duplicate: false };
    });
    const payload = { id: result.prior.id, callId, gift: result.gift, senderId: user.id, senderName: user.displayName, recipientId: result.recipientId, coins: result.gift.coins, createdAt: result.prior.createdAt, duplicate: result.duplicate };
    if (!result.duplicate) {
      emitTo(user.id, 'call:gift', payload);
      emitTo(result.recipientId, 'call:gift', payload);
      emitTo(result.recipientId, 'notification:new', { id: payload.id, kind: 'GIFT_RECEIVED' });
      emitTo(user.id, 'wallet:update', { wallet: { coinBalance: result.balance } });
    }
    return ok({ ...payload, balance: result.balance });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not send this gift.';
    if (message.includes('Unique constraint')) {
      const prior = await prisma.callGift.findUnique({ where: { idempotencyKey: `gift:${idempotencyKey}` } });
      if (prior && prior.senderId === user.id && prior.callId === callId) {
        const wallet = await prisma.wallet.findUnique({ where: { userId: user.id }, select: { coinBalance: true } });
        return ok({ id: prior.id, callId, senderId: prior.senderId, senderName: user.displayName, recipientId: prior.recipientId, coins: prior.coins, createdAt: prior.createdAt, duplicate: true, balance: wallet?.coinBalance ?? 0 });
      }
    }
    return fail(message, message.includes('not enough coins') ? 402 : 400);
  }
}
