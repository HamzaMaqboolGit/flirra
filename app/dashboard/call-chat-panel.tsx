'use client';

import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Languages, MessageCircle, Search, Send, Smile, X } from 'lucide-react';
import TypingIndicator from '../ui/typing-indicator';

export type LiveChatMessage = { id: string; senderId: string; text: string; createdAt: string; delivery?: 'sending' | 'sent' | 'delivered' | 'failed' };

const emojiGroups: Record<string, string[]> = {
  Recent: ['😊','❤️','😂','😍','✨','👋','🥰','😉'],
  Smileys: ['😊','😂','😍','🥰','😉','😎','🥹','😄','🤗','😘','😇','🤩'],
  Hearts: ['❤️','💜','🩷','💖','💕','💘','💝','💗','🫶','💞','❣️','💓'],
  Travel: ['✈️','🌍','🏖️','🌅','🗺️','🚗','🏝️','⛵','🌴','🏔️','🎒','📸'],
  Food: ['🍰','🍓','🍕','🍜','☕','🍷','🍦','🍣','🥂','🍩','🧁','🍒'],
};
const languages = [['en','English'],['es','Spanish'],['fr','French'],['de','German'],['it','Italian'],['pt','Portuguese'],['ar','Arabic'],['ur','Urdu'],['hi','Hindi'],['ko','Korean'],['ja','Japanese'],['zh','Chinese']] as const;

