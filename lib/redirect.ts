export function safeInternalPath(value: unknown, fallback = '/dashboard') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  try {
    const parsed = new URL(value, 'https://velora.invalid');
    if (parsed.origin !== 'https://velora.invalid') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/** Only an explicit Discover action may override the normal Random Call destination. */
export function postAuthDestination(value: unknown): '/discover' | '/dashboard' {
  return value === 'discover' || value === '/discover' ? '/discover' : '/dashboard';
}

export function adminPostAuthDestination(value: unknown) {
  const fallback = '/admin/dashboard';
  const destination = safeInternalPath(value, fallback);
  const path = new URL(destination, 'https://velora.invalid').pathname;
  if (!path.startsWith('/admin/') || /^\/admin\/(login|logout|invitation)(\/|$)/.test(path)) return fallback;
  return destination;
}

/** Resume member actions without redirecting onto authentication or API routes. */
export function memberDestination(value: unknown, fallback = '/discover') {
  if (value === 'discover' || value === 'dashboard') return `/${value}`;
  const path = safeInternalPath(value, fallback);
  const pathname = path.split(/[?#]/, 1)[0];
  return /^\/(?:discover|dashboard|messages|history|profile|wallet)(?:\/|$)/.test(pathname) ? path : fallback;
}
