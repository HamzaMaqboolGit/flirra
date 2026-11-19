'use client';

import { useEffect } from 'react';

// Some browser extensions annotate every div before React attaches to server HTML.
// Remove only the known extension marker, leaving real application differences visible.

export default function HydrationCompatibility() {
  useEffect(() => {
    const page = window as Window & { __flirraHydrationCleanup?: () => void };
    page.__flirraHydrationCleanup?.();
    delete page.__flirraHydrationCleanup;
  }, []);
  return null;
}
