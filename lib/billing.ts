import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { paidCoinsSpent, splitCredits } from "./billing-math";
import { isUniqueViolation } from "./http";
import { expirePromotionalCoins } from "./rewards";

export type BillResult = { ok: true; duplicate?: boolean } | { ok: false; reason: "inactive" | "insufficient" | "unconfigured" };

export async function billMinute(callId: string, minuteNumber: number, activate = false): Promise<BillResult> {
  const settings = await getSettings();
  const billingCall = await prisma.videoCall.findUnique({ where: { id: callId }, select: { callerId: true } });
  if (billingCall) await expirePromotionalCoins(billingCall.callerId);
  const coins = settings.coinsPerMinute;
  if (coins == null || settings.womanShareBps == null) return { ok: false, reason: "unconfigured" };
  const key = `call:${callId}:minute:${minuteNumber}`;

  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; status: string; callerId: string; recipientId: string; lastBilledMinute: number }>>`
        SELECT id, status::text AS status, "callerId", "recipientId", "lastBilledMinute"
        FROM "VideoCall" WHERE id = ${callId} FOR UPDATE
      `;
      const call = locked[0];
      if (!call) return { ok: false, reason: "inactive" } as const;
      if (activate) {
        if (call.status !== "RINGING" && call.status !== "ACTIVE") {
          return { ok: false, reason: "inactive" } as const;
        }
      } else if (call.status !== "ACTIVE") {
        return { ok: false, reason: "inactive" } as const;
      }
      if (call.lastBilledMinute >= minuteNumber) return { ok: true, duplicate: true } as const;

      const lockedWallet = await tx.$queryRaw<Array<{ promotionalCoins: number }>>`
        SELECT "promotionalCoins" FROM "Wallet" WHERE "userId" = ${call.callerId} FOR UPDATE
      `;
      if (!lockedWallet.length) return { ok: false, reason: "insufficient" } as const;
      const promoSpent = Math.min(lockedWallet[0].promotionalCoins, coins);
      const paidSpent = paidCoinsSpent(coins, promoSpent);
      const split = splitCredits(paidSpent, settings.womanShareBps!);
      const debited = await tx.$queryRaw<Array<{ coinBalance: number }>>`
        UPDATE "Wallet" SET "coinBalance" = "coinBalance" - ${coins}, "promotionalCoins" = "promotionalCoins" - ${promoSpent}
        WHERE "userId" = ${call.callerId} AND "coinBalance" >= ${coins}
        RETURNING "coinBalance"
      `;
      if (debited.length === 0) return { ok: false, reason: "insufficient" } as const;

      await tx.coinTransaction.create({
        data: {
          userId: call.callerId,
          type: "CALL_SPEND",
          coins: -coins,
          promotionalCoins: -promoSpent,
          idempotencyKey: `${key}:spend`,
          metadata: { callId, minuteNumber },
        },
      });
      if (split.woman > 0) {
        await tx.wallet.update({ where: { userId: call.recipientId }, data: { pendingCredits: { increment: split.woman } } });
        await tx.earning.create({ data: { userId: call.recipientId, callId, minuteNumber, credits: split.woman, status: "PENDING", idempotencyKey: `${key}:earn` } });
      }
      await tx.companyCommission.create({
        data: { callId, minuteNumber, credits: split.company, idempotencyKey: `${key}:commission` },
      });
      await tx.callBillingRecord.create({
        data: { callId, minuteNumber, coins, womanCredits: split.woman, companyCredits: split.company, idempotencyKey: key },
      });
      await tx.videoCall.update({
        where: { id: callId },
        data: {
          status: activate ? "ACTIVE" : undefined,
          startedAt: activate ? new Date() : undefined,
          lastBilledMinute: minuteNumber,
          coinsCharged: { increment: coins },
          womanCredits: { increment: split.woman },
          companyCredits: { increment: split.company },
          billableSeconds: minuteNumber * 60,
        },
      });
      return { ok: true } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: true, duplicate: true };
    throw error;
  }
}

