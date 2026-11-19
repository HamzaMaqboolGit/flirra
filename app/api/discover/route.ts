import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { countryAliases, isCountry } from '@/lib/countries';
import type { Prisma } from '@prisma/client';

const ageDate = (age: number) => { const date = new Date(); date.setUTCFullYear(date.getUTCFullYear() - age); return date; };

export async function GET(req: Request) {
  const { user, error } = await guard(undefined, { allowSuspended: true });
  if (!user) return error;
  const params = new URL(req.url).searchParams;
  const q = (params.get('q') || '').trim();
  const interest = (params.get('interest') || '').trim();
  const country = params.get('country') || 'Worldwide';
  const gender = params.get('gender') || 'all';
  const onlineOnly = params.get('online') === 'true';
  const availableOnly = params.get('available') === 'true';
  const hasStory = params.get('hasStory') === 'true';
  const mode = params.get('mode') || 'all';
  const sort = params.get('sort') || 'recent';
  const minAge = Number(params.get('minAge') || 18);
  const maxAge = Number(params.get('maxAge') || 99);
  const page = Math.max(1, Math.min(10000, Number(params.get('page') || 1)));
  const pageSize = 12;
  if (q.length > 60 || interest.length > 24 || (country !== 'Worldwide' && !isCountry(country)) || !['all','women','men'].includes(gender) || !['recent','active','popular'].includes(sort) || !['all','new','popular'].includes(mode) || !Number.isInteger(minAge) || !Number.isInteger(maxAge) || minAge < 18 || maxAge > 99 || minAge > maxAge) return fail('Invalid discovery filter');
  const viewer = user;
  const blockedIds = viewer ? await prisma.blockedUser.findMany({where:{OR:[{blockerId:viewer.id},{blockedId:viewer.id}]},select:{blockerId:true,blockedId:true}}) : [];
  const hiddenIds = blockedIds.map(row => row.blockerId === viewer?.id ? row.blockedId : row.blockerId);
  const cutoff = new Date(Date.now() - 90_000);
  const now = new Date();
  const storyOwners = hasStory ? await prisma.userStory.findMany({ where: { visibility: 'PUBLIC', expiresAt: { gt: now } }, distinct: ['ownerId'], select: { ownerId: true } }) : [];
  const where: Prisma.UserWhereInput = {
    status: 'ACTIVE' as const,
    role: gender === 'women' ? 'FEMALE' : gender === 'men' ? 'MALE' : { in: ['MALE','FEMALE'] },
    OR: [{ accountType: 'USER' }, { accountType: 'CREATOR', creatorStatus: 'APPROVED' }],
    isGuest: false,
    ...(viewer || hasStory ? { id: { ...(viewer ? { notIn: [viewer.id, ...hiddenIds] } : {}), ...(hasStory ? { in: storyOwners.map(row => row.ownerId) } : {}) } } : {}),
    dateOfBirth: { lte: ageDate(minAge), gte: ageDate(maxAge + 1) },
    profile: {
      discoverable: true,
      ...(country !== 'Worldwide' ? { country: { in: countryAliases(country) } } : {}),
      ...(onlineOnly || availableOnly ? { online: true, lastSeenAt: { gt: cutoff } } : {}),
      ...(interest ? { interests: { has: interest } } : {}),
      ...(q ? { OR: [{ bio: { contains: q, mode: 'insensitive' as const } }, { interests: { has: q } }, { user: { displayName: { contains: q, mode: 'insensitive' as const } } }] } : {}),
    },
    ...(availableOnly ? { sentCalls: { none: { status: { in: ['RINGING','ACTIVE'] } } }, receivedCalls: { none: { status: { in: ['RINGING','ACTIVE'] } } } } : {}),
    ...(mode === 'popular' ? { followers: { some: {} } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, include: { profile: { select: { country: true, bio: true, interests: true, avatarUrl: true, online: true, lastSeenAt: true, accountSettings: true } }, photos: { orderBy: { position: 'asc' }, take: 1 }, _count: { select: { followers: true } } }, orderBy: sort === 'popular' || mode === 'popular' ? [{ profile: { discoverFeatured: 'desc' } }, { followers: { _count: 'desc' } }] : sort === 'active' ? { profile: { lastSeenAt: 'desc' } } : { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const follows = viewer && rows.length ? await prisma.follow.findMany({ where: { followerId: viewer.id, followingId: { in: rows.map((row) => row.id) } }, select: { followingId: true } }) : [];
  const followingIds = new Set(follows.map((row) => row.followingId));
  const activeStories = await prisma.userStory.findMany({ where: { ownerId: { in: rows.map(row => row.id) }, visibility: 'PUBLIC', expiresAt: { gt: now } }, distinct: ['ownerId'], select: { ownerId: true } });
  const storyOwnerIds = new Set(activeStories.map(story => story.ownerId));
  const realPeople = rows.map(({ id, displayName, role, dateOfBirth, createdAt, emailVerifiedAt, profile, photos, _count }) => ({
    id, displayName, role, age: dateOfBirth ? Math.floor((Date.now() - dateOfBirth.getTime()) / 31_557_600_000) : null, country: profile?.country || '', bio: profile?.bio || '', interests: profile?.interests || [],
    avatarUrl: photos[0]?.url || profile?.avatarUrl || null, online: Boolean(profile?.online && profile.lastSeenAt && profile.lastSeenAt > cutoff && (profile.accountSettings as Record<string, unknown> | null)?.showOnline !== false), verified: Boolean(emailVerifiedAt), following: followingIds.has(id), memberSince: createdAt, hasStory: storyOwnerIds.has(id), followerCount: _count.followers,
  }));
  return ok({ people: realPeople, total, page, pageSize, pages: Math.ceil(total / pageSize) });
}
