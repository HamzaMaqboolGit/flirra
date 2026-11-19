import { guard } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const { id } = await params;
  const viewer = user;

  try {
    const isSelf = viewer?.id === id;
    const profile = await prisma.user.findFirst({
      where: { id, status: 'ACTIVE', ...(isSelf ? {} : { isGuest: false, OR: [{accountType:'USER'},{accountType:'CREATOR',creatorStatus:'APPROVED'}], profile: { discoverable: true } }) },
      include: { profile: true, photos: { orderBy: { position: 'asc' }, take: 12 } },
    });
    if (!profile?.profile) return fail('This profile is unavailable.', 404);

    if (viewer && viewer.id !== id) {
      const blocked = await prisma.blockedUser.findFirst({
        where: { OR: [{ blockerId: viewer.id, blockedId: id }, { blockerId: id, blockedId: viewer.id }] },
        select: { blockerId: true },
      });
      if (blocked) return fail('This profile is unavailable.', 404);
    }

    const cutoff = new Date(Date.now() - 90_000);
    const [followerCount, followingCount, following, videoCallCount, storyRows] = await Promise.all([
      prisma.follow.count({ where: { followingId: id } }),
      prisma.follow.count({ where: { followerId: id } }),
      viewer ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewer.id, followingId: id } }, select: { followerId: true } }) : null,
      prisma.videoCall.count({ where: { OR: [{ callerId: id }, { recipientId: id }], status: 'COMPLETED', startedAt: { not: null } } }),
      prisma.userStory.findMany({ where: { ownerId: id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'asc' }, select: { id: true, mediaUrl: true, mediaType: true, visibility: true, createdAt: true, expiresAt: true, caption: true } }),
    ]);
    const visibleStoryRows = storyRows.filter(story => story.visibility === 'PUBLIC' || (story.visibility === 'FOLLOWERS' && Boolean(following)));
    const age = profile.dateOfBirth ? Math.max(18, Math.floor((Date.now() - profile.dateOfBirth.getTime()) / 31_557_600_000)) : null;

    return ok({ person: {
      id,
      displayName: profile.displayName,
      role: profile.role,
      age,
      country: profile.profile.country,
      bio: profile.profile.bio,
      interests: profile.profile.interests,
      avatarUrl: profile.photos[0]?.url || profile.profile.avatarUrl,
      photos: profile.photos.map((photo) => photo.url),
      online: Boolean(profile.profile.online && profile.profile.lastSeenAt && profile.profile.lastSeenAt > cutoff && (profile.profile.accountSettings as Record<string, unknown> | null)?.showOnline !== false),
      verified: Boolean(profile.emailVerifiedAt),
      verificationLabel: 'Email verified',
      memberSince: profile.createdAt,
      followerCount,
      followingCount,
      videoCallCount,
      following: Boolean(following),
      self: viewer?.id === id,
      viewerRole: viewer?.role || null,
      viewerVerified: Boolean(viewer?.emailVerifiedAt),
      guest: Boolean(viewer?.isGuest),
      videos: [],
      stories: visibleStoryRows.map(story => ({ id: story.id, url: story.mediaUrl, mediaType: story.mediaType === 'video' ? 'VIDEO' : 'IMAGE', createdAt: story.createdAt, expiresAt: story.expiresAt, caption: story.caption })),
    } });
  } catch (cause) {
    console.error('[discover:profile]', { userId: id, cause });
    return fail('This profile is temporarily unavailable. Please try again.', 503);
  }
}
