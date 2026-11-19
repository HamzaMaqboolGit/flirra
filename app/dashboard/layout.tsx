import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';

export default async function DashboardAuthLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  return children;
}
