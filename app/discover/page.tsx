import DiscoverClient from './discover-client';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';

export const metadata = { title: 'Discover people · Velora' };

export default async function DiscoverPage() {
  if (!await currentUser()) redirect('/login?next=discover');
  return <DiscoverClient />;
}
