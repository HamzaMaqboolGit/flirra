import { prisma } from '@/lib/db';
import { ok } from '@/lib/http';
import { cmsPageCatalog, cmsContent, defaultCmsContent } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!cmsPageCatalog.some(([key]) => key === slug)) return ok({ content: null });
  try {
    const page = await prisma.cmsPage.findUnique({ where: { slug }, select: { publishedContent: true } });
    return ok({ content: slug === 'homepage' ? cmsContent(page?.publishedContent || defaultCmsContent) : page?.publishedContent || null });
  } catch (cause) {
    console.error('[public-cms]', cause);
    return ok({ content: defaultCmsContent });
  }
}
