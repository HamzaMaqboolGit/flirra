import LandingPage from './landing/client-page';
import { prisma } from '@/lib/db';
import { cmsContent, defaultCmsContent } from '@/lib/cms';
import type { Metadata } from 'next';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  let siteName = 'Velora';
  try { siteName = (await getSettings()).siteName || siteName; } catch { /* Use safe defaults while settings are unavailable. */ }
  try {
    const page = await prisma.cmsPage.findUnique({ where: { slug: 'homepage' }, select: { publishedContent: true } });
    const content = cmsContent(page?.publishedContent || defaultCmsContent);
    return { title: content.seo.title.replace(/Velora/gi, siteName), description: content.seo.description };
  } catch {
    return { title: defaultCmsContent.seo.title, description: defaultCmsContent.seo.description };
  }
}

export default async function Home() {
  let content = defaultCmsContent;
  let brand = { siteName: 'Velora', logoUrl: '' };
  try { const settings = await getSettings(); brand = { siteName: settings.siteName || brand.siteName, logoUrl: settings.logoUrl || '' }; } catch { /* Keep the public homepage renderable without platform settings. */ }
  try {
    const page = await prisma.cmsPage.findUnique({ where: { slug: 'homepage' }, select: { publishedContent: true } });
    if (page?.publishedContent) content = cmsContent(page.publishedContent);
  } catch {
    // Keep the public homepage available with built-in fallback content.
  }
  return <LandingPage cmsContent={content} {...brand} />;
}
