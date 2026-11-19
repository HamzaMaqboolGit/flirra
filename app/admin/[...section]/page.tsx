import AdminSection from '../admin-section';
import { currentAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
const allowed=new Set(['staff-management','staff-management/add','staff-management/roles','staff-management/logs','dashboard','support-center','users','creators','matching','calls','coin-packages','gifts','payments','payouts','moderation','story-moderation','analytics','settings/general','settings/appearance','settings/economy','settings/payments','settings/authentication','settings/sounds','wallets','transactions','audit-logs','models','video-sessions','reports','website-management/pages','website-management/media','website-management/navigation','website-management/seo']);
export default async function AdminRoute({ params, searchParams }: {
  params: Promise<{ section: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  const key = section.join('/');
  if (!(await currentAdmin())) {
    const query = new URLSearchParams();
    for (const [name, values] of Object.entries(await searchParams)) {
      for (const value of Array.isArray(values) ? values : values === undefined ? [] : [values]) {
        query.append(name, value);
      }
    }
    const path = '/admin/' + section.map(encodeURIComponent).join('/') + (query.size ? '?' + query.toString() : '');
    redirect('/admin/login?next=' + encodeURIComponent(path));
  }
  if (section[0] === 'users' && section.length === 2) return <AdminSection section={key}/>;
  if (!allowed.has(key)) return <AdminSection section="not-found"/>;
  return <AdminSection section={key}/>;
}
