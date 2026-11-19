import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { isAdult } from '@/lib/billing-math';

const mediaTypes: Record<string, { ext: string; kind: 'image'|'video'; max: number }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image', max: 8_000_000 },
  'image/png': { ext: 'png', kind: 'image', max: 8_000_000 },
  'image/webp': { ext: 'webp', kind: 'image', max: 8_000_000 },
  'video/mp4': { ext: 'mp4', kind: 'video', max: 15_000_000 },
  'video/webm': { ext: 'webm', kind: 'video', max: 15_000_000 },
};
const eligibleMember: Prisma.UserWhereInput = { status: 'ACTIVE', isGuest: false, OR: [{ accountType: 'USER' }, { accountType: 'CREATOR' }], profile: { discoverable: true } };

export async function GET() {
  const viewer = await currentUser();
  const hidden = viewer ? await prisma.blockedUser.findMany({ where: { OR: [{ blockerId: viewer.id }, { blockedId: viewer.id }] }, select: { blockerId: true, blockedId: true } }) : [];
  const hiddenIds = hidden.map(row => row.blockerId === viewer?.id ? row.blockedId : row.blockerId);
  const now = new Date();
  const adultCutoff = new Date(now.getTime() - 18 * 365.2425 * 24 * 60 * 60 * 1000);
  const eligibleGuest: Prisma.UserWhereInput = { status: 'ACTIVE', isGuest: true, role: { in: ['MALE', 'FEMALE'] }, OR: [{ guestExpiresAt: null }, { guestExpiresAt: { gt: now } }], profile: { discoverable: true } };
  const stories = await prisma.userStory.findMany({
    where: { expiresAt: { gt: now }, ownerId: { notIn: hiddenIds }, owner: viewer ? { OR: [{ ...eligibleMember, dateOfBirth: { lte: adultCutoff } }, eligibleGuest, { id: viewer.id, status: 'ACTIVE' }] } : { OR: [{ ...eligibleMember, dateOfBirth: { lte: adultCutoff } }, eligibleGuest] } },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, ownerId: true, mediaUrl: true, mediaType: true, caption: true, createdAt: true, expiresAt: true, owner: { select: { id: true, displayName: true, profile: { select: { avatarUrl: true, online: true, lastSeenAt: true, accountSettings: true } }, photos: { orderBy: { position: 'asc' }, take: 1, select: { url: true } } } } },
  });
  const followerIds = viewer && stories.length ? new Set((await prisma.follow.findMany({ where: { followerId: viewer.id, followingId: { in: [...new Set(stories.map(row => row.ownerId))] } }, select: { followingId: true } })).map(row => row.followingId)) : new Set<string>();
  const visibleStories = stories.filter(story => {
    const settings = story.owner.profile?.accountSettings;
    const visibility = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).storyVisibility : undefined;
    return story.ownerId === viewer?.id || (visibility !== 'PRIVATE' && (visibility !== 'FOLLOWERS' || followerIds.has(story.ownerId)));
  });
  const viewedIds = viewer && visibleStories.length
    ? new Set((await prisma.userStoryView.findMany({ where: { viewerId: viewer.id, storyId: { in: visibleStories.map(story => story.id) } }, select: { storyId: true } })).map(view => view.storyId))
    : new Set<string>();
  const cutoff = new Date(Date.now() - 90_000);
  const groups = new Map<string, { owner: (typeof stories)[number]['owner']; stories: typeof stories }>();
  for (const story of visibleStories) {
    const group = groups.get(story.owner.id) || { owner: story.owner, stories: [] };
    group.stories.push(story);
    groups.set(story.owner.id, group);
  }
  return ok({ stories: [...groups.values()].map(group => ({ userId: group.owner.id, name: group.owner.displayName, avatar: group.owner.photos[0]?.url || group.owner.profile?.avatarUrl || null, online: Boolean(group.owner.profile?.online && group.owner.profile.lastSeenAt && group.owner.profile.lastSeenAt > cutoff && (group.owner.profile.accountSettings as Record<string, unknown> | null)?.showOnline !== false), items: group.stories.map(({ id, mediaUrl, mediaType, caption, createdAt, expiresAt }) => ({ id, mediaUrl, mediaType, caption, createdAt, expiresAt, viewed: viewedIds.has(id) })) })) });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return fail('Sign in to share a story.', 401);
  if (user.status !== 'ACTIVE') return fail('An active account is required to share a story.', 403);
  if (!user.isGuest && (!user.dateOfBirth || !isAdult(user.dateOfBirth))) return fail('Stories are available to adults 18 and older.', 403);
  const length = Number(req.headers.get('content-length') || 0);
  if (length > 16_000_000) return fail('Video stories must be 15 MB or smaller.');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const caption = typeof form?.get('caption') === 'string' ? (form.get('caption') as string).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 180) : '';
  if (!(file instanceof File)) return fail('Choose a photo or short video.');
  const type = mediaTypes[file.type];
  if (!type || !file.size || file.size > type.max) return fail('Use JPG, PNG, WebP, MP4 or WebM media within the size limit.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const valid = type.ext === 'jpg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : type.ext === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
      : type.ext === 'webp' ? bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP'
        : type.ext === 'mp4' ? bytes.subarray(4,8).toString() === 'ftyp' : bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  if (!valid) return fail('The uploaded file does not match its media type.');
  const id = randomUUID();
  const filename = `${id}.${type.ext}`;
  const url = `/api/stories/media/${id}`;
  const directory = path.join(process.cwd(), 'private_uploads', 'stories');
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), bytes, { flag: 'wx' });
  } catch (error) {
    console.error('[stories:storage]', error);
    return fail('Story media could not be stored. Check that uploads are writable and try again.', 500);
  }
  try {
    const story = await prisma.userStory.create({ data: { id, ownerId: user.id, mediaUrl: url, mediaType: type.kind, mimeType: file.type, caption, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    return ok({ story }, 201);
  } catch (error) {
    await unlink(path.join(directory, filename)).catch(() => undefined);
    console.error('[stories:create]', error);
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (code === 'P2022' || code === 'P2021') return fail('Story storage is out of date. Apply the latest database migrations, then retry.', 503);
    return fail('Story media was uploaded but could not be saved. Check database connectivity and retry.', 500);
  }
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return fail('Sign in to remove a story.', 401);
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('Choose a story.');
  const story = await prisma.userStory.findUnique({ where: { id } });
  if (!story || (story.ownerId !== user.id && user.role !== 'ADMIN')) return fail('Story not found.', 404);
  await prisma.userStory.delete({ where: { id } });
  if (story.mediaUrl.startsWith('/api/stories/media/')) {
    const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' };
    const extension = extensions[story.mimeType];
    if (extension) await unlink(path.join(process.cwd(), 'private_uploads', 'stories', `${story.id}.${extension}`)).catch(() => undefined);
  } else await unlink(path.join(process.cwd(), 'public', story.mediaUrl.replace(/^\//, ''))).catch(() => undefined);
  return ok({ deleted: true });
}
