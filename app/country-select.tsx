'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Globe2, X } from 'lucide-react';
import { ISO_COUNTRIES, countryCode, countryFlag, countryName } from '@/lib/countries';
import { AnimatePresence, AnimatedDropdown } from './ui/motion-system';

export default function CountrySelect({id,name,value,onChange,placeholder='Search countries',worldwide=false,required=false}:{id:string;name?:string;value:string;onChange:(value:string)=>void;placeholder?:string;worldwide?:boolean;required?:boolean}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);const root=useRef<HTMLDivElement>(null);const input=useRef<HTMLInputElement>(null);
 const options=useMemo(()=>{const all=[...(worldwide?[{code:'Worldwide',name:'Worldwide'}]:[]),...ISO_COUNTRIES];const q=query.trim().toLocaleLowerCase();return q?all.filter(item=>item.name.toLocaleLowerCase().includes(q)||item.code.toLocaleLowerCase().includes(q)):all},[query,worldwide]);
 useEffect(()=>{const handle=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};document.addEventListener('pointerdown',handle);return()=>document.removeEventListener('pointerdown',handle)},[]);
 function select(code:string){onChange(code);setQuery('');setOpen(false);input.current?.blur()}
 function keyDown(event:React.KeyboardEvent<HTMLInputElement>){if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);setActive(index=>Math.min(index+1,options.length-1))}else if(event.key==='ArrowUp'){event.preventDefault();setActive(index=>Math.max(0,index-1))}else if(event.key==='Enter'&&open&&options[active]){event.preventDefault();select(options[active].code)}else if(event.key==='Escape'){setOpen(false);setQuery('')}}
 return <div className="country-select" ref={root}>
  <div className="country-select-input">
   {value&&<span className="country-selected-flag" aria-hidden="true">{value==='Worldwide'?<Globe2 size={15}/>:countryFlag(value)}</span>}
   <input ref={input} id={id} name={name} required={required} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open&&options[active]?`${id}-option-${active}`:undefined} value={open?query:(value?countryName(value):'')} placeholder={open?placeholder:(value?countryName(value):placeholder)} onFocus={()=>{setQuery('');setOpen(true);setActive(0)}} onChange={e=>{setQuery(e.target.value);setActive(0);setOpen(true)}} onKeyDown={keyDown}/>
   {value&&<button type="button" className="country-clear" aria-label="Clear country" onClick={()=>{onChange('');setQuery('');setOpen(true);input.current?.focus()}}><X size={13}/></button>}
   <button type="button" className="country-toggle" aria-label={open?'Close country list':'Open country list'} onClick={()=>{setOpen(v=>!v);input.current?.focus()}}><ChevronDown size={15}/></button>
  </div>
  <AnimatePresence initial={false}>{open&&<AnimatedDropdown className="country-options" id={`${id}-options`} role="listbox" aria-label="Countries">
   {options.length?options.map((item,index)=>{const selected=item.code==='Worldwide'?value==='Worldwide':countryCode(value)===item.code;return <button type="button" role="option" aria-selected={selected} id={`${id}-option-${index}`} className={index===active?'active':''} key={item.code} onMouseEnter={()=>setActive(index)} onClick={()=>select(item.code)}><span>{item.code==='Worldwide'?<Globe2 size={15}/>:countryFlag(item.code)}</span><span>{item.name}</span><small>{item.code!=='Worldwide'?item.code:''}</small>{selected&&<Check size={14}/>}</button>}):<p>No countries match “{query}”.</p>}
  </AnimatedDropdown>}</AnimatePresence>
 </div>;
}
