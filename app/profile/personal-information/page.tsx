'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BadgeCheck, Building2, CalendarDays, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Flag, Gift, Heart, MapPin, Share2, ShieldBan, UserRound, Video, X } from 'lucide-react';
import CountrySelect from '@/app/country-select';
import { useDialog } from '@/app/ui/dialog-provider';
import UserNavigation from '@/app/user-navigation';
import { readApiJson } from '@/lib/client-api';
import { countryName } from '@/lib/countries';

type Photo = { id: string; url: string; position: number };
type ProfileData = {
  user: { id: string; displayName: string; username?: string | null; dateOfBirth: string | null; emailVerifiedAt: string | null; isGuest: boolean; role: string };
  profile: { bio: string; country: string; city: string; interests: string[]; avatarUrl: string | null; online: boolean; discoverable: boolean };
  photos: Photo[]; social?: { followers: number; following: number };
};
type Values = { name: string; username: string; dob: string; gender: 'MALE'|'FEMALE'; country: string; city: string; bio: string };

function ageFrom(value: string) {
  if (!value) return null; const birth = new Date(`${value}T00:00:00Z`); if (Number.isNaN(birth.getTime())) return null;
  const now = new Date(); let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}
function DobPicker({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  const initial=value?new Date(`${value}T00:00:00`):new Date(2000,0,1); const [open,setOpen]=useState(false); const [month,setMonth]=useState(initial.getMonth()); const [year,setYear]=useState(initial.getFullYear());
  const selected=value?new Date(`${value}T00:00:00`):null; const today=new Date(); const maxYear=today.getFullYear()-18; const firstDay=new Date(year,month,1).getDay(); const days=new Date(year,month+1,0).getDate(); const monthLabel=new Intl.DateTimeFormat('en',{month:'long'}).format(new Date(year,month,1));
  function step(delta:number){const next=new Date(year,month+delta,1);if(next.getFullYear()>maxYear||next.getFullYear()<1900)return;setMonth(next.getMonth());setYear(next.getFullYear())}
  return <div className="dob-picker"><button type="button" className="personal-info-control dob-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(current=>!current)}><CalendarDays size={16}/><span>{selected?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}).format(selected):'Select your date of birth'}</span><ChevronDown size={15}/></button>{open&&<div className="dob-calendar" role="dialog" aria-label="Choose date of birth"><header><button type="button" onClick={()=>step(-1)} aria-label="Previous month"><ChevronLeft size={16}/></button><b>{monthLabel} {year}</b><button type="button" onClick={()=>step(1)} disabled={year===maxYear&&month>=today.getMonth()} aria-label="Next month"><ChevronRight size={16}/></button></header><div className="dob-weekdays">{'SMTWTFS'.split('').map((day,index)=><span key={`${day}-${index}`}>{day}</span>)}</div><div className="dob-days">{Array.from({length:firstDay},(_,index)=><i key={`blank-${index}`}/>)}{Array.from({length:days},(_,index)=>{const day=index+1;const future=new Date(year,month,day)>new Date(maxYear,today.getMonth(),today.getDate());const isSelected=Boolean(selected&&selected.getFullYear()===year&&selected.getMonth()===month&&selected.getDate()===day);return <button key={day} type="button" disabled={future} className={isSelected?'selected':''} onClick={()=>{onChange(`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`);setOpen(false)}}>{day}</button>})}</div></div>}</div>
}
function GenderPicker({value,onChange}:{value:Values['gender'];onChange:(value:Values['gender'])=>void}) {
  const [open,setOpen]=useState(false); const choices:[Values['gender'],string][]=[['MALE','Male'],['FEMALE','Female']];
  return <div className="gender-picker"><button type="button" className="gender-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={()=>setOpen(current=>!current)}><span>{choices.find(([key])=>key===value)?.[1]}</span><ChevronDown size={15}/></button>{open&&<div className="gender-options" role="listbox" aria-label="Gender">{choices.map(([key,label])=><button type="button" role="option" aria-selected={value===key} className={value===key?'selected':''} key={key} onClick={()=>{onChange(key);setOpen(false)}}>{label}{value===key&&<Check size={14}/>}</button>)}</div>}</div>
}
function tintFromImage(url: string | null, set: (color: string) => void) {
  if (!url) { set('var(--velora-subtle, #f5f3f7)'); return; }
  const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { try { const canvas=document.createElement('canvas');canvas.width=12;canvas.height=12;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error();ctx.drawImage(img,0,0,12,12);const px=ctx.getImageData(0,0,12,12).data;let r=0,g=0,b=0,n=0;for(let i=0;i<px.length;i+=16){r+=px[i];g+=px[i+1];b+=px[i+2];n++}const m=(v:number)=>Math.round(v/Math.max(1,n)*.13+255*.87);set(`rgb(${m(r)} ${m(g)} ${m(b)})`)}catch{set('var(--velora-subtle, #f5f3f7)')} };img.onerror=()=>set('var(--velora-subtle, #f5f3f7)');img.src=url;
}

export default function PersonalInformationPage() {
  const dialog=useDialog();
  const router = useRouter();
  const [data,setData]=useState<ProfileData|null>(null); const [values,setValues]=useState<Values>({name:'',username:'',dob:'',gender:'MALE',country:'',city:'',bio:''}); const [saved,setSaved]=useState('');
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [errors,setErrors]=useState<Record<string,string>>({}); const [notice,setNotice]=useState('');
  const [image,setImage]=useState<File|null>(null); const [preview,setPreview]=useState<string|null>(null); const [removePhoto,setRemovePhoto]=useState(false); const [checkingUsername,setCheckingUsername]=useState(false); const [usernameAvailable,setUsernameAvailable]=useState<boolean|null>(null); const [tint,setTint]=useState('var(--velora-subtle, #f5f3f7)');
  const token='var(--velora-button,var(--velora-primary,var(--velora-purple,#8427f5)))';
  const age=ageFrom(values.dob); const primaryPhoto=data?.profile.avatarUrl||null;
  const normalizedValues=useMemo(()=>JSON.stringify({...values,name:values.name.trim(),username:values.username.trim().toLowerCase()}),[values]);
  const dirty=Boolean(data&&normalizedValues!==saved)||Boolean(image)||removePhoto;
  const shownAvatar=preview||(removePhoto?null:primaryPhoto);

  useEffect(()=>{let active=true;fetch('/api/profile',{cache:'no-store'}).then(async response=>{if(response.status===401){location.href='/login?next=%2Fprofile%2Fpersonal-information';return null}const result=await readApiJson(response,'Could not load your personal information.') as ProfileData&{error?:string};if(!response.ok)throw Error(result.error||'Could not load your personal information.');return result}).then(result=>{if(!active||!result)return;const next:Values={name:result.user.displayName||'',username:result.user.username||'',dob:result.user.dateOfBirth?.slice(0,10)||'',gender:result.user.role==='FEMALE'?'FEMALE':'MALE',country:result.profile?.country||'',city:result.profile?.city||'',bio:result.profile?.bio||''};setData(result);setValues(next);setSaved(JSON.stringify({...next,name:next.name.trim(),username:next.username.trim().toLowerCase()}));}).catch(error=>{if(active)setErrors({page:error instanceof Error?error.message:'Could not load your personal information.'})}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
  useEffect(()=>{tintFromImage(primaryPhoto,setTint)},[primaryPhoto]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
  function set<K extends keyof Values>(key:K,value:Values[K]){setValues(current=>({...current,[key]:value}));setErrors(current=>({...current,[key]:''}));setNotice('')}
  function selectImage(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];event.target.value='';if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setErrors(current=>({...current,photo:'Choose a JPG, PNG or WebP image.'}));return}if(file.size>4*1024*1024){setErrors(current=>({...current,photo:'Photo must be 4 MB or smaller.'}));return}if(preview)URL.revokeObjectURL(preview);setImage(file);setPreview(URL.createObjectURL(file));setRemovePhoto(false);setErrors(current=>({...current,photo:''}))}
  async function checkUsername(){const username=values.username.trim().toLowerCase();if(!username||username===data?.user.username){setUsernameAvailable(true);return true}if(!/^[a-z0-9_]{3,24}$/.test(username)){setErrors(current=>({...current,username:'Use 3–24 letters, numbers, or underscores.'}));setUsernameAvailable(false);return false}setCheckingUsername(true);try{const response=await fetch(`/api/profile/username?username=${encodeURIComponent(username)}`,{cache:'no-store'});const result=await readApiJson(response,'Could not check username.') as {available?:boolean;error?:string};if(!response.ok)throw Error(result.error||'Could not check username.');setUsernameAvailable(Boolean(result.available));setErrors(current=>({...current,username:result.available?'':'That username is already taken.'}));return Boolean(result.available)}catch(error){setErrors(current=>({...current,username:error instanceof Error?error.message:'Could not check username.'}));return false}finally{setCheckingUsername(false)}}
  function validate(){const next:Record<string,string>={};if(values.name.trim().length<2)next.name='Enter your full name.';if(!/^[a-z0-9_]{3,24}$/.test(values.username.trim().toLowerCase()))next.username='Use 3–24 letters, numbers, or underscores.';if(!values.dob)next.dob='Date of birth is required.';else if((ageFrom(values.dob)??0)<18)next.dob='You must be at least 18 years old.';if(!values.country)next.country='Choose your country.';if(values.bio.length>200)next.bio='Bio must be 200 characters or fewer.';setErrors(next);return Object.keys(next).length===0}
  async function save(event:FormEvent){event.preventDefault();setNotice('');if(!validate())return;if(!await checkUsername())return;setSaving(true);try{const response=await fetch('/api/profile',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:values.name.trim(),username:values.username.trim().toLowerCase(),dateOfBirth:values.dob,role:values.gender,country:values.country,city:values.city,bio:values.bio,interests:data?.profile.interests||[],discoverable:data?.profile.discoverable??true,personalInformation:true,removeAvatar:removePhoto})});const result=await readApiJson(response,'Could not save your personal information.') as {error?:string};if(!response.ok)throw Error(result.error||'Could not save your personal information.');let avatarUrl=removePhoto?null:primaryPhoto;if(image){const form=new FormData();form.set('file',image);const upload=await fetch('/api/profile',{method:'POST',body:form});const uploaded=await readApiJson(upload,'Could not update your profile photo.') as {avatarUrl?:string;error?:string};if(!upload.ok)throw Error(uploaded.error||'Your details were saved, but the photo upload failed.');avatarUrl=uploaded.avatarUrl||null}
      const updated={...data!,user:{...data!.user,displayName:values.name.trim(),username:values.username.trim().toLowerCase(),dateOfBirth:`${values.dob}T00:00:00.000Z`,role:values.gender},profile:{...data!.profile,country:values.country,city:values.city,bio:values.bio,avatarUrl}};setData(updated);setSaved(JSON.stringify({...values,name:values.name.trim(),username:values.username.trim().toLowerCase()}));setImage(null);setPreview(null);setRemovePhoto(false);setUsernameAvailable(true);setNotice('Personal information saved.');window.dispatchEvent(new Event('focus'));setTimeout(()=>router.push('/profile'),700);
    }catch(error){setErrors(current=>({...current,form:error instanceof Error?error.message:'Could not save your changes.'}))}finally{setSaving(false)}}
  async function cancel(){if(dirty&&!await dialog.confirm({title:'Discard unsaved changes?',description:'Your edits on this page will be lost.',confirmLabel:'Discard changes',danger:true}))return;router.push('/profile')}
  async function copyProfile(){try{await navigator.clipboard.writeText(`${location.origin}/discover/${data?.user.id}`);setNotice('Profile link copied.')}catch{setNotice('Could not copy the profile link.')}}
  async function shareProfile(){try{if(navigator.share)await navigator.share({title:`${data?.user.displayName} · Velora`,url:`${location.origin}/discover/${data?.user.id}`});else await copyProfile()}catch{/* user dismissed */}}

  return <main className="profile-page profile-refresh">
    <UserNavigation active="profile" balance="Account" status="Personal information" guest={Boolean(data?.user.isGuest)}/>
    {loading?<div className="personal-info-loading">Loading your personal information…</div>:!data?<div className="personal-info-loading" role="alert">{errors.page||'Could not load your profile.'}</div>:<div className="personal-info-layout" style={{['--personal-card-tint' as string]:tint,['--personal-accent' as string]:token} as React.CSSProperties}>
      <aside className="personal-info-sidebar">
        <button className="personal-info-back" type="button" onClick={cancel}><ArrowLeft size={17}/>Back to profile</button>
        <section className="personal-info-profile-card">
          <div className="personal-info-avatar">{shownAvatar?<img src={shownAvatar} alt={`${data.user.displayName} profile photo`}/>:<span>{values.name.slice(0,1).toUpperCase()||<UserRound/>}</span>}<i className={data.profile.online?'online':''}/></div>
          <h2>{values.name||'Your name'}{age!==null&&age>=0&&<span>, {age}</span>}<span className={`profile-email-badge${data.user.emailVerifiedAt?' is-verified':''}`}><BadgeCheck size={12}/>{data.user.emailVerifiedAt?'Verified':'Unverified'}</span></h2>
          <p><MapPin size={14}/>{values.country?countryName(values.country):'Add your country'}</p><span className={`personal-info-presence${data.profile.online?' is-online':''}`}><i/>{data.profile.online?'Online':'Offline'}</span>
          <nav className="personal-info-section-links"><a className="active" aria-current="page" href="/profile/personal-information"><UserRound size={17}/>Personal Information<ChevronRight size={15}/></a><a href="/profile/account-settings"><ShieldBan size={17}/>Account Settings<ChevronRight size={15}/></a></nav>
          <div className="personal-info-stats"><span><b>{(data.social?.following||0).toLocaleString()}</b><small>Following</small></span><span><b>{(data.social?.followers||0).toLocaleString()}</b><small>Followers</small></span><span><b>{data.photos.length}</b><small>Photos</small></span></div>

          <div className="personal-info-quick-actions"><a className="primary" href="/profile/personal-information#photos"><Camera size={17}/>Manage Photos</a><a className="outline" href="/profile/account-settings"><ShieldBan size={16}/>Profile Settings</a></div>
        </section>
      </aside>
      <section className="personal-info-main">
        <header className="personal-info-heading"><button type="button" aria-label="Back to profile" onClick={cancel}><ArrowLeft size={19}/></button><div><h1>Personal Information</h1><p>Update your personal details and public profile information.</p></div><a href="/profile/account-settings">Account Settings</a></header>
        <form className="personal-info-form" onSubmit={save} noValidate>
          <section className="personal-info-photo-row"><div className="personal-info-photo">{shownAvatar?<img src={shownAvatar} alt="Current profile"/>:<span>{values.name.slice(0,1).toUpperCase()||<UserRound/>}</span>}<label aria-label="Change profile photo"><Camera size={16}/><input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage}/></label></div><div className="personal-info-photo-copy"><b>Profile Photo</b><p>This is your profile photo. It will be visible to other users.</p><div><label className="change-photo">Change Photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage}/></label><button type="button" className="remove-photo" disabled={!shownAvatar} onClick={()=>{if(preview)URL.revokeObjectURL(preview);setPreview(null);setImage(null);setRemovePhoto(true);}}> <X size={15}/>Remove Photo</button><small>{image?image.name:errors.photo||'JPG, PNG or WebP · max 4 MB'}</small></div></div></section>
          <div className="personal-info-fields">
            <label className="personal-info-field">Full Name<input autoComplete="name" value={values.name} maxLength={40} onChange={event=>set('name',event.target.value)} aria-invalid={Boolean(errors.name)}/>{errors.name&&<small className="field-error">{errors.name}</small>}</label>
            <label className="personal-info-field">Username<div className="username-input"><span>@</span><input autoComplete="username" value={values.username} maxLength={24} onChange={event=>{set('username',event.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''));setUsernameAvailable(null)}} onBlur={()=>void checkUsername()} aria-invalid={Boolean(errors.username)}/>{checkingUsername&&<i>Checking…</i>}{usernameAvailable&&values.username!==data.user.username&&<Check size={16}/>}</div>{errors.username&&<small className="field-error">{errors.username}</small>}</label>
            <label className="personal-info-field">Date of Birth{age!==null&&<span className="age-hint">Age {age}</span>}<DobPicker value={values.dob} onChange={value=>set('dob',value)}/>{errors.dob&&<small className="field-error">{errors.dob}</small>}</label>
            <label className="personal-info-field">Gender<GenderPicker value={values.gender} onChange={value=>set('gender',value)}/></label>
            <label className="personal-info-field">Country<div className="personal-info-control country-control"><MapPin size={16}/><CountrySelect id="personal-info-country" value={values.country} onChange={value=>set('country',value)} placeholder="Search countries"/></div>{errors.country&&<small className="field-error">{errors.country}</small>}</label>
            <label className="personal-info-field">City<div className="personal-info-control"><Building2 size={16}/><input autoComplete="address-level2" value={values.city} maxLength={80} onChange={event=>set('city',event.target.value)} placeholder="Your city"/></div></label>
            <label className="personal-info-field full-width" id="more-information">Bio<textarea value={values.bio} maxLength={200} onChange={event=>set('bio',event.target.value)} placeholder="Share a short introduction about yourself…"/><small className={errors.bio?'field-error':'bio-counter'}>{errors.bio||`${values.bio.length} / 200`}</small></label>
          </div>
          {errors.form&&<p className="personal-info-form-error" role="alert">{errors.form}</p>}{notice&&<p className="personal-info-notice" role="status">{notice}</p>}
          <footer className="personal-info-footer"><span>{dirty?'You have unsaved changes.':''}</span><div><button type="button" onClick={cancel} disabled={saving}>Cancel</button><button type="submit" disabled={saving||!dirty}>{saving?'Saving…':<><Check size={16}/>Save Changes</>}</button></div></footer>
        </form>
      </section>
    </div>}
  </main>;
}
