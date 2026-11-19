import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';

function containsUrl(value: unknown, url: string): boolean {
  if (value === url) return true;
  if (Array.isArray(value)) return value.some(entry => containsUrl(entry, url));
  if (value && typeof value === 'object') return Object.values(value).some(entry => containsUrl(entry, url));
  return false;
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'settings' });
  if (!user) return error;
  const { id } = await params;
  const media = await prisma.cmsMedia.findUnique({ where: { id } });
  if (!media) return fail('Media not found.', 404);
  const pages = await prisma.cmsPage.findMany({ select: { draftContent: true, publishedContent: true } });
  if (pages.some(page => containsUrl(page.draftContent, media.url) || containsUrl(page.publishedContent, media.url))) return fail('This image is in use. Replace it in the page editor before deleting it.', 409);
  try {
    await prisma.cmsMedia.delete({ where: { id } });
    const filePath = path.join(process.cwd(), 'public', media.url.replace(/^\//, ''));
    await unlink(filePath).catch(() => undefined);
    await prisma.adminAuditLog.create({ data: { adminId: user.id, action: 'CMS_MEDIA_DELETED', targetId: id, metadata: { filename: media.filename } } });
    return ok({ deleted: true });
  } catch (cause) {
    console.error('[admin-cms:media-delete]', cause);
    return fail('Could not delete this image.', 500);
  }
}
