import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export async function POST(req: Request) {
  const viewer = await currentUser();
  if (!viewer) return fail('Sign in to follow members.', 401);
  const body = await req.json().catch(() => null) as { userId?: unknown; follow?: unknown } | null;
  if (!body || typeof body.userId !== 'string' || typeof body.follow !== 'boolean') return fail('Choose a valid member and follow action.');
  if (body.userId === viewer.id) return fail('You cannot follow or unfollow your own profile.', 400);
  const target = await prisma.user.findFirst({ where: { id: body.userId, status: 'ACTIVE', isGuest: false, profile: { discoverable: true } }, select: { id: true } });
  if (!target) return fail('This profile is unavailable.', 404);
  const blocked = await prisma.blockedUser.findFirst({ where: { OR: [{ blockerId: viewer.id, blockedId: target.id }, { blockerId: target.id, blockedId: viewer.id }] } });
  if (blocked) return fail('This profile is unavailable.', 404);
  if (body.follow) {
    const existing = await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewer.id, followingId: target.id } }, select: { followerId: true } });
    await prisma.follow.upsert({ where: { followerId_followingId: { followerId: viewer.id, followingId: target.id } }, create: { followerId: viewer.id, followingId: target.id }, update: {} });
    if (!existing) await prisma.notification.create({ data: { userId: target.id, kind: 'NEW_FOLLOWER', payload: { from: viewer.displayName, userId: viewer.id } } });
  } else await prisma.follow.deleteMany({ where: { followerId: viewer.id, followingId: target.id } });
  const followerCount = await prisma.follow.count({ where: { followingId: target.id } });
  return ok({ following: body.follow, followerCount });
}
