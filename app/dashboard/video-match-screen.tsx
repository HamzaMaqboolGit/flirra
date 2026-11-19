'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Coins, MapPin, UsersRound, UserRound, Video, X, Repeat2, LoaderCircle, Plus } from 'lucide-react';
import CountrySelect from '../country-select';

export type MatchProfile = { displayName: string; age?: number | null; country?: string | null; avatarUrl?: string | null };
type Props = {
  mode: 'idle' | 'searching' | 'found';
  profile?: MatchProfile | null;
  balance: string;
  gender: 'MALE' | 'FEMALE' | 'EVERYONE';
  onGenderChange: (gender: 'MALE' | 'FEMALE' | 'EVERYONE') => void;
  country?: string;
  onCountryChange?: (country: string) => void;
  accepted?: boolean;
  partnerAccepted?: boolean;
  busy?: boolean;
  demo?: boolean;
  onClose: () => void;
  onAccept: () => void;
  onNext: () => void;
  onBuyCoins: () => void;
  mediaReady?: boolean;
  mediaError?: string;
  onEnableMedia?: () => void;
  matchError?: string;
  onRetry?: () => void;
};

export default function VideoMatchScreen({ mode, profile, balance, gender, onGenderChange, country = 'Worldwide', onCountryChange, accepted = false, partnerAccepted = false, busy = false, demo = false, onClose, onAccept, onNext, onBuyCoins, mediaReady = false, mediaError = '', onEnableMedia, matchError = '', onRetry }: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!filtersRef.current?.contains(event.target as Node)) setFiltersOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFiltersOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, [filtersOpen]);

  function updateGender(value: 'MALE' | 'FEMALE' | 'EVERYONE') {
    onGenderChange(value);
    setFiltersOpen(false);
  }

  const profileName = profile?.displayName || '';
  return <main className={`vmatch-screen${demo ? ' is-demo' : ''}${mode==='idle'?' is-idle':''}`}>
    {mode==='found'&&profile?.avatarUrl&&<><div className="vmatch-backdrop" key={profile.avatarUrl}><img src={profile.avatarUrl} alt=""/></div><div className="vmatch-backdrop-shade"/></>}
    <header className="vmatch-topbar">
      <button className="vmatch-icon-button" type="button" aria-label="Close matching" onClick={onClose}><X size={21}/></button>
      <div className="vmatch-filter-wrap" ref={filtersRef}>
        <button className={`vmatch-filter-button${filtersOpen ? ' is-open' : ''}`} type="button" aria-expanded={filtersOpen} aria-haspopup="dialog" onClick={() => setFiltersOpen(value => !value)}>{gender==='EVERYONE'?<UsersRound size={19}/>:<UserRound size={19}/>}<span>{gender==='MALE'?'Men':gender==='FEMALE'?'Women':'Everyone'}</span><ChevronDown size={17}/></button>
        {filtersOpen && <div className="vmatch-filter-menu" role="dialog" aria-label="Matching preferences">
          <span className="vmatch-filter-label">Who would you like to meet?</span>
          <div className="vmatch-gender-options" role="radiogroup" aria-label="Who to meet" onKeyDown={event=>{if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const options=['EVERYONE','MALE','FEMALE'] as const;const current=options.indexOf(gender);const delta=event.key==='ArrowDown'||event.key==='ArrowRight'?1:-1;const next=options[(current+delta+options.length)%options.length];updateGender(next);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>(`[data-match-gender="${next}"]`)?.focus())}}>
            {([{value:'EVERYONE',label:'Everyone',icon:<UsersRound size={18}/>},{value:'MALE',label:'Men',icon:<UserRound size={18}/>},{value:'FEMALE',label:'Women',icon:<UserRound size={18}/>} ] as const).map(option=><button type="button" role="radio" aria-checked={gender===option.value} tabIndex={gender===option.value?0:-1} data-match-gender={option.value} className={`vmatch-gender-option${gender===option.value?' is-selected':''}`} key={option.value} onClick={()=>updateGender(option.value)}>{option.icon}<span>{option.label}</span><i aria-hidden="true">{gender===option.value&&<Check size={14}/>}</i></button>)}
          </div>
          {onCountryChange&&<div className="vmatch-country-setting"><span className="vmatch-filter-label">Country</span><CountrySelect id="matching-country" value={country} onChange={onCountryChange} worldwide placeholder="Search country"/></div>}
        </div>}
      </div>
      <div className="vmatch-wallet"><span><Coins size={17}/><b>{balance}</b></span><button type="button" onClick={onBuyCoins} aria-label="Buy coins in a new tab"><Plus size={19}/></button></div>
    </header>

    <section className={`vmatch-content ${mode === 'found' ? 'has-profile' : mode==='idle'?'is-ready':'is-searching'}`} aria-live="polite">
      {mode==='idle'?<div className="vmatch-ready-state"><span className="vmatch-ready-orbit"><i/><i/><b><Video size={30}/></b></span><span className="vmatch-ready-eyebrow">FLIRRA · RANDOM VIDEO CHAT</span><h1>Ready to meet someone?</h1><p>Choose your preferences, then start matching when you’re ready.</p><button type="button" className="vmatch-start" disabled={busy} onClick={onNext}>{busy?<LoaderCircle size={18} className="vmatch-inline-spin"/>:<Video size={19}/>} {busy?'Getting things ready…':'Start Random Call'} {!busy&&<ChevronDown className="vmatch-start-arrow" size={17}/>}</button>{matchError&&<p className="vmatch-match-error" role="alert">{matchError}</p>}</div>:mode === 'found' && profile ? <>
        <article className="vmatch-profile-card">
          {profile.avatarUrl ? <img className="vmatch-profile-image" src={profile.avatarUrl} alt={`${profileName}'s profile`} /> : <div className="vmatch-profile-placeholder"><UsersRound size={36}/></div>}
          <div className="vmatch-profile-caption">
            <div className="vmatch-profile-name"><i/><div><b>{profileName}{profile.age ? `, ${profile.age}` : ''}</b>{profile.country && <small><MapPin size={13}/>{profile.country}</small>}</div></div>
            <span className="vmatch-online"><i/>Online</span>
          </div>
          {demo && <span className="vmatch-demo-tag">DEMO</span>}
        </article>
        <div className="vmatch-actions">
          <button type="button" className="vmatch-accept" disabled={busy || accepted} onClick={onAccept}>{accepted ? <Check size={21}/> : <Video size={21}/>}<span>{accepted ? 'Accepted' : 'Accept Call'}</span></button>
          <button type="button" className="vmatch-next" disabled={busy} onClick={onNext}><Repeat2 size={20}/><span>Next</span></button>
        </div>
        {!mediaReady && onEnableMedia && <button type="button" className="vmatch-media-prompt" onClick={onEnableMedia}><Video size={15}/>{mediaError || 'Enable camera and microphone for your call'}</button>}
        {matchError && <p className="vmatch-match-error" role="alert">{matchError}</p>}
        {accepted && <p className="vmatch-waiting">{partnerAccepted ? 'Connecting…' : 'Waiting for the other person…'}</p>}
      </> : <div className="vmatch-search-state"><span className="vmatch-spinner"><LoaderCircle size={29}/></span><b>Finding someone for you...</b><small>Connecting you with someone new</small>{matchError&&<p className="vmatch-match-error" role="alert">{matchError}</p>}{!mediaReady&&onEnableMedia&&<button type="button" className="vmatch-media-prompt" onClick={onEnableMedia}><Video size={15}/>{mediaError || 'Enable camera and microphone for your call'}</button>}{matchError&&<button type="button" className="vmatch-cancel" onClick={onRetry}>{busy?'Searching…':'Try again'}</button>}<button type="button" className="vmatch-cancel" onClick={onClose}>Cancel</button></div>}
    </section>
  </main>;
}
