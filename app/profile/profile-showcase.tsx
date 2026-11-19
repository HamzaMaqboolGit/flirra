'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, BellOff, Camera, ChevronLeft, ChevronRight, CircleDollarSign, Copy, Gift, Heart, Image as ImageIcon, MapPin, MessageCircle, MoreHorizontal, Pause, Play, Plus, Share2, Video, Volume2, VolumeX, Wallet, X } from 'lucide-react';
import Modal from '../ui/modal';
import { readApiJson } from '@/lib/client-api';
import Link from 'next/link';
import { useDialog } from '@/app/ui/dialog-provider';
import { useToast } from '@/app/toast-provider';
import CreatorEarningsInline from './creator-earnings-inline';
import VerificationStatus from '../verification-status';

type Photo = { id: string; url: string; position: number };
type Data = { user: { id: string; displayName: string; email: string; emailVerifiedAt: string | null; isGuest: boolean; role: string; accountType?: string; creatorStatus?: string; dateOfBirth: string | null }; profile: { bio: string; country: string; city: string; avatarUrl: string | null; online: boolean }; photos: Photo[]; social?: { followers: number; following: number } };
type StoryItem = { id: string; mediaUrl: string; mediaType: 'image' | 'video'; caption?:string; createdAt: string; expiresAt: string };
type StoryGroup = { userId: string; name: string; avatar: string | null; online: boolean; items: StoryItem[] };

function age(date: string | null) {
  if (!date) return null;
  const born = new Date(date); if (!Number.isFinite(born.getTime())) return null;
  const today = new Date(); let value = today.getFullYear() - born.getFullYear();
  if (today.getMonth() < born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())) value--;
  return value;
}

function pastelFromImage(url: string | null, done: (color: string) => void) {
  if (!url) { done('var(--velora-subtle, #f5f3f7)'); return; }
  const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => {
    try {
      const canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 20;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new Error();
      ctx.drawImage(img, 0, 0, 20, 20); const pixels = ctx.getImageData(0, 0, 20, 20).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < pixels.length; i += 16) { if (pixels[i + 3] < 180) continue; r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; n++; }
      if (!n) throw new Error();
      const mix = (v: number) => Math.round(v * .13 + 255 * .87);
      done(`rgb(${mix(r / n)} ${mix(g / n)} ${mix(b / n)})`);
    } catch { done('var(--velora-subtle, #f5f3f7)'); }
  }; img.onerror = () => done('var(--velora-subtle, #f5f3f7)'); img.src = url;
}

