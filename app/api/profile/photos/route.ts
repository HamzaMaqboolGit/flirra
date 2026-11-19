import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { invalidatePublicStats } from '@/lib/public-stats';
import { notifyPublicPresence } from '@/lib/calls';

const MAX_PHOTOS = 6;
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function POST(req: Request) {
  const { user, error } = await guard();
  if (!user) return error;
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return fail('Choose an image');
  const ext = extensions[file.type];
  if (!ext) return fail('Use a JPG, PNG, or WebP image');
  if (file.size > 4_000_000) return fail('Image must be under 4 MB');
  const bytes = Buffer.from(await file.arrayBuffer());
  const valid = file.type === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
      : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
  if (!valid) return fail('The uploaded file does not match its image type');
  const count = await prisma.userPhoto.count({ where: { userId: user.id } });
  if (count >= MAX_PHOTOS) return fail(`You can add up to ${MAX_PHOTOS} photos`);
  const filename = `${user.id}-${randomUUID()}.${ext}`;
  const dir = path.join(process.cwd(), 'public', 'uploads');
  await mkdir(dir, { recursive: true });
  const diskPath = path.join(dir, filename);
  try { await writeFile(diskPath, bytes, { flag: 'wx' }); }
  catch (cause) { console.error('[profile-photo:storage]', cause); return fail('Photo storage is unavailable. Please try again.', 500); }
  const url = `/uploads/${filename}`;
  const isPrimary = form.get('primary') === 'true' || !user.profile?.avatarUrl;
  try {
  const photo = await prisma.$transaction(async tx => {
    const created = await tx.userPhoto.create({ data: { userId: user.id, url, position: count }, select: { id: true, url: true, position: true } });
    if (isPrimary) await tx.userProfile.update({ where: { userId: user.id }, data: { avatarUrl: url } });
    return created;
  });
  invalidatePublicStats(); notifyPublicPresence();
  return ok({ photo, avatarUrl: isPrimary ? url : user.profile?.avatarUrl });
  } catch (cause) {
    await unlink(diskPath).catch(() => undefined);
    console.error('[profile-photo:save]', cause);
    return fail('Photo could not be added to your profile. Please try again.', 500);
  }
}

export async function PATCH(req: Request) {
  const { user, error } = await guard();
  if (!user) return error;
  const body = await req.json().catch(() => null) as { photoIds?: unknown; primaryId?: unknown } | null;
  if (!Array.isArray(body?.photoIds) || body.photoIds.length > MAX_PHOTOS || !body.photoIds.every(id => typeof id === 'string') || typeof body.primaryId !== 'string') return fail('Invalid photo order');
  const photoIds = body.photoIds as string[];
  const primaryId = body.primaryId;
  const photos = await prisma.userPhoto.findMany({ where: { userId: user.id, id: { in: [...photoIds, primaryId] } }, select: { id: true, url: true } });
  const byId = new Map(photos.map(photo => [photo.id, photo]));
  if (photos.length !== new Set([...photoIds, primaryId]).size || !photoIds.includes(primaryId)) return fail('One or more photos are unavailable');
  await prisma.$transaction(async tx => {
    for (const [position, id] of photoIds.entries()) await tx.userPhoto.update({ where: { id }, data: { position } });
    await tx.userProfile.update({ where: { userId: user.id }, data: { avatarUrl: byId.get(primaryId)!.url } });
  });
  invalidatePublicStats(); notifyPublicPresence();
  return ok({ photos: photoIds.map((id, position) => ({ ...byId.get(id)!, position })), avatarUrl: byId.get(primaryId)!.url });
}

export async function DELETE(req: Request) {
  const { user, error } = await guard();
  if (!user) return error;
  const body = await req.json().catch(() => null) as { photoId?: unknown } | null;
  if (typeof body?.photoId !== 'string') return fail('Choose a photo to remove');
  const photos = await prisma.userPhoto.findMany({ where: { userId: user.id }, orderBy: { position: 'asc' }, select: { id: true, url: true, position: true } });
  const removed = photos.find(photo => photo.id === body.photoId);
  if (!removed) return fail('Photo not found', 404);
  const remaining = photos.filter(photo => photo.id !== removed.id);
  const nextPrimary = remaining[0]?.url || null;
  await prisma.$transaction(async tx => {
    await tx.userPhoto.delete({ where: { id: removed.id } });
    for (const [position, photo] of remaining.entries()) await tx.userPhoto.update({ where: { id: photo.id }, data: { position } });
    const profile = await tx.userProfile.findUnique({ where: { userId: user.id }, select: { avatarUrl: true } });
    if (profile?.avatarUrl === removed.url) await tx.userProfile.update({ where: { userId: user.id }, data: { avatarUrl: nextPrimary } });
  });
  invalidatePublicStats(); notifyPublicPresence();
  return ok({ photos: remaining.map((photo, position) => ({ ...photo, position })), avatarUrl: nextPrimary });
}
