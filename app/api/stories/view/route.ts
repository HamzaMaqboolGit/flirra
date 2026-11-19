import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export async function POST(request: Request) {
  const viewer = await currentUser();
  if (!viewer) return fail('Sign in to track story views.', 401);
  const body = await request.json().catch(() => null) as { storyId?: unknown } | null;
  if (typeof body?.storyId !== 'string' || body.storyId.length > 100) return fail('Choose an active story.');
  const story = await prisma.userStory.findFirst({ where: { id: body.storyId, expiresAt: { gt: new Date() } }, select: { id: true, ownerId: true, visibility: true, owner: { select: { status: true, isGuest: true, guestExpiresAt: true, emailVerifiedAt: true, dateOfBirth: true, accountType: true, creatorStatus: true, profile: { select: { discoverable: true } } } } } });
  if (!story || story.ownerId === viewer.id || story.owner.status !== 'ACTIVE' || !story.owner.profile?.discoverable || (story.owner.isGuest ? Boolean(story.owner.guestExpiresAt && story.owner.guestExpiresAt <= new Date()) : (story.owner.accountType === 'CREATOR' && story.owner.creatorStatus !== 'APPROVED'))) return fail('Story not found.', 404);
  const [blocked, followed] = await Promise.all([
    prisma.blockedUser.findFirst({ where: { OR: [{ blockerId: viewer.id, blockedId: story.ownerId }, { blockerId: story.ownerId, blockedId: viewer.id }] }, select: { blockerId: true } }),
    story.visibility === 'FOLLOWERS' ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewer.id, followingId: story.ownerId } }, select: { followerId: true } }) : Promise.resolve(true),
  ]);
  if (blocked || story.visibility === 'PRIVATE' || (story.visibility === 'FOLLOWERS' && !followed)) return fail('Story not found.', 404);
  await prisma.userStoryView.upsert({
    where: { viewerId_storyId: { viewerId: viewer.id, storyId: story.id } },
    create: { viewerId: viewer.id, storyId: story.id },
    update: { viewedAt: new Date() },
  });
  return ok({ viewed: true });
}
