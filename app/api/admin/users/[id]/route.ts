import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { endCall } from '@/lib/calls';
import { isCountry } from '@/lib/countries';
import { invalidatePublicStats } from '@/lib/public-stats';
import { notifyPublicPresence } from '@/lib/calls';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'users' }); if (!user) return error;
  const { id } = await params;
  const callWhere = { OR: [{ callerId: id }, { recipientId: id }] };
  const [account, calls, transactions, reports, auditLogs, blocksMade, blocksReceived, callTotals, coinTotals] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, displayName: true, email: true, role: true, accountType: true, creatorStatus: true, status: true, isGuest: true, emailVerifiedAt: true, createdAt: true, updatedAt: true, deletedAt: true, profile: true, photos: { orderBy: { position: 'asc' }, take: 1 }, wallet: true, payoutAccount: true } }),
    prisma.videoCall.findMany({ where: { OR: [{ callerId: id }, { recipientId: id }] }, orderBy: { createdAt: 'desc' }, take: 50, include: { caller: { select: { id: true, displayName: true } }, recipient: { select: { id: true, displayName: true } } } }),
    prisma.coinTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.userReport.findMany({ where: { OR: [{ reporterId: id }, { reportedId: id }] }, orderBy: { createdAt: 'desc' }, take: 50, include: { reporter: { select: { displayName: true } }, reported: { select: { displayName: true } } } }),
    prisma.adminAuditLog.findMany({ where: { targetId: id }, orderBy: { createdAt: 'desc' }, take: 50, include: { admin: { select: { displayName: true } } } }),
    prisma.blockedUser.findMany({ where: { blockerId: id }, include: { blocked: { select: { id: true, displayName: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.blockedUser.findMany({ where: { blockedId: id }, include: { blocker: { select: { id: true, displayName: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.videoCall.groupBy({ by: ['status'], where: callWhere, _count: { _all: true }, _sum: { billableSeconds: true } }),
    prisma.coinTransaction.groupBy({ by: ['type'], where: { userId: id }, _sum: { coins: true } }),
  ]);
  if (!account) return fail('User not found', 404);
  return ok({ user: account, calls, transactions, reports, auditLogs, blocksMade, blocksReceived, callTotals, coinTotals });
}

const editSchema = z.object({ displayName: z.string().trim().min(2).max(80), email: z.string().trim().email().max(254), country: z.string().max(80), bio: z.string().max(500), interests: z.array(z.string().trim().min(1).max(32)).max(20), discoverable: z.boolean().optional(), discoverFeatured: z.boolean().optional() });
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user: admin, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'users' }); if (!admin) return error;
  const { id } = await params; const parsed = editSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Invalid user data.');
  const data = parsed.data; const email = data.email.toLowerCase();
  if (data.country && !isCountry(data.country)) return fail('Choose a valid country.');
  try {
    const existing = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } }); if (!existing) return fail('User not found', 404);
    if (existing.role === 'ADMIN' && email !== admin.email) return fail('Administrator email cannot be changed from member management.', 403);
    const updated = await prisma.$transaction(async tx => {
      const account = await tx.user.update({ where: { id }, data: { displayName: data.displayName, email }, select: { id: true, displayName: true, email: true, role: true, status: true } });
      await tx.userProfile.updateMany({ where: { userId: id }, data: { country: data.country, bio: data.bio, interests: data.interests, ...(data.discoverable === undefined ? {} : { discoverable: data.discoverable }), ...(data.discoverFeatured === undefined ? {} : { discoverFeatured: data.discoverFeatured }) } });
      await tx.adminAuditLog.create({ data: { adminId: admin.id, action: data.discoverable !== undefined ? 'USER_DISCOVERABILITY_UPDATED' : data.discoverFeatured !== undefined ? 'USER_DISCOVER_FEATURED_UPDATED' : 'USER_PROFILE_EDITED', targetId: id, metadata: { displayName: data.displayName, email, country: data.country, discoverable: data.discoverable, discoverFeatured: data.discoverFeatured } } });
      return account;
    });
    invalidatePublicStats();
    return ok({ user: updated });
  } catch (cause) { return fail(cause instanceof Error ? cause.message : 'Could not update this account.'); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user: admin, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'users' }); if (!admin) return error;
  const { id } = await params;
  try {
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } }); if (!target) return fail('User not found', 404);
    if (target.role === 'ADMIN') return fail('Administrator accounts cannot be deleted here.', 403);
    if (target.status === 'DELETED') return ok({ deleted: true });
    const live = await prisma.videoCall.findMany({ where: { status: { in: ['RINGING', 'ACTIVE'] }, OR: [{ callerId: id }, { recipientId: id }] }, select: { id: true } });
    await prisma.$transaction([prisma.user.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } }), prisma.userProfile.updateMany({ where: { userId: id }, data: { online: false, discoverable: false } }), prisma.adminAuditLog.create({ data: { adminId: admin.id, action: 'USER_SOFT_DELETED', targetId: id } })]);
    for (const call of live) await endCall(call.id, 'admin_terminate');
    invalidatePublicStats();
    notifyPublicPresence();
    return ok({ deleted: true });
  } catch (cause) { return fail(cause instanceof Error ? cause.message : 'Could not delete this account.'); }
}
