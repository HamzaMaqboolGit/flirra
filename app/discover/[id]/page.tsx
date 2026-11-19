'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BadgeCheck, ChevronLeft, ChevronRight, CirclePlay, Coins, Flag, Gift, Heart,
  Image as ImageIcon, MapPin, MessageCircle, MoreHorizontal, Play, Share2, ShieldAlert,
  Sparkles, Video, X,
} from 'lucide-react';
import UserNavigation from '@/app/user-navigation';
import { countryFlag, countryName } from '@/lib/countries';
import { readApiJson } from '@/lib/client-api';
import { PageSkeleton } from '@/app/ui/loading';
import { useRouter } from 'next/navigation';
import { useDialog } from '@/app/ui/dialog-provider';
import { useToast } from '@/app/toast-provider';
import Modal from '@/app/ui/modal';

type MemberVideo = { id: string; url: string; thumbnailUrl?: string | null; duration?: number | null };
type MemberStory = { id: string; url: string; mediaType: 'IMAGE' | 'VIDEO'; createdAt: string; thumbnailUrl?: string | null };
type Person = {
  id: string; displayName: string; role: 'MALE' | 'FEMALE' | 'ADMIN'; age: number | null; country: string; bio: string;
  interests: string[]; avatarUrl: string | null; photos: string[]; online: boolean; verified: boolean;
  verificationLabel: string; viewerVerified: boolean; memberSince: string; followerCount: number;
  followingCount: number; videoCallCount: number; following: boolean; self: boolean;
  viewerRole: string | null; guest: boolean; videos: MemberVideo[]; stories: MemberStory[];
};

