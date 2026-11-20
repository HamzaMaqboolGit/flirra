'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Check, Coins, Globe2, Heart, LockKeyhole, MapPin, Menu, Radio, ShieldCheck, Video, X, Users, UserRound, ChevronDown, LayoutDashboard, LogOut } from 'lucide-react';
import { countryCode, countryFlag, countryName } from '@/lib/countries';
import CountrySelect from '../country-select';
import type { CmsContent } from '@/lib/cms';
import { coinPackageArtwork } from '@/lib/coin-package-artwork';

export type LandingPerson = {
  id: string;
  displayName: string;
  age?: number | null;
  role?: 'MALE' | 'FEMALE';
  country: string;
  flag?: string;
  bio: string;
  interests: string[];
  avatarUrl: string | null;
  online: boolean;
  demo?: boolean;
};
export type CoinPackage = { id: string; name: string; description?: string; coins: number; priceCents: number; currency?: string; bonusCoins?: number; imageUrl?: string; cardColor?: string; popular?: boolean; sortOrder?: number };

const navItems = [['Home', 'hero'], ['Discover', 'discover'], ['How It Works', 'how-it-works'], ['Safety', 'safety'], ['Pricing', 'coins'], ['About', 'footer']] as const;
const defaultNavLinks = navItems.map(([label, id]) => ({ label, href: `#${id}` }));

export function LandingNav({ onStartChat, siteName = 'Velora', logoUrl = '', items = defaultNavLinks }: { onStartChat: () => void; siteName?: string; logoUrl?: string; items?: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('top');
  const [scrolled, setScrolled] = useState(false);
  const [account, setAccount] = useState<{displayName:string;avatarUrl:string|null;role:string}|null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    let scrollFrame = 0;
    const update = () => {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        const nextScrolled = window.scrollY > 60;
        setScrolled(current => current === nextScrolled ? current : nextScrolled);
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id); }), { rootMargin: '-22% 0px -68% 0px' });
    items.forEach(({ href }) => { const id = href.startsWith('#') ? href.slice(1) : ''; const element = id ? document.getElementById(id) : null; if (element) observer?.observe(element); });
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('keydown', escape); observer?.disconnect(); if (scrollFrame) window.cancelAnimationFrame(scrollFrame); };
  }, [items]);

  useEffect(() => { let activeRequest = true; const load = async () => { try { const response = await fetch('/api/auth/me', { cache:'no-store' }); if (!response.ok) { if (activeRequest) setAccount(null); return; } const data = await response.json(); const user = data?.user; if (activeRequest && user?.id) setAccount({ displayName:user.displayName||'Member', avatarUrl:user.profile?.avatarUrl||null, role:user.role||'FEMALE' }); } catch { if (activeRequest) setAccount(null); } }; void load(); const onFocus=()=>void load(); window.addEventListener('focus',onFocus); return()=>{activeRequest=false;window.removeEventListener('focus',onFocus)}; }, []);
  async function signOut(){await fetch('/api/auth/logout',{method:'POST'});setAccount(null);setAccountOpen(false);window.location.assign('/onboarding?mode=login')}
  async function navigateDiscover(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!href.startsWith('#discover')) return;
    event.preventDefault(); setOpen(false);
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      if (response.ok) { window.location.assign('/discover'); return; }
    } catch { /* Continue to sign-in when the session cannot be checked. */ }
    window.location.assign('/login?next=discover');
  }

  return <header className={`vl-nav${scrolled ? ' is-scrolled' : ''}`}>
    <a href="#top" className="vl-brand" aria-label={`${siteName} home`}><span>{logoUrl ? <img src={logoUrl} alt=""/> : <Radio size={19} />}</span>{siteName}</a>
    <nav className={open ? 'is-open' : ''} aria-label="Main navigation">{items.map(({label,href}) => { const id=href.startsWith('#')?href.slice(1):href; return <a key={`${label}-${href}`} href={href.startsWith('#discover')?'/discover':href} className={active === id ? 'is-active' : ''} onClick={event=>{if(label.trim().toLowerCase()==='discover'&&href.startsWith('#'))void navigateDiscover(event,href);else setOpen(false)}}>{label}</a>; })}</nav>
    <div className="vl-nav-actions">{account?<div className="vl-nav-account"><button className="vl-nav-account-trigger" aria-expanded={accountOpen} onClick={()=>setAccountOpen(value=>!value)}>{account.avatarUrl?<img src={account.avatarUrl} alt=""/>:<span>{account.displayName.slice(0,1).toUpperCase()}</span>}<b>{account.displayName}</b><ChevronDown size={14}/></button>{accountOpen&&<div className="vl-nav-account-menu"><a href={account.role==='ADMIN'?'/admin':'/discover'}><LayoutDashboard size={15}/>{account.role==='ADMIN'?'Admin panel':'Dashboard'}</a><button onClick={()=>void signOut()}><LogOut size={15}/>Log out</button></div>}</div>:<><a className="vl-login" href="/onboarding?mode=login">Log in</a><button className="vl-get-started" type="button" onClick={onStartChat}>Get Started Free <ArrowRight size={14} /></button></>}<button className="vl-menu" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? <X size={19} /> : <Menu size={19} />}</button></div>
  </header>;
}

