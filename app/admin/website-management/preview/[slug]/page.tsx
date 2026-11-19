import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { guard } from '@/lib/guard';
import { cmsContent, defaultCmsContent } from '@/lib/cms';
import { getSettings } from '@/lib/settings';
import LandingPage from '@/app/landing/client-page';

export const dynamic = 'force-dynamic';

export default async function CmsDraftPreview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user } = await guard(['ADMIN'], { allowSuspended: true });
  if (!user) redirect('/admin/login');
  const page = await prisma.cmsPage.findUnique({ where: { slug }, select: { draftContent: true } }).catch(() => null);
  if (!page) notFound();
  const settings = await getSettings().catch(() => null);
  return <><div className="cms-draft-preview-banner">ADMIN DRAFT PREVIEW · This content is not published</div><LandingPage cmsContent={cmsContent(page.draftContent || defaultCmsContent)} siteName={settings?.siteName || 'Flirra'} logoUrl={settings?.logoUrl || ''}/></>;
}