export async function settleCallEarningsInTransaction(tx: Prisma.TransactionClient, callId: string, recipientId: string, reverse: boolean) {
    await tx.$queryRaw`SELECT id FROM "Earning" WHERE "callId" = ${callId} FOR UPDATE`;
    const pending = await tx.earning.findMany({ where: { callId, status: "PENDING" } });
    const sum = pending.reduce((total, row) => total + row.credits, 0);
    if (sum === 0) return;
    if (reverse) {
      await tx.earning.updateMany({ where: { callId, status: "PENDING" }, data: { status: "REVERSED" } });
      await tx.wallet.update({ where: { userId: recipientId }, data: { pendingCredits: { decrement: sum } } });
      return;
    }
    await tx.earning.updateMany({ where: { callId, status: "PENDING" }, data: { status: "AVAILABLE" } });
    await tx.wallet.update({
      where: { userId: recipientId },
      data: {
        pendingCredits: { decrement: sum },
        availableCredits: { increment: sum },
        lifetimeCredits: { increment: sum },
      },
    });
    await tx.coinTransaction.create({
      data: {
        userId: recipientId,
        type: "EARNING_SETTLED",
        credits: sum,
        idempotencyKey: `call:${callId}:settle`,
        metadata: { callId },
      },
    });
}

export async function settleCallEarnings(callId: string, recipientId: string, reverse: boolean) {
  await prisma.$transaction(tx => settleCallEarningsInTransaction(tx, callId, recipientId, reverse));
}

export async function creditPurchase(paymentId: string, idempotencyKey: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status === "SUCCEEDED" || payment.status === "REFUNDED") return payment;
    await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED" } });
    await tx.wallet.update({ where: { userId: payment.userId }, data: { coinBalance: { increment: payment.coins } } });
    await tx.coinTransaction.create({
      data: {
        userId: payment.userId,
        type: "PURCHASE",
        coins: payment.coins,
        amountCents: payment.amountCents,
        idempotencyKey,
        metadata: { paymentId: payment.id },
      },
    });
    await tx.notification.create({
      data: { userId: payment.userId, kind: "COINS_PURCHASED", payload: { coins: payment.coins, paymentId: payment.id } },
    });
    return payment;
  });
}

export async function reversePayment(paymentId: string, amountCents: number, providerRefundId: string | null, reason: string, adminId?: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment || (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED")) return null;
    const already = await tx.refund.findFirst({ where: providerRefundId ? { providerRefundId } : { paymentId, reason, amountCents } });
    if (already) return already;
    const remainingCents = payment.amountCents - payment.refundedCents;
    const appliedCents = Math.min(remainingCents, Math.max(0, amountCents));
    if (appliedCents <= 0) return null;
    const coinsReversed = Math.min(payment.coins, Math.round((payment.coins * appliedCents) / payment.amountCents));
    const wallet = await tx.wallet.findUnique({ where: { userId: payment.userId } });
    const removable = Math.min(wallet?.coinBalance ?? 0, coinsReversed);
    if (removable > 0) {
      await tx.wallet.update({ where: { userId: payment.userId }, data: { coinBalance: { decrement: removable } } });
    }
    const refundedCents = payment.refundedCents + appliedCents;
    await tx.payment.update({
      where: { id: payment.id },
      data: { refundedCents, status: refundedCents >= payment.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    });
    const refund = await tx.refund.create({
      data: { paymentId, adminId, amountCents: appliedCents, coinsReversed: removable, providerRefundId, reason },
    });
    await tx.coinTransaction.create({
      data: {
        userId: payment.userId,
        type: "REFUND",
        coins: -removable,
        amountCents: -appliedCents,
        idempotencyKey: `refund:${refund.id}`,
        metadata: { paymentId, requestedCoins: coinsReversed, removedCoins: removable },
      },
    });
    return refund;
  });
}
