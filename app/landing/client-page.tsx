'use client';

import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { ArrowRight, ShieldCheck, Globe2, Users, Video, Zap } from 'lucide-react';
import CountrySelect from '../country-select';
import { countryCode, isCountry } from '@/lib/countries';
import { readApiJson } from '@/lib/client-api';
import { CoinPackage, CoinShowcase, Discovery, LandingNav, LandingPerson, LiveMetrics, SafetyAndFooter } from './sections';
import type { CmsContent } from '@/lib/cms';
import { PENDING_PURCHASE_KEY } from '@/lib/purchase-intent';

const FALLBACK_PACKAGES: CoinPackage[] = [
  { id: 'fallback-spark', name: 'Spark', coins: 100, priceCents: 499, currency: 'USD', imageUrl: '/velora-landing/coins/clean/spark.webp', cardColor: 'spark' },
  { id: 'fallback-glow', name: 'Glow', coins: 350, priceCents: 1499, currency: 'USD', imageUrl: '/velora-landing/coins/clean/glow.webp', cardColor: 'glow' },
  { id: 'fallback-aura', name: 'Aura', coins: 800, priceCents: 2999, currency: 'USD', imageUrl: '/velora-landing/coins/clean/aura.webp', cardColor: 'aura', popular: true },
  { id: 'fallback-noir', name: 'Noir', coins: 1800, priceCents: 5999, currency: 'USD', imageUrl: '/velora-landing/coins/clean/noir.webp', cardColor: 'noir' },
];

type PublicData = {
  packages: CoinPackage[];
  metrics: { totalMembers: number; totalVideoCalls: number; countriesReached: number; totalConnections: number };
  onlineNow: number;
  featuredPeople: LandingPerson[];
  coinsPerMinute: number | null;
  paymentsEnabled: boolean;
};

