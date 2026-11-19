import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';

export default async function WalletAuthLayout({ children }: { children: React.ReactNode }) {
  if (!await currentUser()) redirect('/login');
  return children;
}
