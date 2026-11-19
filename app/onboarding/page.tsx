import OnboardingFlow from './onboarding-flow';
import { Suspense } from 'react';

export default function OnboardingPage() {
  return <Suspense fallback={<main className="onboarding-page"><p>Preparing your Velora experience…</p></main>}><OnboardingFlow /></Suspense>;
}
