'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import OnboardingFlow from './onboarding/onboarding-flow';
import { readApiJson } from '@/lib/client-api';
import { usePathname } from 'next/navigation';

type Milestone='SECOND_CALL'|'FIRST_PURCHASE';
export default function GuestMilestoneProvider({children}:{children:React.ReactNode}){
 const [open,setOpen]=useState<Milestone|null>(null);const checking=useRef(false);
 const pathname=usePathname();
 const check=useCallback(async()=>{if(checking.current||document.visibilityState!=='visible'||pathname?.startsWith('/onboarding'))return;checking.current=true;try{const response=await fetch('/api/auth/milestones',{cache:'no-store'});if(response.status===401){setOpen(null);return}const value=await readApiJson(response,'Could not check account milestones.') as {guest?:boolean;milestone?:Milestone|null};if(!response.ok||!value.guest){setOpen(null);return}if(value.milestone)setOpen(current=>current||value.milestone||null)}catch{}finally{checking.current=false}},[pathname]);
 useEffect(()=>{void check();const timer=window.setInterval(()=>void check(),7000);const changed=()=>{if(document.visibilityState==='visible')void check()};document.addEventListener('visibilitychange',changed);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',changed)}},[check]);
 const dismiss=useCallback(async()=>{const key=open;setOpen(null);if(key)await fetch('/api/auth/milestones',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({milestone:key})}).catch(()=>undefined)},[open]);
 return <>{children}{open&&!pathname?.startsWith('/onboarding')&&<OnboardingFlow embedded onClose={()=>void dismiss()} onComplete={()=>void dismiss()}/>}</>;
}
