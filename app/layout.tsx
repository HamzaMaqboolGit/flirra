import Script from 'next/script';
import HydrationCompatibility from './hydration-compatibility';
import { extensionAttributeCleanup } from '@/lib/hydration-compatibility';
import type { Metadata } from 'next';
import './globals.css';
import './design-system.css';
import './light-theme.css';
import './landing/landing.css';
import './dashboard/dashboard.css';
import ThemeProvider from './theme-provider';
import ToastProvider from './toast-provider';
import DialogProvider from './ui/dialog-provider';
import { AppMotionProvider, RouteMotion } from './ui/motion-system';
import { getSettings } from '@/lib/settings';
import GuestMilestoneProvider from './guest-milestone-provider';

export async function generateMetadata(): Promise<Metadata> {
  let siteName = 'Velora';
  try { siteName = (await getSettings()).siteName || siteName; } catch { /* Use the app defaults if settings are unavailable. */ }
  return { title: { default: `${siteName} — Meet beyond the swipe`, template: `%s · ${siteName}` }, description: `Real people. Real chemistry. Live on ${siteName}.`, icons: { icon: '/velora.svg' } };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body suppressHydrationWarning><Script id="flirra-extension-hydration" strategy="beforeInteractive" dangerouslySetInnerHTML={{__html:extensionAttributeCleanup}}/><HydrationCompatibility/><ThemeProvider><GuestMilestoneProvider><AppMotionProvider><ToastProvider><DialogProvider><RouteMotion>{children}</RouteMotion></DialogProvider></ToastProvider></AppMotionProvider></GuestMilestoneProvider></ThemeProvider></body></html>;
}
