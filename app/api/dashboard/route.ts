import { prisma } from "@/lib/db";
import { guard } from "@/lib/guard";
import { ok } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { liveCallFor, serializeCall } from "@/lib/calls";
import { expirePromotionalCoins } from "@/lib/rewards";

export async function GET() {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  await expirePromotionalCoins(user.id);
  const settings = await getSettings();
  const day = new Date().toISOString().slice(0, 10);
  const [calls, transactions, payments, withdrawals, notifications, incoming, packages, online, dailyRewardClaimed] = await Promise.all([
    prisma.videoCall.findMany({
      where: { OR: [{ callerId: user.id }, { recipientId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { caller: { include: { profile: true } }, recipient: { include: { profile: true } } },
    }),
    prisma.coinTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.withdrawalRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    liveCallFor(user.id),
    prisma.coinPackage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.userProfile.count({ where: { online: true, user: { role: { in: ["MALE", "FEMALE"] }, status: "ACTIVE" } } }),
    prisma.rewardClaim.findUnique({ where: { claimKey: `daily:${user.id}:${day}` }, select: { id: true } }),
  ]);
  return ok({
    settings: {
      siteName: settings.siteName,
      coinsPerMinute: settings.coinsPerMinute,
      womanShareBps: settings.womanShareBps,
      minWithdrawalCredits: settings.minWithdrawalCredits,
      creditValueCents: settings.creditValueCents,
      paymentsEnabled: process.env.PAYMENTS_ENABLED === "true",
      maintenanceMode: settings.maintenanceMode,
    },
    calls: calls.map((call) => serializeCall(call, user.id)),
    transactions,
    payments,
    withdrawals,
    notifications,
    incoming: incoming?.status === "RINGING" ? serializeCall(incoming, user.id) : null,
    activeCall: incoming?.status === "ACTIVE" ? serializeCall(incoming, user.id) : null,
    packages,
    onlineMembers: online,
    dailyRewardClaimed: Boolean(dailyRewardClaimed),
  });
}
