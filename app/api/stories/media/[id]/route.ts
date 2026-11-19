import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

const privateDirectory = path.join(process.cwd(), 'private_uploads', 'stories');

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const story = await prisma.userStory.findUnique({ where: { id }, select: { id: true, ownerId: true, mediaType: true, mimeType: true, expiresAt: true, visibility: true, owner: { select: { id: true, status: true, emailVerifiedAt: true, isGuest: true, guestExpiresAt: true, accountType: true, creatorStatus: true, dateOfBirth: true, profile: { select: { discoverable: true, accountSettings: true } } } } } });
  if (!story || story.expiresAt <= new Date()) return new Response(null, { status: 404 });

  const viewer = await currentUser();
  const isOwner = viewer?.id === story.ownerId;
  if (!isOwner) {
    const ownerEligible = story.owner.status === 'ACTIVE' && story.owner.profile?.discoverable && (story.owner.isGuest ? !story.owner.guestExpiresAt || story.owner.guestExpiresAt > new Date() : ((story.owner.accountType === 'USER' || (story.owner.accountType === 'CREATOR' && story.owner.creatorStatus === 'APPROVED')) && Boolean(story.owner.dateOfBirth && story.owner.dateOfBirth <= new Date(Date.now() - 18 * 365.2425 * 24 * 60 * 60 * 1000))));
    if (!ownerEligible || story.visibility === 'PRIVATE') return new Response(null, { status: 404 });
    if (viewer) {
      const blocked = await prisma.blockedUser.findFirst({ where: { OR: [{ blockerId: viewer.id, blockedId: story.ownerId }, { blockerId: story.ownerId, blockedId: viewer.id }] }, select: { blockerId: true } });
      if (blocked) return new Response(null, { status: 404 });
    }
    if (story.visibility === 'FOLLOWERS') {
      if (!viewer) return new Response(null, { status: 404 });
      const follows = await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewer.id, followingId: story.ownerId } }, select: { followerId: true } });
      if (!follows) return new Response(null, { status: 404 });
    }
  }

  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' };
  const extension = extensions[story.mimeType];
  if (!extension) return new Response(null, { status: 404 });
  let bytes: Buffer;
  try { bytes = await readFile(path.join(privateDirectory, `${story.id}.${extension}`)); } catch { return new Response(null, { status: 404 }); }
  const headers = new Headers({ 'Content-Type': story.mimeType, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=60', 'Content-Disposition': 'inline' });
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
    const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2] || 0));
    const end = match[2] && match[1] ? Math.min(bytes.length - 1, Number(match[2])) : bytes.length - 1;
    if (start > end || start >= bytes.length) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
    headers.set('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers });
  }
  headers.set('Content-Length', String(bytes.length));
  return new Response(new Uint8Array(bytes), { headers });
}
