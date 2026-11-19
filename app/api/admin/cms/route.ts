import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { fail, ok } from '@/lib/http';
import { cmsPageCatalog, defaultCmsContent, validCmsContent } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'settings' });
  if (!user) return error;
  try {
    await Promise.all(cmsPageCatalog.map(([slug, title]) => prisma.cmsPage.upsert({
      where: { slug }, create: { slug, title, draftContent: defaultCmsContent as unknown as Prisma.InputJsonValue }, update: {},
    })));
    const [pages, media] = await Promise.all([
      prisma.cmsPage.findMany({ orderBy: { slug: 'asc' }, include: { revisions: { take: 8, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, content: true, author: { select: { displayName: true } } } } } }),
      prisma.cmsMedia.findMany({ orderBy: { createdAt: 'desc' } }),
    ]);
    return ok({ pages, media });
  } catch (cause) {
    console.error('[admin-cms:get]', cause);
    return fail('Website CMS is unavailable. Apply the pending database migration and try again.', 503);
  }
}

export async function PUT(req: Request) {
  const { user, error } = await guard(['ADMIN'], { allowSuspended: true, permission: 'settings' });
  if (!user) return error;
  const body = await req.json().catch(() => null) as { slug?: unknown; content?: unknown; action?: unknown } | null;
  if (!body || typeof body.slug !== 'string' || !cmsPageCatalog.some(([slug]) => slug === body.slug)) return fail('Choose a supported public page.');
  if (!validCmsContent(body.content)) return fail('Check the page content, section visibility, image URL, and safe CTA destination.');
  const slug = body.slug;
  const content = body.content as Prisma.InputJsonValue;
  const publish = body.action === 'publish';
  if (body.action !== 'draft' && !publish) return fail('Choose save draft or publish.');
  const title = cmsPageCatalog.find(([key]) => key === slug)![1];
  try {
    const page = await prisma.$transaction(async tx => {
      const saved = await tx.cmsPage.upsert({
        where: { slug },
        create: { slug, title, draftContent: content, ...(publish ? { publishedContent: content, publishedAt: new Date() } : {}) },
        update: { title, draftContent: content, ...(publish ? { publishedContent: content, publishedAt: new Date() } : {}) },
      });
      if (publish) await tx.cmsRevision.create({ data: { pageId: saved.id, authorId: user.id, content } });
      await tx.adminAuditLog.create({ data: { adminId: user.id, action: publish ? 'CMS_PAGE_PUBLISHED' : 'CMS_DRAFT_SAVED', targetId: saved.id, metadata: { slug } } });
      return saved;
    });
    return ok({ page });
  } catch (cause) {
    console.error('[admin-cms:save]', cause);
    return fail('Could not save this page. Try again.', 500);
  }
}