function matchesGender(person: LandingPerson, gender: 'all' | 'women' | 'men') {
  return gender === 'all' || (gender === 'women' && person.role === 'FEMALE') || (gender === 'men' && person.role === 'MALE');
}

export function Discovery({ people, country, setCountry, onlineCount, loading, unavailable = false, onConnect, onMessage, content }: { people: LandingPerson[]; country: string; setCountry: (value: string) => void; onlineCount: number | null; loading: boolean; unavailable?: boolean; onConnect: (person: LandingPerson) => void; onMessage: (person: LandingPerson) => void; content?: CmsContent['sections']['discover'] }) {
  const [gender, setGender] = useState<'all' | 'women' | 'men'>('all');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const filtered = people.filter(person => (country === 'Worldwide' || countryCode(person.country) === countryCode(country)) && matchesGender(person, gender) && (!onlineOnly || person.online));
  useEffect(() => { if (track.current) track.current.scrollTo({ left: 0, behavior: 'smooth' }); }, [country, gender, onlineOnly]);
  const slide = (direction: number) => track.current?.scrollBy({ left: direction * Math.max(track.current.clientWidth * .92, 250), behavior: 'smooth' });

  return <section className="vl-discovery vl-reveal" id="discover">
    <div className="vl-discovery-intro"><div className="vl-section-heading"><span aria-hidden="true">✦</span><h2>{content?.heading||'Meet people who make the moment.'}</h2><p>{content?.description||'Browse public member profiles and find someone you would enjoy talking with.'}</p></div></div>
    <div className="vl-discover-filters" id="discover-cards">
      <div className="vl-filter-tabs" role="group" aria-label="Filter profiles">{(['all', 'women', 'men'] as const).map(value => <button key={value} className={gender === value ? 'active' : ''} aria-pressed={gender === value} onClick={() => setGender(value)}>{value === 'all' ? 'All' : value === 'women' ? 'Women' : 'Men'}</button>)}</div>
      <label className="vl-country-filter"><Globe2 size={16} /><CountrySelect id="landing-discover-country" value={country} onChange={setCountry} worldwide /></label>
      <button className={`vl-online-toggle${onlineOnly ? ' is-active' : ''}`} type="button" aria-pressed={onlineOnly} onClick={() => setOnlineOnly(value => !value)}><i/>{onlineOnly ? 'Online only' : 'All presence'}</button>
      <span className="vl-online-count">{onlineCount === null ? 'Live availability unavailable' : `${onlineCount.toLocaleString()} available now`}</span>
      <div className="vl-discover-arrows"><button aria-label="Previous profiles" onClick={() => slide(-1)} disabled={filtered.length <= 1}><ArrowLeft size={16} /></button><button aria-label="Next profiles" onClick={() => slide(1)} disabled={filtered.length <= 1}><ArrowRight size={16} /></button></div>
    </div>
    {loading ? <div className="vl-discovery-loading" role="status">Loading public profiles…</div> : unavailable ? <div className="vl-discovery-empty" role="status"><span><Radio size={20}/></span><div><b>Profiles are temporarily unavailable</b><p>Please try again shortly.</p></div><a href="/discover">Open Discover</a></div> : filtered.length ? <div className="vl-profile-grid" ref={track} aria-label="Public member profiles">
      {filtered.map(person => <article className={`vl-profile-card${person.demo ? ' is-preview' : ''}`} key={person.id}>
        <div className="vl-profile-photo">{person.avatarUrl ? <img src={person.avatarUrl} alt={`${person.displayName}'s profile`} loading="lazy" /> : <div className="vl-avatar-fallback"><Radio size={27} /></div>}
          <span className={`vl-online-tag${person.online ? '' : ' is-offline'}`}><i />{person.online ? 'Online' : 'Offline'}</span>
          <div className="vl-profile-caption"><strong>{person.displayName}{person.age ? `, ${person.age}` : ''}</strong><span><MapPin size={12} />{person.flag || countryFlag(person.country)} {person.country ? countryName(person.country) : 'Worldwide'}</span></div>
          <div className="vl-profile-actions"><a href={`/discover/${encodeURIComponent(person.id)}`}>View Profile</a><button onClick={() => onMessage(person)}>Message</button><button disabled={!person.online} title={person.online ? `Video call ${person.displayName}` : `${person.displayName} is offline`} onClick={() => onConnect(person)}><Video size={15}/>{person.online ? 'Call' : 'Offline'}</button></div>
        </div>
      </article>)}
    </div> : !people.length ? <div className="vl-discovery-empty"><span><Radio size={20}/></span><div><b>No public profiles to show just yet</b><p>Check back soon or create a profile to join the community.</p></div><a href="/discover">Discover later</a><a className="vl-discovery-create" href="/register">Create profile</a></div> : <div className="vl-discovery-empty"><span><Globe2 size={20}/></span><div><b>No profiles match these filters</b><p>Try another country, presence, or gender filter.</p></div><button onClick={() => { setCountry('Worldwide'); setGender('all'); setOnlineOnly(false); }}>Reset filters</button></div>}
    <a className="vl-explore-link vl-discovery-view-all" href="/discover">{content?.ctaText||'View all profiles'} <ArrowRight size={16} /></a>
  </section>;
}

