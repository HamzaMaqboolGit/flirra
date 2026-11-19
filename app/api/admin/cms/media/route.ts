import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';

const types: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const LIMIT = 8_000_000;

export async function POST(req: Request) {
  const { user, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'settings' });
  if (!user) return error;
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const altText = String(form?.get('altText') || '').trim().slice(0, 180);
  if (!(file instanceof File)) return fail('Choose an image to upload.');
  const ext = types[file.type];
  if (!ext) return fail('Use a JPG, PNG, WebP, or GIF image.');
  if (!file.size || file.size > LIMIT) return fail('Images must be smaller than 8 MB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const validSignature = ext === 'jpg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : ext === 'png'
      ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : ext === 'gif'
        ? ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))
        : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!validSignature) return fail('The uploaded file does not match its image type.');
  const filename = `${randomUUID()}.${ext}`;
  const dir = path.join(process.cwd(), 'public', 'uploads', 'cms');
  const url = `/uploads/cms/${filename}`;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), bytes, { flag: 'wx' });
    const media = await prisma.cmsMedia.create({ data: { url, filename, mimeType: file.type, sizeBytes: file.size, altText, uploadedById: user.id } });
    await prisma.adminAuditLog.create({ data: { adminId: user.id, action: 'CMS_MEDIA_UPLOADED', targetId: media.id, metadata: { filename, sizeBytes: file.size } } });
    return ok({ media }, 201);
  } catch (cause) {
    console.error('[admin-cms:media-upload]', cause);
    return fail('Could not save this image.', 500);
  }
}
