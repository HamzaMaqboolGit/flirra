import { redirect } from 'next/navigation';
export default function RegisterPage() {
  const query=new URLSearchParams({mode:'register',next:'discover'});
  redirect(`/onboarding?${query.toString()}`);
}
