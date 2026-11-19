import { getSettings } from '@/lib/settings';
import { ok } from '@/lib/http';

export const dynamic = 'force-dynamic';
export async function GET() {
  const settings = await getSettings();
  return ok({ siteName: settings.siteName, logoUrl: settings.logoUrl, supportEmail: settings.supportEmail });
}