export default function CallChatPanel({ callId, messages, partnerTyping, selfId, partnerName, onSend, onTyping, onClose }: {
  callId: string; messages: LiveChatMessage[]; partnerTyping: boolean; selfId: string; partnerName: string;
  onSend: (text: string) => void; onTyping: (typing: boolean) => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [emojiCategory, setEmojiCategory] = useState('Recent');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [language, setLanguage] = useState('en');
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [translations, setTranslations] = useState<Record<string,string>>({});
  const [showOriginal, setShowOriginal] = useState<Record<string,boolean>>({});
  const [translationError, setTranslationError] = useState('');
  const [newCount, setNewCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const emojiPopupRef = useRef<HTMLDivElement>(null);
  const translatePopupRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const previousCount = useRef(messages.length);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollToLatest = (behavior: ScrollBehavior = 'auto') => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: Math.max(0, element.scrollHeight - element.clientHeight), behavior });
  };

  // Run after the DOM commit so the scroll height includes the newly rendered rows.
  useLayoutEffect(() => { scrollToLatest('auto'); }, []);
  const filteredEmoji = useMemo(() => {
    if (emojiQuery) return Object.values(emojiGroups).flat().filter((emoji,index,list)=>list.indexOf(emoji)===index);
    return emojiGroups[emojiCategory] || emojiGroups.Smileys;
  }, [emojiCategory, emojiQuery]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!emojiPopupRef.current?.contains(target) && !(target instanceof Element && target.closest('[aria-label="Choose emoji"]'))) setEmojiOpen(false);
      if (!translatePopupRef.current?.contains(target) && !(target instanceof Element && target.closest('.vcs-translate-trigger'))) setLanguageOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setEmojiOpen(false); setLanguageOpen(false); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);

  useEffect(() => {
    try { const saved = localStorage.getItem('velora-call-language'); if (saved) setLanguage(saved); setAutoTranslate(localStorage.getItem('velora-call-translate') === 'true'); } catch {}
  }, []);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const added = Math.max(0, messages.length - previousCount.current);
    if (added && pinnedRef.current) scrollToLatest('auto');
    else if (added) setNewCount(value => value + added);
    previousCount.current = messages.length;
  }, [messages, partnerTyping]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { if (pinnedRef.current) scrollToLatest('auto'); });
    observer.observe(element);
    const observeContent = () => {
      for (const child of element.children) observer.observe(child);
      for (const image of element.querySelectorAll('img')) observer.observe(image);
    };
    observeContent();
    const mutationObserver = new MutationObserver(observeContent);
    mutationObserver.observe(element, { childList: true, subtree: true });
    if (bottomRef.current) observer.observe(bottomRef.current);
    return () => { observer.disconnect(); mutationObserver.disconnect(); };
  }, [messages, translations, partnerTyping]);

  useEffect(() => {
    if (!autoTranslate) return;
    const pending = messages.filter(message => message.senderId !== selfId && !translations[message.id]);
    for (const message of pending) {
      void fetch('/api/calls/translate', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({callId,text:message.text,target:language}) })
        .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Translation is unavailable.'); setTranslations(current => ({...current,[message.id]:data.translation})); setTranslationError(''); })
        .catch(error => setTranslationError(error instanceof Error ? error.message : 'Translation is unavailable.'));
    }
  }, [autoTranslate, callId, language, messages, selfId, translations]);

  function addEmoji(emoji: string) {
    const input = inputRef.current; const start = input?.selectionStart ?? text.length; const end = input?.selectionEnd ?? text.length;
    setText(value => `${value.slice(0,start)}${emoji}${value.slice(end)}`);
    try { const used=JSON.parse(localStorage.getItem('velora-recent-emojis')||'[]') as string[]; localStorage.setItem('velora-recent-emojis',JSON.stringify([emoji,...used.filter(item=>item!==emoji)].slice(0,12))); } catch {}
    requestAnimationFrame(()=>{input?.focus();input?.setSelectionRange(start+emoji.length,start+emoji.length)});
  }
  function submit(event: FormEvent) { event.preventDefault(); const message=text.trim(); if(!message)return; pinnedRef.current=true;setNewCount(0);onSend(message);setText('');onTyping(false); }
  function chooseLanguage(value:string) { setLanguage(value); setLanguageOpen(false); try{localStorage.setItem('velora-call-language',value)}catch{} setTranslations({}); }
  function toggleTranslate(value:boolean) { setAutoTranslate(value); try{localStorage.setItem('velora-call-translate',String(value))}catch{} }


  return <section className="vcs-chat vcs-glass" aria-label="Live chat" ref={popupRef}>
    <header className="vcs-chat-header"><span><MessageCircle size={16}/> Live Chat</span><div className="vcs-chat-head-actions">
      <button className="vcs-translate-trigger" aria-expanded={languageOpen} onClick={()=>{setLanguageOpen(value=>!value);setEmojiOpen(false)}}><Languages size={15}/><span>Translate</span></button>
      {languageOpen&&<div className="vcs-translate-menu" ref={translatePopupRef}><label>Translate to<select value={language} onChange={event=>chooseLanguage(event.target.value)}>{languages.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label className="vcs-auto-translate"><span><b>Auto translate</b><small>Translate incoming messages</small></span><input type="checkbox" checked={autoTranslate} onChange={event=>toggleTranslate(event.target.checked)}/></label>{translationError&&<small role="status">{translationError}</small>}</div>}
      <button onClick={onClose} aria-label="Close chat"><X size={18}/></button>
    </div></header>
    <div className="vcs-chat-messages" ref={scrollRef} onScroll={event=>{const el=event.currentTarget;const nearBottom=el.scrollHeight-el.scrollTop-el.clientHeight<48;pinnedRef.current=nearBottom;if(nearBottom)setNewCount(0)}}>
      {messages.length===0&&<p className="vcs-chat-empty">Say hello. Messages are only available during this call.</p>}
      {messages.map(message=><div key={message.id} className={`vcs-message${message.senderId===selfId?' is-mine':''}`}><span>{!showOriginal[message.id]&&translations[message.id]?translations[message.id]:message.text}</span>{translations[message.id]&&<button className="vcs-message-original" onClick={()=>setShowOriginal(value=>({...value,[message.id]:!value[message.id]}))}>{showOriginal[message.id]?'Show translation':'Translated · Show original'}</button>}<small>{new Date(message.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}{message.senderId===selfId&&<i className={message.delivery==='failed'?'is-failed':''}>{message.delivery==='sending'?' · Sending':message.delivery==='delivered'?' · Delivered':message.delivery==='failed'?' · Not delivered':' · Sent'}</i>}</small></div>)}
      {partnerTyping&&<TypingIndicator label={`${partnerName} is typing…`} />}
      <div ref={bottomRef} aria-hidden="true" />
      {newCount>0&&<button className="vcs-new-messages" onClick={()=>{pinnedRef.current=true;setNewCount(0);scrollToLatest('smooth')}}>↓ {newCount} new {newCount===1?'message':'messages'}</button>}
    </div>
    <form className="vcs-chat-composer" onSubmit={submit}>
      <div className="vcs-chat-tools">
        <button type="button" aria-label="Choose emoji" aria-expanded={emojiOpen} onClick={()=>{setEmojiOpen(value=>!value);setLanguageOpen(false)}}><Smile size={17}/></button>
        {emojiOpen&&<div className="vcs-emoji-popover" ref={emojiPopupRef}><div className="vcs-picker-tabs"><button type="button" className="is-active">Emojis</button></div><label><Search size={14}/><input value={emojiQuery} onChange={event=>setEmojiQuery(event.target.value)} placeholder="Search emoji"/></label><nav>{Object.keys(emojiGroups).map(category=><button type="button" className={emojiCategory===category?'is-active':''} key={category} onClick={()=>{setEmojiCategory(category);setEmojiQuery('')}}>{category}</button>)}</nav><div>{(emojiCategory==='Recent'&&!emojiQuery?(()=>{try{return JSON.parse(localStorage.getItem('velora-recent-emojis')||'[]') as string[]}catch{return emojiGroups.Recent}})():filteredEmoji).map((emoji,index)=><button type="button" key={`${emoji}-${index}`} onClick={()=>addEmoji(emoji)}>{emoji}</button>)}</div></div>}

      </div>
      <textarea ref={inputRef} aria-label="Message" value={text} rows={1} onChange={event=>{setText(event.target.value);onTyping(Boolean(event.target.value.trim()))}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit()}}} maxLength={500} placeholder="Type a message…"/>
      <button type="submit" disabled={!text.trim()} aria-label="Send message"><Send size={16}/></button>
    </form>
  </section>;
}
