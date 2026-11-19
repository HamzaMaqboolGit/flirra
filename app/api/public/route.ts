import { prisma } from '@/lib/db';
import { ok } from '@/lib/http';
import { getSettings } from '@/lib/settings';
import { paymentsConfig } from '@/lib/stripe';
import type { Prisma } from '@prisma/client';
import { getPublicStats } from '@/lib/public-stats';
import { currentUser } from '@/lib/auth';
import { paypalConfig } from '@/lib/paypal';
import { getActiveCoinPackages, orderCoinPackages } from '@/lib/coin-packages';

export async function GET() {
  const cutoff = new Date(Date.now() - 90_000);
  const viewer = await currentUser();
  const blocked = viewer ? await prisma.blockedUser.findMany({ where: { OR: [{ blockerId: viewer.id }, { blockedId: viewer.id }] }, select: { blockerId: true, blockedId: true } }) : [];
  const hiddenIds = blocked.map(row => row.blockerId === viewer?.id ? row.blockedId : row.blockerId);
  const availableWhere: Prisma.UserWhereInput = {
    role: { in: ['MALE', 'FEMALE'] }, status: 'ACTIVE', isGuest: false,
    OR: [{ accountType: 'USER' }, { accountType: 'CREATOR', creatorStatus: 'APPROVED' }],
    ...(viewer ? { id: { notIn: [viewer.id, ...hiddenIds] } } : {}),
    profile: { online: true, discoverable: true, lastSeenAt: { gt: cutoff } },
    sentCalls: { none: { status: { in: ['RINGING', 'ACTIVE'] } } },
    receivedCalls: { none: { status: { in: ['RINGING', 'ACTIVE'] } } },
  };
  const publicProfileWhere: Prisma.UserWhereInput = {
    role: { in: ['MALE', 'FEMALE'] }, status: 'ACTIVE', isGuest: false,
    OR: [{ accountType: 'USER' }, { accountType: 'CREATOR', creatorStatus: 'APPROVED' }],
    ...(viewer ? { id: { notIn: [viewer.id, ...hiddenIds] } } : {}),
    profile: { discoverable: true },
  };
  const [settings, packages, people, onlineNow, stats] = await Promise.all([
    getSettings(),
    getActiveCoinPackages(),
    prisma.user.findMany({ where: publicProfileWhere, include: { profile: true, photos: { orderBy: { position: 'asc' }, take: 1 } }, orderBy: { createdAt: 'desc' }, take: 12 }),
    prisma.user.count({ where: availableWhere }),
    getPublicStats(),
  ]);
  const [stripeConfig,paypal] = await Promise.all([paymentsConfig(),paypalConfig()]);
  const paypalReady=paypal.enabled&&Boolean(paypal.clientId&&paypal.clientSecret&&paypal.webhookId)&&(paypal.environment!=='live'||(process.env.PAYPAL_LIVE_APPROVED==='true'&&process.env.PAYMENTS_LIVE==='true'));
  return ok({
    packages: orderCoinPackages(packages),
    featuredPeople: people.map(({ id, displayName, role, dateOfBirth, emailVerifiedAt, profile, photos }) => ({ id, displayName, role, age: dateOfBirth ? Math.max(18, Math.floor((Date.now() - dateOfBirth.getTime()) / 31_557_600_000)) : null, country: profile?.country || '', bio: profile?.bio || '', interests: profile?.interests || [], avatarUrl: photos[0]?.url || profile?.avatarUrl || null, online: Boolean(profile?.online && profile.lastSeenAt && profile.lastSeenAt > cutoff), verified: Boolean(emailVerifiedAt) })),
    metrics: stats,
    onlineNow,
    coinsPerMinute: settings.coinsPerMinute,
    paymentsEnabled: stripeConfig.ok||paypalReady,
  });
}