function compactCount(value: number) {
  if (value < 1000) return String(value);
  const scaled = value >= 1_000_000 ? value / 1_000_000 : value / 1000;
  return `${scaled.toFixed(scaled >= 10 ? 0 : 1).replace(/\.0$/, '')}${value >= 1_000_000 ? 'M+' : 'K+'}`;
}

function AnimatedCount({ value, loading }: { value?: number; loading: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { threshold: .3 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (value === undefined || loading || !visible) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    let frame = 0;
    const start = performance.now();
    const from = shown;
    const animate = (now: number) => { const t = Math.min(1, (now - start) / 700); setShown(Math.round(from + (value - from) * (1 - (1 - t) ** 3))); if (t < 1) frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value, loading, visible]);
  return <strong ref={ref} aria-live="polite">{loading ? '—' : value === undefined ? 'Unavailable' : compactCount(shown)}</strong>;
}

export function LiveMetrics({ metrics, loading }: { metrics: { totalMembers: number; totalVideoCalls: number; countriesReached: number; totalConnections: number } | null; loading: boolean }) {
  const cards = [
    { label: 'Total Members', value: metrics?.totalMembers, detail: 'People on Velora', icon: Users },
    { label: 'Total Video Calls', value: metrics?.totalVideoCalls, detail: 'Connections made', icon: Video },
    { label: 'Countries Reached', value: metrics?.countriesReached, detail: 'Our global community', icon: Globe2 },
    { label: 'Total Connections', value: metrics?.totalConnections, detail: 'Conversations started', icon: Heart },
  ];
  return <section className="vl-features vl-live-metrics vl-reveal" id="how-it-works" aria-label="Velora community statistics">
    {cards.map(({label,value,detail,icon:Icon})=><article key={label}><span className="vl-feature-icon purple"><Icon size={20}/></span><div><b>{label}</b><AnimatedCount value={metrics ? value : undefined} loading={loading}/><small>{detail}</small></div></article>)}
  </section>;
}

const packageTones: Record<string, string> = { spark: 'spark', glow: 'glow', aura: 'aura', noir: 'noir', lilac: 'aura', coral: 'glow', mint: 'aura', blue: 'spark', pink: 'aura', amber: 'glow', teal: 'spark', peach: 'glow' };
function packageTone(name: string, color: string | undefined, index: number) { return packageTones[(color || name).trim().toLowerCase()] || ['spark', 'glow', 'aura', 'noir'][index % 4]; }
export function CoinShowcase({ packages, loading, enabled, fallback, coinsPerMinute, onBuy, buyingId, content }: { packages: CoinPackage[]; loading: boolean; enabled: boolean; fallback?: boolean; coinsPerMinute: number | null; onBuy: (id: string) => void; buyingId?: string | null; content?: CmsContent['sections']['coins'] }) {
  const scroller=useRef<HTMLDivElement>(null);const [canLeft,setCanLeft]=useState(false);const [canRight,setCanRight]=useState(false);
  const update=()=>{const node=scroller.current;if(!node)return;setCanLeft(node.scrollLeft>2);setCanRight(node.scrollLeft+node.clientWidth<node.scrollWidth-2)};
  useEffect(()=>{update();const node=scroller.current;if(!node)return;const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect()},[packages.length,loading]);
  const move=(direction:-1|1)=>{const node=scroller.current;if(node)node.scrollBy({left:direction*node.clientWidth*(window.innerWidth<=820?.55:.25),behavior:'smooth'})};
  return <section className="vl-coin-section vl-reveal" id="coins"><div className="vl-coin-copy"><span className="vl-coin-eyebrow"><Coins size={14} /> Flirra Coins</span><h2>{content?.heading||'Get More with Coins'}</h2><p>{content?.description||'Top up when you need more time to keep a conversation going.'}</p><ul><li><Check size={14} /> Start random video chats</li><li><Check size={14} /> Keep chatting while connected</li><li><Check size={14} /> {coinsPerMinute==null?'Call pricing is not configured yet.':`Calls use ${coinsPerMinute} coins per minute`}</li></ul></div><div className="vl-package-carousel">{fallback&&<p className="vl-package-notice" role="status">Purchases temporarily unavailable. Prices shown are reference values.</p>}<button className="vl-package-arrow is-left" type="button" onClick={()=>move(-1)} disabled={!canLeft||packages.length<=4} aria-label="Previous coin packages"><ChevronLeft size={18}/></button><div className="vl-package-grid" ref={scroller} onScroll={update}>{loading ? [0,1,2,3].map(i=><div className="vl-package-skeleton" key={i}/>) : packages.map((pack,index)=>{const tone=packageTone(pack.name,pack.cardColor,index);return <article className={`vl-package vl-package-${tone}${pack.popular?' is-popular':''}`} key={pack.id}>{pack.popular&&<span className="vl-popular">★ Popular</span>}<div className="vl-package-art"><img src={coinPackageArtwork(pack.name,pack.imageUrl)} alt={`${pack.name} coin package`} loading="lazy" onError={event=>{const fallback=coinPackageArtwork(pack.name);if(event.currentTarget.src!==new URL(fallback,window.location.origin).href)event.currentTarget.src=fallback}}/></div><strong>{pack.name}</strong><span>{pack.coins.toLocaleString()} Coins</span>{(pack.bonusCoins||0)>0&&<small className="vl-package-description">+{pack.bonusCoins!.toLocaleString()} bonus coins</small>}{pack.description&&<small className="vl-package-description">{pack.description}</small>}<b>{new Intl.NumberFormat(undefined,{style:'currency',currency:pack.currency||'USD'}).format(pack.priceCents/100)}</b><button disabled={Boolean(buyingId)||Boolean(fallback)} title={fallback?'Purchases temporarily unavailable':!enabled?'Payment methods may be unavailable; you can check configured options in the wallet.':undefined} onClick={()=>onBuy(pack.id)}>{buyingId===pack.id?'Opening checkout…':'Buy Coins'} <ArrowRight size={13}/></button></article>})}</div><button className="vl-package-arrow is-right" type="button" onClick={()=>move(1)} disabled={!canRight||packages.length<=4} aria-label="Next coin packages"><ChevronRight size={18}/></button></div></section>;
}

const safeguards = [
  { title: 'Privacy', body: 'Email and birthday are kept private.', icon: LockKeyhole },
  { title: 'Report & block', body: 'Manage unwanted contact in a call.', icon: Heart },
  { title: 'Account verification', body: 'Verified email is required for discovery.', icon: ShieldCheck },
  { title: 'Adults only', body: 'Members must be 18 or older.', icon: LockKeyhole },
];

export function SafetyAndFooter({ content, siteName = 'Velora', logoUrl = '' }: { content?: CmsContent; siteName?: string; logoUrl?: string }) {
  const features = content?.sections.safety.features || safeguards.map(({title,body})=>({title,description:body,icon:'privacy' as const}));
  const safetyIcons = { privacy: LockKeyhole, report: Heart, verification: ShieldCheck, adults: LockKeyhole };
  return <>{content?.sections.safety.visible!==false&&<section className="vl-safety vl-reveal" id="safety"><div className="vl-safety-heading"><h2>{content?.sections.safety.heading||'A Safe & Respectful Community'}</h2><p>{content?.sections.safety.description||'We build a friendly and secure space for real conversations.'}</p></div><div className="vl-safety-items">{features.map(({ title, description, icon }) => { const Icon=safetyIcons[icon]; return <article key={title}><span><Icon size={19} /></span><div><b>{title}</b><small>{description}</small></div></article>; })}</div></section>}<footer className="vl-footer" id="footer">
    <svg className="vl-footer-wave" viewBox="0 0 1440 110" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="vl-footer-gradient" x1="0" x2="1"><stop offset="0" stopColor="#4c2187"/><stop offset=".72" stopColor="#6733b4"/><stop offset="1" stopColor="#542697"/></linearGradient></defs><path d="M0 43C145 8 306 24 454 50c185 33 294 34 453 9 226-35 369-5 533 17v34H0z" fill="url(#vl-footer-gradient)"/></svg>
    <svg className="vl-footer-heart" viewBox="0 0 88 104" aria-hidden="true"><path d="M44 35C25 8 4 20 10 39c5 15 25 27 34 34 10-8 31-20 35-35 5-19-16-30-35-3Z"/><path d="M76 73c-12 10-30 11-35 29"/></svg>
    <div className="vl-footer-main"><div className="vl-footer-brand"><a className="vl-brand" href="#top" aria-label={`${siteName} home`}><span>{logoUrl?<img src={logoUrl} alt=""/>:<Radio size={17}/>}</span>{siteName}</a><p>{content?.footer.description||`A modern video dating platform to meet, chat and connect with real people worldwide.`}</p>{Boolean(content?.footer.social.length)&&<div className="vl-footer-social" aria-label="Social networks">{content?.footer.social.map(item=><a key={item.label} href={item.href} aria-label={item.label} target="_blank" rel="noreferrer">{item.label}</a>)}</div>}</div><div className="vl-footer-links"><b>Explore</b>{(content?.footer.links||[]).map(item=><a key={`${item.label}-${item.href}`} href={item.href}>{item.label}</a>)}</div><div className="vl-footer-links"><b>Community</b><a href="#safety">Safety Center</a><a href="/terms">Community Guidelines</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></div><div className="vl-footer-links"><b>Support</b><a href="/terms">Help Center</a><a href="/terms">Contact Us</a><a href="/terms">Report an Issue</a></div></div><div className="vl-footer-bottom"><span>© 2026 {siteName}. All rights reserved.</span><span><b>18+ Community</b><a href="/privacy">Privacy</a><a href="/terms">Terms</a></span></div></footer></>;
}