export default function ProfileShowcase({ data, photos, onUpload, onDelete, onSetProfilePhoto, onOpenSettings }: { data: Data; photos: Photo[]; onUpload: (file: File, primary: boolean) => Promise<boolean | void>; onDelete: (id: string) => Promise<void>; onSetProfilePhoto: (id: string) => Promise<boolean | void>; onOpenSettings: () => void }) {
  const dialog=useDialog(); const toast=useToast();
  const [tint, setTint] = useState('var(--velora-subtle, #f5f3f7)');
  const [stories, setStories] = useState<StoryGroup[]>([]); const [storyGroup, setStoryGroup] = useState<StoryGroup | null>(null); const [storyIndex, setStoryIndex] = useState(0);
  const [storyPaused,setStoryPaused]=useState(false);const [storyMuted,setStoryMuted]=useState(true);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null); const [more, setMore] = useState(true); const [busy, setBusy] = useState(false); const [note, setNote] = useState('');
  const [notificationsMuted,setNotificationsMuted]=useState(false);
  const [emailVerified,setEmailVerified]=useState(Boolean(data.user.emailVerifiedAt));
  const [creatorView,setCreatorView]=useState<'overview'|'earnings'|'gifts'|'withdrawals'>('overview'); const [creatorPanelVisited,setCreatorPanelVisited]=useState(false);
  const storyInput = useRef<HTMLInputElement>(null); const photoInput = useRef<HTMLInputElement>(null); const storyTimer = useRef<number | null>(null);
  const primaryUrl = data.profile.avatarUrl; const ownPhotos = useMemo(() => photos.length ? photos : primaryUrl ? [{ id: 'avatar', url: primaryUrl, position: 0 }] : [], [photos, primaryUrl]);
  const userAge = age(data.user.dateOfBirth); const theme = 'var(--velora-button, var(--velora-primary, var(--velora-purple, #8427f5)))';

  useEffect(() => { let live = true; pastelFromImage(primaryUrl, color => { if (live) setTint(color); }); return () => { live = false; }; }, [primaryUrl]);
  useEffect(() => { setEmailVerified(Boolean(data.user.emailVerifiedAt)); }, [data.user.emailVerifiedAt]);
  useEffect(() => { const onVerified=()=>setEmailVerified(true); window.addEventListener('flirra-email-verified',onVerified); return()=>window.removeEventListener('flirra-email-verified',onVerified); }, []);
  useEffect(() => { const url = new URL(location.href); if (url.searchParams.get('creatorView') !== 'withdrawals' || data.user.isGuest) return; setCreatorPanelVisited(true); setCreatorView('withdrawals'); url.searchParams.delete('creatorView'); history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`); }, [data.user.isGuest]);
  const loadStories = useCallback(async () => {
    try { const response = await fetch('/api/stories', { cache: 'no-store' }); if (!response.ok) return; const result = await readApiJson(response, 'Could not load stories.') as { stories?: StoryGroup[] }; setStories((result.stories || []).filter(group => group.userId === data.user.id)); } catch { /* story content is optional */ }
  }, [data.user.id]);
  useEffect(() => { void loadStories(); }, [loadStories]);
  useEffect(()=>{let active=true;void fetch('/api/account/settings',{cache:'no-store'}).then(async response=>response.ok?await readApiJson(response,'') as {settings?:Record<string,boolean>}:null).then(result=>{if(!active||!result?.settings)return;const keys=['emailNotifications','messageNotifications','callNotifications','followerNotifications','giftNotifications','promotionalNotifications'];setNotificationsMuted(keys.every(key=>result.settings?.[key]===false))}).catch(()=>undefined);return()=>{active=false}},[]);
  useEffect(() => { if (!storyGroup||storyPaused) return; const current = storyGroup.items[storyIndex]; if (!current) return; if (storyTimer.current) window.clearTimeout(storyTimer.current); if (current.mediaType !== 'video') storyTimer.current = window.setTimeout(() => advanceStory(1), 5000); return () => { if (storyTimer.current) window.clearTimeout(storyTimer.current); }; }, [storyGroup, storyIndex,storyPaused]);
  function advanceStory(delta: number) { if (!storyGroup) return; const next = storyIndex + delta; if (next < 0) { setStoryGroup(null); return; } if (next >= storyGroup.items.length) { setStoryGroup(null); return; } setStoryIndex(next);setStoryPaused(false); }
  async function uploadStory(file?: File) {
    if (!file) return;
    const limits: Record<string, number> = { 'image/jpeg': 8_000_000, 'image/png': 8_000_000, 'image/webp': 8_000_000, 'video/mp4': 15_000_000, 'video/webm': 15_000_000 };
    if (!(file.type in limits)) { setNote('Choose a JPG, PNG, WebP, MP4 or WebM file.'); return; }
    if (file.size > limits[file.type]) { setNote(file.type.startsWith('video/') ? 'Videos must be 15 MB or smaller.' : 'Images must be 8 MB or smaller.'); return; }
    setBusy(true); setNote('');
    try {
      const form = new FormData(); form.set('file', file);
      const response = await fetch('/api/stories', { method: 'POST', body: form });
      const result = await readApiJson(response, 'Could not publish story.') as { error?: string };
      if (!response.ok) throw new Error(result.error || `Upload failed (${response.status}).`);
      await loadStories(); toast.success('Story added', 'Your story is available for 24 hours.');
    } catch (e) { toast.error('Could not publish story',e instanceof Error ? e.message : 'Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  async function removeStory(item: StoryItem) { if(!await dialog.confirm({title:'Delete this story?',description:'It will disappear for everyone immediately.',confirmLabel:'Delete story',danger:true}))return;try { const response = await fetch(`/api/stories?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' }); if (!response.ok) throw new Error('Could not delete this story.'); await loadStories(); setStoryGroup(null); toast.success('Story deleted'); } catch (e) { toast.error('Could not delete story',e instanceof Error ? e.message : 'Please try again.'); } }
  async function copyLink() { try { await navigator.clipboard.writeText(location.href); setNote('Profile link copied.'); } catch { setNote('Could not copy the profile link.'); } }
  function openCreatorView(view: 'earnings'|'gifts'|'withdrawals') { setCreatorPanelVisited(true); setCreatorView(view); }
  async function share() { try { if (navigator.share) await navigator.share({ title: `${data.user.displayName} · Velora`, url: location.href }); else await copyLink(); } catch { /* dismissed */ } }
  async function toggleNotifications(){setBusy(true);try{const response=await fetch('/api/account/settings',{cache:'no-store'});const result=await readApiJson(response,'Could not load notification preferences.') as {settings?:Record<string,unknown>;error?:string};if(!response.ok||!result.settings)throw new Error(result.error||'Could not load notification preferences.');const keys=['emailNotifications','messageNotifications','callNotifications','followerNotifications','giftNotifications','promotionalNotifications'];const muted=keys.every(key=>result.settings?.[key]===false);const next={...result.settings,...Object.fromEntries(keys.map(key=>[key,muted]))};const saved=await fetch('/api/account/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(next)});const output=await readApiJson(saved,'Could not update notification preferences.') as {error?:string};if(!saved.ok)throw new Error(output.error||'Could not update notification preferences.');setNotificationsMuted(!muted);setNote(muted?'Notifications unmuted.':'Notifications muted.')}catch(error){setNote(error instanceof Error?error.message:'Could not update notification preferences.')}finally{setBusy(false)}}
  async function useStoryAsProfile(item: StoryItem) {
    setBusy(true); setNote('Preparing profile photo…');
    try {
      const source = item.mediaType === 'video' ? document.createElement('video') : new Image();
      if (source instanceof HTMLVideoElement) { source.muted = true; source.playsInline = true; source.crossOrigin = 'anonymous'; }
      else source.crossOrigin = 'anonymous';
      const loaded = new Promise<void>((resolve, reject) => { source.onload = () => resolve(); source.onloadeddata = () => resolve(); source.onerror = () => reject(new Error('This story could not be opened as an image.')); });
      source.src = item.mediaUrl; await loaded;
      if (source instanceof HTMLVideoElement && source.duration > 0) { source.currentTime = Math.min(0.5, source.duration / 2); await new Promise<void>((resolve, reject) => { source.onseeked = () => resolve(); source.onerror = () => reject(new Error('Could not prepare a frame from this video.')); }); }
      const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
      const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
      if (!width || !height) throw new Error('This story has no usable image frame.');
      const scale = Math.min(1, 1200 / Math.max(width, height)); const canvas = document.createElement('canvas'); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
      const context = canvas.getContext('2d'); if (!context) throw new Error('Could not prepare this profile photo.'); context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare this profile photo.')), 'image/webp', .86));
      if (blob.size > 4 * 1024 * 1024) throw new Error('This story image is too large to use as a profile photo.');
      const saved=await onUpload(new File([blob], 'story-profile-photo.webp', { type: 'image/webp' }), true); if(saved===false)throw new Error('Could not save the story image as your profile photo.'); setNote('Profile photo updated.'); setStoryGroup(null);
    } catch (error) { setNote(error instanceof Error ? error.message : 'Could not set this story as your profile photo.'); }
    finally { setBusy(false); }
  }

  return <main className="profile-showcase-page" style={{ ['--profile-card-tint' as string]: tint, ['--profile-accent' as string]: theme } as React.CSSProperties}>
    <div className="profile-showcase-head"><div><span>YOUR PROFILE</span><h1>Your profile</h1><p>Share a little about yourself and your moments.</p></div><button type="button" onClick={onOpenSettings}>Edit profile</button></div>
    {note && <div className="profile-showcase-note" role="status">{note}<button type="button" onClick={() => setNote('')} aria-label="Dismiss"><X size={15}/></button></div>}
    {!data.user.isGuest && <VerificationStatus verified={emailVerified} email={data.user.email}/>}
    <div className="profile-showcase-grid">
      <section className="profile-showcase-person" aria-label="Profile details">
        <button type="button" className="profile-showcase-avatar" onClick={() => ownPhotos.length && setPhotoIndex(0)} aria-label="View profile photo">{primaryUrl ? <img src={primaryUrl} alt={`${data.user.displayName} profile`}/> : <span>{data.user.displayName.slice(0,1).toUpperCase()}</span>}<i className={data.profile.online ? 'is-online' : ''}/></button>
        <h2>{data.user.displayName || 'Your name'}{userAge !== null && <span>, {userAge}</span>}<span className={`profile-email-badge${emailVerified?' is-verified':''}`}><BadgeCheck size={12}/>{emailVerified?'Verified':'Unverified'}</span></h2>
        <p className="profile-showcase-location"><MapPin size={16}/>{[data.profile.city, data.profile.country].filter(Boolean).join(', ') || 'Add your location'}</p>
        <span className={`profile-showcase-presence${data.profile.online ? ' online' : ''}`}><i/>{data.profile.online ? 'Online' : 'Offline'}</span>
        <p className="profile-showcase-bio">{data.profile.bio || 'Add a short introduction to your profile.'}</p>
        <div className="profile-showcase-stats"><span><b>{(data.social?.following || 0).toLocaleString()}</b><small>Following</small></span><span><b>{(data.social?.followers || 0).toLocaleString()}</b><small>Followers</small></span><span><b>{photos.length.toLocaleString()}</b><small>Photos</small></span></div>
        <div className="profile-showcase-actions"><Link className="primary" href="/profile/personal-information"><Camera size={16}/>Edit Profile</Link></div>
        <details className="profile-showcase-more" open={more} onToggle={event=>setMore(event.currentTarget.open)}><summary><MoreHorizontal size={17}/>More Actions<ChevronRight size={15}/></summary><div>
          <Link href="/profile/personal-information#photos"><ImageIcon size={15}/>Manage Photos</Link>
          <Link href="/profile/account-settings"><BellOff size={15}/>Profile Settings</Link>
          <Link href="/wallet"><Wallet size={15}/>Wallet</Link>
          <button type="button" onClick={() => void share()}><Share2 size={15}/>Share Profile</button>
          <button type="button" onClick={() => void copyLink()}><Copy size={15}/>Copy Profile Link</button>
          {!data.user.isGuest && <>
            <span className="profile-showcase-more-label">Creator Earnings</span>
            <button type="button" className={creatorView==='earnings'?'is-active':''} aria-pressed={creatorView==='earnings'} onClick={()=>openCreatorView('earnings')}><CircleDollarSign size={15}/>Creator Earnings</button>
            <button type="button" className={creatorView==='gifts'?'is-active':''} aria-pressed={creatorView==='gifts'} onClick={()=>openCreatorView('gifts')}><Gift size={15}/>Gift Collection</button>
            <button type="button" className={creatorView==='withdrawals'?'is-active':''} aria-pressed={creatorView==='withdrawals'} onClick={()=>openCreatorView('withdrawals')}><Wallet size={15}/>Withdraw Earnings</button>
          </>}
        </div></details>
      </section>
      <div className="profile-showcase-media">
        <div className={`profile-showcase-overview${creatorView==='overview'?' is-current':' is-hidden'}`} aria-hidden={creatorView!=='overview'}>
        <section className="profile-showcase-stories"><header><div><span><Play size={16}/></span><h2>Stories</h2></div><input ref={storyInput} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" hidden onChange={event => { void uploadStory(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}/></header>
          <div className="profile-showcase-story-strip"><button type="button" className="story-thumb add-story" onClick={() => storyInput.current?.click()} disabled={busy} aria-label="Add Story"><span><Plus size={22}/></span><small>{busy ? 'Uploading…' : 'Add Story'}</small></button>{stories.flatMap(group => group.items.map((item,index) => <button key={`${group.userId}:${item.id}`} type="button" className="story-thumb" aria-label={`View ${group.name}'s story ${index + 1}`} onClick={() => { setStoryGroup(group); setStoryIndex(index); }}><span>{item.mediaType === 'video' ? <video src={item.mediaUrl} muted playsInline preload="metadata" aria-hidden="true"/> : <img src={item.mediaUrl} alt="" loading="lazy"/>}</span><small>{group.items.length > 1 ? `${group.name} · ${index + 1}` : group.name}</small></button>))}{!stories.length && <p className="profile-showcase-empty-story">Your stories appear here for 24 hours.</p>}</div>
        </section>
        <section className="profile-showcase-photos"><header><div><span><ImageIcon size={17}/></span><h2>Photos</h2><small>{photos.length}</small></div><button type="button" onClick={() => photoInput.current?.click()} disabled={photos.length >= 6 || busy}><Camera size={15}/>Add photos</button><input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={async event => { const input = event.currentTarget; for (const file of Array.from(input.files || []).slice(0, 6 - photos.length)) await onUpload(file, false); input.value = ''; }}/></header>
          {photos.length ? <div className="profile-showcase-photo-grid">{photos.map((photo, index) => <div className="profile-showcase-photo" key={photo.id}><button type="button" onClick={() => setPhotoIndex(index)}><img src={photo.url} alt={`${data.user.displayName} photo ${index + 1}`} loading="lazy"/></button>{photo.url !== primaryUrl && photo.id !== 'avatar' && <button type="button" className="set-profile-photo" onClick={() => void onSetProfilePhoto(photo.id)} aria-label="Set as profile photo">Set as profile</button>}{photo.id !== 'avatar' && <button type="button" className="delete-photo" aria-label="Delete photo" onClick={() => void onDelete(photo.id)}><X size={15}/></button>}</div>)}</div> : <div className="profile-showcase-photo-empty"><ImageIcon size={25}/><b>No photos yet</b><span>Add a few photos to your profile.</span><button type="button" onClick={() => photoInput.current?.click()}><Plus size={15}/>Add photos</button></div>}
        </section>
        </div>
        {creatorPanelVisited && <div className={`profile-showcase-creator-panel${creatorView!=='overview'?' is-current':' is-hidden'}`} aria-hidden={creatorView==='overview'}><CreatorEarningsInline view={creatorView} onView={setCreatorView} earningsAvailable={!data.user.isGuest}/></div>}
      </div>
    </div>
    <Modal open={Boolean(storyGroup)} onClose={() => setStoryGroup(null)} label="Story viewer" className="profile-story-viewer"><div className="profile-story-progress">{storyGroup?.items.map((_, index) => <i key={index} className={index <= storyIndex ? 'done' : ''}/>)}</div><header><span>{storyGroup?.avatar && <img src={storyGroup.avatar} alt=""/>}{storyGroup?.name}</span><div><button type="button" onClick={()=>setStoryPaused(value=>!value)} aria-label={storyPaused?'Play story':'Pause story'}>{storyPaused?<Play size={17}/>:<Pause size={17}/>}</button><button type="button" onClick={()=>setStoryMuted(value=>!value)} aria-label={storyMuted?'Unmute story':'Mute story'}>{storyMuted?<VolumeX size={17}/>:<Volume2 size={17}/>}</button><button type="button" onClick={() => setStoryGroup(null)} aria-label="Close stories"><X/></button></div></header>{storyGroup?.items[storyIndex] && <>{storyGroup.items[storyIndex].mediaType === 'video' ? <video key={storyGroup.items[storyIndex].id} src={storyGroup.items[storyIndex].mediaUrl} autoPlay={!storyPaused} muted={storyMuted} playsInline onEnded={() => advanceStory(1)} onClick={()=>setStoryPaused(value=>!value)}/> : <img className="story-media" src={storyGroup.items[storyIndex].mediaUrl} alt={storyGroup.name+"'s story"}/>}<button className="story-prev" type="button" onClick={() => advanceStory(-1)} aria-label="Previous story"><ChevronLeft/></button><button className="story-next" type="button" onClick={() => advanceStory(1)} aria-label="Next story"><ChevronRight/></button>{storyGroup.items[storyIndex].caption&&<p className="profile-story-caption">{storyGroup.items[storyIndex].caption}</p>}{storyGroup.userId === data.user.id && <div className="story-owner-actions"><button type="button" disabled={busy} onClick={() => void useStoryAsProfile(storyGroup.items[storyIndex])}><Camera size={14}/>{busy ? 'Preparing…' : 'Set as profile photo'}</button><button type="button" onClick={() => void removeStory(storyGroup.items[storyIndex])}>Delete story</button></div>}</>}</Modal>
    <Modal open={photoIndex !== null} onClose={() => setPhotoIndex(null)} label="Photo viewer" className="profile-photo-viewer"><button type="button" className="photo-viewer-close" onClick={() => setPhotoIndex(null)} aria-label="Close photo"><X/></button>{photoIndex !== null && ownPhotos[photoIndex] && <><img src={ownPhotos[photoIndex].url} alt={`${data.user.displayName} photo`}/>{ownPhotos.length > 1 && <><button type="button" className="photo-viewer-prev" onClick={() => setPhotoIndex((photoIndex - 1 + ownPhotos.length) % ownPhotos.length)} aria-label="Previous photo"><ChevronLeft/></button><button type="button" className="photo-viewer-next" onClick={() => setPhotoIndex((photoIndex + 1) % ownPhotos.length)} aria-label="Next photo"><ChevronRight/></button></>}<button type="button" className="photo-viewer-set-profile" disabled={ownPhotos[photoIndex].url===primaryUrl||ownPhotos[photoIndex].id==='avatar'} onClick={()=>ownPhotos[photoIndex].id!=='avatar'&&void onSetProfilePhoto(ownPhotos[photoIndex].id)}><Camera size={15}/>Set as profile photo</button></>}</Modal>
  </main>;
}