export default function DiscoverProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const dialog=useDialog(); const toast=useToast();
  const [id, setId] = useState('');
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(0);
  const [viewer, setViewer] = useState(false);
  const [storyIndex, setStoryIndex] = useState<number | null>(null);
  const [storyPaused, setStoryPaused] = useState(false);
  const [storyMuted, setStoryMuted] = useState(true);
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftChoices, setGiftChoices] = useState<Array<{id:string;name:string;imageUrl:string;coins:number}>>([]);
  const [selectedGift, setSelectedGift] = useState('');
  const [giftQuantity, setGiftQuantity] = useState(1);
  const [giftBalance, setGiftBalance] = useState<number|null>(null);
  const [giftBusy, setGiftBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    try {
      setFavorite((JSON.parse(localStorage.getItem('velora.favoriteProfiles') || '[]') as string[]).includes(id));
      setNotificationsMuted((JSON.parse(localStorage.getItem('velora.mutedProfiles') || '[]') as string[]).includes(id));
    } catch { setFavorite(false); setNotificationsMuted(false); }
  }, [id]);

  const load = useCallback(async (value: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/discover/${encodeURIComponent(value)}`, { cache: 'no-store' });
      const result = await readApiJson(response, 'Profile is unavailable.') as { person?: Person; error?: string };
      if (!response.ok) throw new Error(result.error || 'Profile is unavailable.');
      setPerson(result.person || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Profile is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void params.then(({ id: profileId }) => {
      if (!active) return;
      setId(profileId);
      void load(profileId);
    });
    return () => { active = false; };
  }, [params, load]);

  const photos = useMemo(() => person?.photos.length ? person.photos : person?.avatarUrl ? [person.avatarUrl] : [], [person]);

  useEffect(() => {
    if (!viewer) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewer(false);
      if (!photos.length) return;
      if (event.key === 'ArrowLeft') setPhoto(value => (value - 1 + photos.length) % photos.length);
      if (event.key === 'ArrowRight') setPhoto(value => (value + 1) % photos.length);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [viewer, photos.length]);

  useEffect(() => {
    if (storyIndex === null || !person) return;
    const story = person.stories[storyIndex];
    if (!story || story.mediaType === 'VIDEO' || storyPaused) return;
    const timer = window.setTimeout(() => setStoryIndex(index => index === null || index >= person.stories.length - 1 ? null : index + 1), 5000);
    return () => window.clearTimeout(timer);
  }, [storyIndex, storyPaused, person]);

  useEffect(() => {
    if (storyIndex === null || !person?.stories[storyIndex] || person.self) return;
    void fetch('/api/stories/view', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyId: person.stories[storyIndex].id }) }).catch(() => undefined);
  }, [storyIndex, person]);

  useEffect(() => {
    if (storyIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStoryIndex(null);
      if (event.key === 'ArrowRight') setStoryIndex(index => index === null || index >= (person?.stories.length || 1) - 1 ? null : index + 1);
      if (event.key === 'ArrowLeft') setStoryIndex(index => index === null ? null : Math.max(0, index - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [storyIndex, person?.stories.length]);

  async function follow() {
    if (!person) return;
    if (!person.viewerRole) { router.push(`/login?next=${encodeURIComponent(`/discover/${id}`)}`); return; }
    setBusy(true); setError(''); setNote('');
    try {
      const response = await fetch('/api/discover/follow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: person.id, follow: !person.following }) });
      const result = await readApiJson(response, 'Could not update follow status.') as { following?: boolean; followerCount?: number; error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not update follow status.');
      setPerson(current => current ? { ...current, following: Boolean(result.following), followerCount: Number(result.followerCount ?? current.followerCount) } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update follow status.');
    } finally { setBusy(false); }
  }

  async function call() {
    if (!person) return;
    if (!person.viewerRole) { router.push(`/login?next=${encodeURIComponent(`/discover/${id}`)}`); return; }
    if (person.viewerRole === 'ADMIN') { setNote('Video calling is available from a member account.'); return; }
    if (!person.guest && !person.viewerVerified) { setNote('Verify your email before calling a member.'); return; }
    setBusy(true); setError(''); setNote('');
    try {
      const response = await fetch('/api/calls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'direct', recipientId: person.id, country: person.country || 'Worldwide', gender: person.role }) });
      const result = await readApiJson(response, 'Could not start a video call.') as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not start a video call.');
      router.push('/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start a video call.');
    } finally { setBusy(false); }
  }

  async function message() {
    if (!person) return;
    if (!person.viewerRole) { router.push(`/login?next=${encodeURIComponent(`/discover/${id}`)}`); return; }
    setBusy(true); setError(''); setNote('');
    try {
      const response = await fetch('/api/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: person.id }) });
      const result = await readApiJson(response, 'Could not start a conversation.') as { conversationId?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Message this member after a shared call.');
      router.push(`/messages?conversation=${encodeURIComponent(result.conversationId || '')}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start a conversation.');
    } finally { setBusy(false); }
  }

  async function openGiftPicker() {
    if (!person) return;
    if (!person.viewerRole) { router.push(`/login?next=${encodeURIComponent(`/discover/${id}`)}`); return; }
    setGiftOpen(true); setGiftChoices([]); setGiftBalance(null); setSelectedGift(''); setGiftQuantity(1);
    try { const response=await fetch(`/api/discover/${encodeURIComponent(person.id)}/gift`); const result=await readApiJson(response,'Gifts are unavailable.') as {gifts?:typeof giftChoices;balance?:number;error?:string}; if(!response.ok)throw new Error(result.error||'Gifts are unavailable.'); setGiftChoices(result.gifts||[]); setGiftBalance(result.balance??0); } catch(cause){setError(cause instanceof Error?cause.message:'Gifts are unavailable.');}
  }

  async function sendProfileGift() {
    if (!person || !selectedGift || giftBusy) return;
    setGiftBusy(true);
    try { const response=await fetch(`/api/discover/${encodeURIComponent(person.id)}/gift`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({giftId:selectedGift,quantity:giftQuantity,idempotencyKey:crypto.randomUUID()})}); const result=await readApiJson(response,'Could not send this gift.') as {balance?:number;conversationId?:string;error?:string}; if(!response.ok)throw new Error(result.error||'Could not send this gift.'); setGiftBalance(result.balance??giftBalance); setGiftOpen(false); toast.success('Gift sent',`Your gift is now in ${person.displayName}'s messages.`); if(result.conversationId)router.push(`/messages?conversation=${encodeURIComponent(result.conversationId)}`); } catch(cause){setError(cause instanceof Error?cause.message:'Could not send this gift.');} finally{setGiftBusy(false);}
  }

  async function safety(action: 'block' | 'report') {
    if (!person) return;
    if (!person.viewerRole) { setNote('Sign in to manage profile safety options.'); return; }
    let report:{reason:string;details:string}|null=null;
    if(action==='block'){if(!await dialog.confirm({title:`Block ${person.displayName}?`,description:'You will no longer see this member in Discover or receive their messages.',confirmLabel:'Block user',danger:true}))return}else{report=await dialog.report({title:'Report User',description:'Tell us why you’re reporting this account.',confirmLabel:'Submit report'});if(!report)return}
    setBusy(true); setError(''); setNote('');
    try {
      const response = await fetch('/api/safety', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action === 'block' ? { action, userId: person.id } : { action, userId: person.id, ...report }) });
      const result = await readApiJson(response, 'Could not complete this action.') as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not complete this action.');
      toast.success(action === 'block' ? 'Member blocked' : 'Report submitted', action === 'block' ? 'This member has been blocked.' : 'The safety team will review this profile.');
    } catch (cause) {
      toast.error('Could not complete this action', cause instanceof Error ? cause.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  function toggleNotifications() {
    try {
      const saved = JSON.parse(localStorage.getItem('velora.mutedProfiles') || '[]') as string[];
      const next = notificationsMuted ? saved.filter(value => value !== id) : [...new Set([...saved, id])];
      localStorage.setItem('velora.mutedProfiles', JSON.stringify(next));
      setNotificationsMuted(!notificationsMuted);
      setNote(notificationsMuted ? 'Notifications unmuted for this profile on this device.' : 'Notifications muted for this profile on this device.');
    } catch { setError('Could not update notification preferences on this device.'); }
  }

  async function share() {
    try {
      const url = `${location.origin}/discover/${encodeURIComponent(id)}`;
      if (navigator.share) await navigator.share({ title: `${person?.displayName} · Velora`, url });
      else { await navigator.clipboard.writeText(url); setNote('Profile link copied.'); }
    } catch { setNote('Could not share this profile right now.'); }
  }

  function toggleFavorite() {
    try {
      const saved = JSON.parse(localStorage.getItem('velora.favoriteProfiles') || '[]') as string[];
      const next = favorite ? saved.filter(value => value !== id) : [...new Set([...saved, id])];
      localStorage.setItem('velora.favoriteProfiles', JSON.stringify(next));
      setFavorite(!favorite);
      setNote(favorite ? 'Removed from favorites.' : 'Added to favorites on this device.');
    } catch { setError('Could not update favorites on this device.'); }
  }

  if (loading) return <main className="discover-member-page"><UserNavigation active="discover"/><div className="discover-member-loading"><PageSkeleton/></div></main>;
  if (!person) return <main className="discover-member-page"><UserNavigation active="discover"/><div className="discover-member-state"><b>Profile unavailable</b><span>{error}</span><button onClick={() => id && void load(id)}>Try again</button><a href="/discover"><ArrowLeft size={15}/>Back to Discover</a></div></main>;

  const canCall = person.viewerRole === 'MALE' || person.viewerRole === 'FEMALE';

  return <main className="discover-member-root">
    <UserNavigation active="discover"/>
    <div className="profile-showcase-page discover-profile-showcase" style={{ ['--profile-card-tint' as string]: 'color-mix(in srgb,var(--velora-button,var(--velora-purple)) 7%,var(--velora-surface))' } as React.CSSProperties}>
    <div className="profile-showcase-shell">
      <section className="profile-showcase-grid">
        <article className="discover-member-info profile-showcase-person">
          <div className="discover-member-avatar-card profile-showcase-avatar">
            {person.avatarUrl ? <img src={person.avatarUrl} alt={`${person.displayName}'s profile photo`}/> : <span>{person.displayName.slice(0, 1).toUpperCase()}</span>}
            <i className={person.online ? 'is-online' : ''}/>
          </div>
          <h2 className="profile-showcase-member-name">{person.displayName}{person.age !== null && <span>, {person.age}</span>}<span className={`profile-email-badge${person.verified?' is-verified':''}`}><BadgeCheck size={12}/>{person.verified?'Verified':'Unverified'}</span></h2>
          <p className="profile-showcase-location"><MapPin size={16}/>{countryFlag(person.country)} {person.country ? countryName(person.country) : 'Location not shared'}</p>
          <span className={`profile-showcase-presence${person.online ? ' online' : ''}`}><i/>{person.online ? 'Online' : 'Offline'}</span>
          <p className="profile-showcase-bio">{person.bio || 'This member has not added an introduction yet.'}</p>
          {(note || error) && <p className={error ? 'discover-member-error-note' : 'discover-member-note'} role={error ? 'alert' : 'status'}>{error || note}</p>}
          <div className="profile-showcase-stats">
            <span><b>{person.followingCount.toLocaleString()}</b><small>Following</small></span>
            <span><b>{person.followerCount.toLocaleString()}</b><small>Followers</small></span>
            <span><b>{photos.length.toLocaleString()}</b><small>Photos</small></span>
          </div>
          {person.self ? <div className="profile-showcase-actions profile-showcase-owner-actions">
            <a className="primary" href="/profile"><Heart size={16}/>Edit Profile</a>
            <a href="/profile/personal-information"><ImageIcon size={16}/>Manage Photos</a>
            <a href="/profile/account-settings"><ShieldAlert size={16}/>Profile Settings</a>
            {person.viewerRole === 'FEMALE' && <a href="/earnings"><Coins size={16}/>Earnings</a>}
            <a href="/wallet"><Gift size={16}/>Wallet</a>
          </div> : <>
            <div className="profile-showcase-actions profile-showcase-actions-row"><button type="button" disabled={busy} onClick={() => void follow()}><Heart size={16} fill={person.following ? 'currentColor' : 'none'}/>{person.following ? 'Unfollow' : 'Follow'}</button><button type="button" disabled={busy} onClick={() => void message()}><MessageCircle size={16}/>Message</button></div>
            <div className="profile-showcase-call-actions"><button type="button" className="primary" disabled={busy || !canCall} title={!canCall && person.viewerRole ? 'Video calling is available to member accounts.' : undefined} onClick={() => void call()}><Video size={17}/>{busy ? 'Connecting…' : 'Video Call'}</button><button type="button" className="outline" disabled={busy} onClick={() => void openGiftPicker()}><Gift size={17}/>Send Gift</button></div>
            <details className="profile-showcase-more"><summary><MoreHorizontal size={17}/>More Actions<ChevronRight size={15}/></summary><div><button type="button" onClick={toggleFavorite}><Heart size={15} fill={favorite ? 'currentColor' : 'none'}/>{favorite ? 'Remove from Favorites' : 'Add to Favorites'}</button><button type="button" onClick={() => void share()}><Share2 size={15}/>Share Profile</button><button type="button" onClick={() => void safety('block')}><ShieldAlert size={15}/>Block User</button><button type="button" onClick={() => void safety('report')}><Flag size={15}/>Report Profile</button></div></details>
          </>}
        </article>
        <section className="discover-member-media-column discover-member-media-sections profile-showcase-media">
          <section className="discover-member-stories profile-showcase-stories">
            <header><div><span><Play size={16}/></span><h2>Stories</h2></div></header>
            <div className="profile-showcase-story-strip">{person.stories.map((story,index) => <button key={story.id} type="button" onClick={() => { setStoryIndex(index); setStoryPaused(false); }} aria-label={`Open story from ${person.displayName}`}><span><img src={story.thumbnailUrl || story.url} alt=""/>{story.mediaType === 'VIDEO' && <CirclePlay size={16}/>}</span></button>)}{!person.stories.length && <p className="profile-showcase-empty-story">No active stories from this member.</p>}</div>
          </section>
          <section className={`discover-profile-photos profile-showcase-photos${photos.length ? ' has-photos' : ' is-empty'}`}>
            <header><div><span><ImageIcon size={17}/></span><h2>Photos</h2><small>{photos.length}</small></div></header>
            {photos.length ? <div className="profile-showcase-photo-grid">{photos.map((src,index)=><div className="profile-showcase-photo" key={`${src}-${index}`}><button type="button" onClick={()=>{setPhoto(index);setViewer(true)}} aria-label={`Open photo ${index+1}`}><img src={src} alt={`${person.displayName} photo ${index+1}`} loading="lazy"/></button></div>)}</div> : <div className="profile-showcase-photo-empty"><ImageIcon size={25}/><b>No photos yet</b><span>This member has not shared any photos.</span></div>}
          </section>
        </section>
      </section>
    </div></div>
    {viewer && photos.length > 0 && <div className="discover-photo-viewer" role="dialog" aria-modal="true" aria-label="Profile photo viewer" onClick={() => setViewer(false)}><button className="close" aria-label="Close photo viewer"><X/></button>{photos.length > 1 && <button className="left" aria-label="Previous photo" onClick={event => { event.stopPropagation(); setPhoto(value => (value - 1 + photos.length) % photos.length); }}><ChevronLeft/></button>}<img src={photos[photo]} alt={`${person.displayName} profile photo`}/>{photos.length > 1 && <button className="right" aria-label="Next photo" onClick={event => { event.stopPropagation(); setPhoto(value => (value + 1) % photos.length); }}><ChevronRight/></button>}</div>}
    {storyIndex !== null && person.stories[storyIndex] && <div className="discover-profile-story-overlay" role="dialog" aria-modal="true" aria-label={`${person.displayName}'s story`} onClick={()=>setStoryIndex(null)}><div className="discover-profile-story" onClick={event=>event.stopPropagation()}><div className="discover-profile-story-progress"><i/><i className="active"/><i/></div><header><span><img src={person.avatarUrl||'/velora-landing/avatar-default.svg'} alt=""/><b>{person.displayName}</b></span><button type="button" onClick={()=>setStoryPaused(value=>!value)} aria-label={storyPaused?'Resume story':'Pause story'}>{storyPaused?'▶':'Ⅱ'}</button><button type="button" onClick={()=>setStoryMuted(value=>!value)} aria-label={storyMuted?'Unmute story':'Mute story'}>{storyMuted?'◖':'◗'}</button><button type="button" onClick={()=>setStoryIndex(null)} aria-label="Close story"><X/></button></header>{person.stories[storyIndex].mediaType==='VIDEO'?<video key={person.stories[storyIndex].id} src={person.stories[storyIndex].url} autoPlay={!storyPaused} muted={storyMuted} playsInline controls={false} onEnded={()=>setStoryIndex(index=>index===null||index>=person.stories.length-1?null:index+1)} onClick={()=>setStoryPaused(value=>!value)}/>:<img src={person.stories[storyIndex].url} alt="Member story"/>}<button className="prev" type="button" aria-label="Previous story" onClick={()=>setStoryIndex(index=>index===null?null:Math.max(0,index-1))}><ChevronLeft/></button><button className="next" type="button" aria-label="Next story" onClick={()=>setStoryIndex(index=>index===null||index>=person.stories.length-1?null:index+1)}><ChevronRight/></button></div></div>}
    <Modal open={giftOpen} onClose={()=>setGiftOpen(false)} label="Send a gift" className="messages-gift-modal"><h2><Gift size={18}/> Send a gift to {person.displayName}</h2>{giftBalance!==null&&<p className="messages-gift-balance">Balance <b>{giftBalance.toLocaleString()} coins</b></p>}{giftChoices.length>0&&<div className="messages-gift-grid">{giftChoices.map(gift=><button type="button" className={selectedGift===gift.id?'is-selected':''} key={gift.id} onClick={()=>setSelectedGift(gift.id)}><span>{gift.imageUrl}</span><b>{gift.name}</b><small>{gift.coins} coins</small></button>)}</div>}{selectedGift&&<label className="messages-gift-quantity">Quantity <input type="number" min={1} max={20} value={giftQuantity} onChange={event=>setGiftQuantity(Math.max(1,Math.min(20,Number(event.target.value)||1)))}/></label>}<p className="messages-gift-total">Total: {(giftChoices.find(gift=>gift.id===selectedGift)?.coins||0)*giftQuantity} coins</p><div className="messages-profile-modal-actions"><button type="button" onClick={()=>setGiftOpen(false)}>Cancel</button><button type="button" disabled={!selectedGift||giftBusy} onClick={()=>void sendProfileGift()}>{giftBusy?'Sending…':'Send Gift'}</button></div></Modal>
  </main>;
}
