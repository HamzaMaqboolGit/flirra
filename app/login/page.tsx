import { redirect } from 'next/navigation';
import { memberDestination } from '@/lib/redirect';

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}) {
  const {next}=await searchParams;
  const query=new URLSearchParams({mode:'login'});
  if (next) query.set('next', memberDestination(next));
  redirect(`/onboarding?${query.toString()}`);
}