export default function LandingPage({ cmsContent, siteName = 'Velora', logoUrl = '' }: { cmsContent: CmsContent; siteName?: string; logoUrl?: string }) {
  const [brand, setBrand] = useState({ siteName, logoUrl });
  const [country, setCountry] = useState('Worldwide');
  const [filterCountry, setFilterCountry] = useState('Worldwide');
  const [genderTarget, setGenderTarget] = useState<'MALE' | 'FEMALE' | 'EVERYONE'>('EVERYONE');
  const [publicData, setPublicData] = useState<PublicData | null>(null);
  const [coinPackages, setCoinPackages] = useState<CoinPackage[] | null>(null);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [onlineNow, setOnlineNow] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [coinMessage, setCoinMessage] = useState('');
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [heroSlide, setHeroSlide] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroTouchStart, setHeroTouchStart] = useState<number | null>(null);
  const heroSlides = [
    { src: '/velora-landing/hero/clean/portrait-emma.webp', alt: 'Emma on a live video date' },
    { src: '/velora-landing/hero/clean/portrait-noah.webp', alt: 'Noah on a live video date' },
    { src: '/velora-landing/hero/clean/portrait-sophia.webp', alt: 'Sophia on a live video date' },
  ];

  useEffect(() => {
    if (heroPaused) return;
    const timer = window.setInterval(() => setHeroSlide(current => (current + 1) % heroSlides.length), 5200);
    return () => window.clearInterval(timer);
  }, [heroPaused, heroSlides.length]);

  useEffect(() => {
    const syncVisibility = () => document.documentElement.classList.toggle('is-document-hidden', document.visibilityState !== 'visible');
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => { document.removeEventListener('visibilitychange', syncVisibility); document.documentElement.classList.remove('is-document-hidden'); };
  }, []);

  useEffect(() => {
    let alive = true;
    const loadPackages = async () => {
      try {
        const response = await fetch('/api/coin-packages', { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
        const data = await readApiJson(response, 'Coin packages are temporarily unavailable.') as { packages?: CoinPackage[] };
        if (!response.ok || !Array.isArray(data.packages)) throw new Error('Coin packages are temporarily unavailable.');
        if (alive) setCoinPackages(data.packages);
      } catch {
        // Public page metrics may still supply the same catalog if this request fails.
      } finally {
        if (alive) setPackagesLoading(false);
      }
    };
    void loadPackages();
    const interval = window.setInterval(loadPackages, 30_000);
    return () => { alive = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    setBrand({ siteName, logoUrl });
    const update = (event: Event) => {
      const next = (event as CustomEvent<{ siteName?: string; logoUrl?: string }>).detail;
      if (next?.siteName) setBrand({ siteName: next.siteName, logoUrl: next.logoUrl || '' });
    };
    document.addEventListener('velora-platform-settings-change', update);
    return () => document.removeEventListener('velora-platform-settings-change', update);
  }, [siteName, logoUrl]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/public', { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error('Public information is unavailable.');
        const data = await readApiJson(response, 'Public information is unavailable.') as PublicData;
        if (alive) { setPublicData(data); setOnlineNow(data.onlineNow); }
      } catch {
        if (alive) setPublicData(null);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(load, 30_000);
    return () => { alive = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const socket = io('/public', { transports: ['websocket', 'polling'], reconnection: true, reconnectionDelayMax: 10_000 });
    socket.on('presence:members-online', (data: { count?: number }) => {
      if (typeof data.count !== 'number' || !Number.isFinite(data.count)) return;
      setOnlineNow(data.count!);
    });
    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedCountry = params.get('country');
    if (requestedCountry && isCountry(requestedCountry)) setCountry(countryCode(requestedCountry));
  }, []);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.vl-reveal'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      sections.forEach(section => section.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.12 });
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const startChat = useCallback(async () => {
    setError('');
    setActionMessage('');
    setBusy(true);
    if (country !== 'Worldwide' && !isCountry(country)) {
      setError('Choose a country from the list or select Worldwide.');
      setBusy(false);
      return;
    }
    const destination = `/dashboard?country=${encodeURIComponent(country)}&gender=${genderTarget}`;
    try {
      const response=await fetch('/api/auth/me',{signal:AbortSignal.timeout(10_000)});
      if(response.ok){const {user}=await readApiJson(response,'Could not check your session.') as {user?:{role?:string;isGuest?:boolean}};if(user?.role==='ADMIN'){window.location.assign('/discover');return}if(user?.role==='MALE'||user?.role==='FEMALE'){window.location.assign(destination);return}window.location.assign(`/onboarding?${new URLSearchParams({country,gender:genderTarget})}`);return}
      if(response.status!==401){const result=await readApiJson(response,'Could not check your session.');throw new Error(typeof result.error==='string'?result.error:'Could not check your session.')}
      window.location.assign(`/onboarding?${new URLSearchParams({country,gender:genderTarget})}`);
    } catch (reason) {
      setError(reason instanceof DOMException && reason.name === 'TimeoutError' ? 'Checking your account took too long. Please try again.' : reason instanceof Error ? reason.message : 'Could not check your account.');
      setBusy(false);
    }
    setBusy(false);
  }, [country, genderTarget]);

  const handleHeroAction = useCallback(() => {
    if (cmsContent.hero.ctaHref === '#match') {
      document.getElementById('match')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    void startChat();
  }, [cmsContent.hero.ctaHref, startChat]);

  async function connect(person: LandingPerson) {
    setActionMessage('');
    if (person.demo) {
      setActionMessage('Sample profiles are for browsing only and cannot receive real video calls.');
      return;
    }
    try {
      const session = await fetch('/api/auth/me');
      const profilePath = `/discover/${encodeURIComponent(person.id)}`;
      if (!session.ok) {
        window.location.href = `/onboarding?mode=login&next=${encodeURIComponent(profilePath)}`;
        return;
      }
      const { user } = await readApiJson(session, 'Could not check your session.') as { user?: { role?: string; isGuest?: boolean; accountType?: string } };

      if (user?.role === 'ADMIN' || (user?.role !== 'MALE' && user?.role !== 'FEMALE')) {
        window.location.assign(user?.role === 'ADMIN' ? '/discover' : `/onboarding?mode=login&next=${encodeURIComponent(profilePath)}`);
        return;
      }
      const response = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'direct', recipientId: person.id, country: filterCountry, gender: person.role }),
      });
      const data = await readApiJson(response, 'This member is no longer available.');
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'This member is no longer available.');
      window.location.href = '/dashboard';
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : 'Unable to connect to this member.');
    }
  }

  async function message(person: LandingPerson) {
    setActionMessage('');
    try {
      const response = await fetch('/api/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({userId: person.id}) });
      if (response.status === 401) { location.assign('/onboarding?mode=login&next=' + encodeURIComponent('/discover/' + person.id)); return; }
      const result = await readApiJson(response, 'This conversation is unavailable.');
      if (!response.ok) throw new Error(result.error || 'This conversation is unavailable.');
      location.assign('/messages?conversation=' + encodeURIComponent(result.conversationId));
    } catch (error) { setActionMessage(error instanceof Error ? error.message : 'Unable to open messages.'); }
  }

  async function buyCoins(packageId: string) {
    if (packageId.startsWith('fallback-')) { setCoinMessage('Purchases temporarily unavailable until the package catalog is connected.'); return; }
    setBuyingId(packageId);
    setCoinMessage('');
    try {
      localStorage.setItem(PENDING_PURCHASE_KEY, JSON.stringify({packageId, createdAt: Date.now()}));
      const session = await fetch('/api/auth/me', {cache:'no-store'});
      if(session.status === 401) { location.assign('/onboarding?mode=login&purchase=' + encodeURIComponent(packageId)); return; }
      if(!session.ok) throw new Error('Could not check your account. Please try again.');
      location.assign('/wallet?buyPackage=' + encodeURIComponent(packageId));
    } catch(error) { setCoinMessage(error instanceof Error ? error.message : 'Checkout is currently unavailable.'); }
    finally { setBuyingId(null); }
  }

  return (
    <main className="velora-landing" id="top">
      <LandingNav onStartChat={() => void startChat()} siteName={brand.siteName} logoUrl={brand.logoUrl} items={cmsContent.navigation} />
      <section className="vl-hero" id="hero">
        <div className="vl-hero-copy">
          <div className="vl-live-label"><Video size={14} /> {cmsContent.hero.badge} <span>✧</span></div>
          <h1>{cmsContent.hero.heading.split('\n').map((line, index) => <span key={index}>{index > 0 && <br/>}{line}</span>)}<br/><em>{cmsContent.hero.highlight}</em></h1>
          <div className="vl-live-summary" role="status"><i/><Users size={16}/><b>{loading ? '—' : (onlineNow ?? 0).toLocaleString()}</b><span>People online now</span></div>
          <p className="vl-hero-description">{cmsContent.hero.description}</p>
          <div className="vl-match-form" id="match">
            <div className="vl-filter-row">
            <div className="vl-gender-select" role="group" aria-label="Matching preference">
              {([{ value: 'MALE', icon: '♂', label: 'Men' }, { value: 'FEMALE', icon: '♀', label: 'Women' }, { value: 'EVERYONE', icon: '✧', label: 'Everyone' }] as const).map(option => <button key={option.value} type="button" className={genderTarget === option.value ? 'is-selected' : ''} aria-pressed={genderTarget === option.value} onClick={() => { setGenderTarget(option.value); setError(''); }}><span aria-hidden="true">{option.icon}</span><span>{option.label}</span></button>)}
            </div>
            <label className="vl-country-select"><Globe2 size={17} /><CountrySelect id="landing-country" value={country} onChange={setCountry} placeholder="Search countries" worldwide /></label>
            </div>
            <button className="vl-start-button" onClick={handleHeroAction} disabled={busy}><Video size={18} />{busy ? 'Checking your account…' : cmsContent.hero.ctaText}<ArrowRight size={17} /></button>
            {error && <p className="vl-form-message" role="alert">{error}</p>}
            <div className="vl-trust-row"><span><Zap size={16} /> Free to join</span><span><ShieldCheck size={16} /> Safe &amp; private</span><span><Users size={16} /> Real people only</span></div>
          </div>
        </div>
        <div className="vl-hero-image" aria-label="Live video dating profile previews" onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)} onFocusCapture={() => setHeroPaused(true)} onBlurCapture={() => setHeroPaused(false)} onTouchStart={event => setHeroTouchStart(event.touches[0]?.clientX ?? null)} onTouchEnd={event => { if (heroTouchStart == null) return; const delta = (event.changedTouches[0]?.clientX ?? heroTouchStart) - heroTouchStart; if (Math.abs(delta) > 40) setHeroSlide(current => (current + (delta < 0 ? 1 : heroSlides.length - 1)) % heroSlides.length); setHeroTouchStart(null); }}>
          <div className="vl-hero-carousel-track">
            {heroSlides.map((slide, index) => { const offset = (index - heroSlide + heroSlides.length) % heroSlides.length; return <img key={slide.src} className={`vl-hero-slide vl-hero-slide-${offset}`} src={slide.src} alt={slide.alt} fetchPriority={index === 0 ? 'high' : 'auto'} />; })}
          </div>
          {heroSlides.map((slide, index) => { const offset = (index - heroSlide + heroSlides.length) % heroSlides.length; const profile = [['Emma, 24', '🇺🇸 United States'], ['Noah, 27', '🇬🇧 United Kingdom'], ['Sophia, 26', '🇨🇦 Canada']][index]; return <div key={`${slide.src}-meta`} className={`vl-hero-card-meta vl-hero-card-meta-${offset}`}><b>{profile[0]} {index === 0 && <span aria-hidden="true">✦</span>}</b><small>{profile[1]}</small><i>Preview</i><button type="button" disabled aria-label={`${profile[0]} preview video call unavailable`}><Video size={16}/></button></div>; })}
          <div className="vl-hero-carousel-controls">
            <button type="button" onClick={() => setHeroSlide(current => (current + heroSlides.length - 1) % heroSlides.length)} aria-label="Previous profile">‹</button>
            <div>{heroSlides.map((slide, index) => <button key={slide.src} type="button" className={index === heroSlide ? 'is-active' : ''} onClick={() => setHeroSlide(index)} aria-label={`Show profile ${index + 1}`} />)}</div>
            <button type="button" onClick={() => setHeroSlide(current => (current + 1) % heroSlides.length)} aria-label="Next profile">›</button>
          </div>
        </div>
      </section>

      <LiveMetrics metrics={publicData?.metrics ?? null} loading={loading} />

      {cmsContent.sections.discover.visible&&<Discovery people={publicData?.featuredPeople || []} country={filterCountry} setCountry={setFilterCountry} onlineCount={onlineNow} loading={loading} unavailable={!loading && !publicData} onConnect={person => void connect(person)} onMessage={person => void message(person)} content={cmsContent.sections.discover} />}
      {actionMessage && <p className="vl-action-message" role="status">{actionMessage}</p>}

      {cmsContent.sections.coins.visible&&<CoinShowcase packages={coinPackages?.length ? coinPackages : publicData?.packages?.length ? publicData.packages : FALLBACK_PACKAGES} fallback={!coinPackages?.length && !publicData?.packages?.length} loading={packagesLoading} enabled={Boolean(publicData?.paymentsEnabled)} coinsPerMinute={publicData?.coinsPerMinute ?? null} onBuy={id => void buyCoins(id)} buyingId={buyingId} content={cmsContent.sections.coins} />}
      {coinMessage && <p className="vl-action-message" role="alert">{coinMessage}</p>}
      <SafetyAndFooter content={cmsContent} siteName={brand.siteName} logoUrl={brand.logoUrl} />
    </main>
  );
}
