'use client';

import { type PointerEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Coins, Flag, Heart, MessageCircle, Mic, MicOff, MoreHorizontal, PhoneOff, Plus, Repeat2, Smile, Video, VideoOff } from 'lucide-react';

export type VideoCallStageProps = {
  name: string; age?: number | null; avatar?: string | null; onlineLabel?: string;
  duration: string; balance: string; remote: ReactNode; local: ReactNode;
  micOn: boolean; cameraOn: boolean; remoteMuted?: boolean; quality?: 'HD' | null;
  following?: boolean; unread?: number; chatOpen?: boolean; chatPanel?: ReactNode;
  giftPanel?: ReactNode; emojiPanel?: ReactNode; walletPanel?: ReactNode; moreOpen?: boolean; morePanel?: ReactNode;
  modalPanel?: ReactNode; modalOpen?: boolean; error?: string; onFollow?: () => void;
  onMic: () => void; onCamera: () => void; onSwitch: () => void; onEnd: () => void;
  onReport: () => void; onMore: () => void; onNext: () => void; onChat: () => void;
  onGift: () => void; onEmoji: () => void; onAddCoins: () => void;
  onFullscreen: () => void; onVolume: () => void; onCloseOverlays: () => void;
};

export default function VideoCallStage(props: VideoCallStageProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [collisionPosition, setCollisionPosition] = useState<{ x: number; y: number } | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [toolbarDim, setToolbarDim] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const localRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const moreMenu = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const chatMountedRef = useRef(Boolean(props.chatOpen));
  const [chatMounted, setChatMounted] = useState(Boolean(props.chatOpen));
  const [chatClosing, setChatClosing] = useState(false);
  const [reaction, setReaction] = useState('');
  const [swapped, setSwapped] = useState(false);
  const dragged = useRef(false);
  const idleTimer = useRef<number | null>(null);
  const overlaysOpen = Boolean(props.chatOpen || props.giftPanel || props.emojiPanel || props.walletPanel || props.moreOpen || props.modalOpen);

  useEffect(() => {
    if (props.chatOpen) { chatMountedRef.current = true; setChatMounted(true); setChatClosing(false); return; }
    if (!chatMountedRef.current) return;
    setChatClosing(true);
    const timer = window.setTimeout(() => { chatMountedRef.current = false; setChatMounted(false); setChatClosing(false); }, 180);
    return () => window.clearTimeout(timer);
  }, [props.chatOpen]);

  const clampPosition = useCallback((x: number, y: number) => {
    const stage = stageRef.current?.getBoundingClientRect();
    const preview = swapped ? remoteRef.current : localRef.current;
    if (!stage || !preview) return;
    const width = preview.offsetWidth, height = preview.offsetHeight;
    setPosition({ x: Math.max(16, Math.min(stage.width - width - 16, x)), y: Math.max(16, Math.min(stage.height - height - 76, y)) });
  }, [swapped]);
  const remoteRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const resize = () => { if (position) clampPosition(position.x, position.y); };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [position, clampPosition]);

  useLayoutEffect(() => {
    const hasPanels = Boolean(props.giftPanel || props.chatOpen);
    const evaluate = () => {
      if (!hasPanels) { setCollisionPosition(current => current ? null : current); return; }
      const stage = stageRef.current?.getBoundingClientRect();
      const previewEl = swapped ? remoteRef.current : localRef.current;
      const preview = previewEl?.getBoundingClientRect();
      if (!stage || !preview) return;
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const width = previewEl!.offsetWidth, height = previewEl!.offsetHeight;
      const blockers = Array.from(stageRef.current!.querySelectorAll('.vcs-call-gift-picker,.vcs-chat-shell:not(.is-closing) .vcs-chat,.vcs-controls,.vcs-participant,.vcs-meta,.vcs-tools,.vcs-balance,.vcs-more'))
        .map(element => element.getBoundingClientRect())
        .filter(box => box.width > 0 && box.height > 0)
        .map(box => new DOMRect(box.left - 16, box.top - 16, box.width + 32, box.height + 32));
      // The user position is authoritative; collisionPosition is temporary while panels are open.
      const current = position;
      const currentBox = current ? new DOMRect(stage.left + current.x, stage.top + current.y, width, height) : preview;
      if (!blockers.some(blocker => overlaps(currentBox, blocker))) { setCollisionPosition(current => current ? null : current); return; }
      const bottom = stage.height - height - 16;
      const right = stage.width - width - 16;
      const safeRight = Math.max(16, right), safeBottom = Math.max(16, bottom);
      const corners = [{x:16,y:safeBottom},{x:safeRight,y:safeBottom},{x:safeRight,y:16},{x:16,y:16}];
      const gift = stageRef.current!.querySelector('.vcs-call-gift-picker')?.getBoundingClientRect();
      const preferred = gift && gift.width && gift.height
        ? [{x:16,y:gift.bottom-stage.top+16}, {x:safeRight,y:gift.bottom-stage.top+16}, ...corners]
        : props.chatOpen ? [corners[0],corners[1],corners[3],corners[2]] : corners;
      const bounded = [...preferred, ...corners].map(point => ({x:Math.max(16,Math.min(safeRight,point.x)),y:Math.max(16,Math.min(safeBottom,point.y))}));
      for (const y of [Math.max(16, (safeBottom + 16) / 2), safeBottom]) for (const x of [16,safeRight]) bounded.push({x,y});
      if (props.giftPanel && props.chatOpen) bounded.push({x:Math.max(16,Math.min(safeRight,(stage.width-width)/2)),y:16});
      const available = bounded.find(point => {
        const box = new DOMRect(stage.left + point.x, stage.top + point.y, width, height);
        return blockers.every(blocker => !overlaps(box, blocker));
      });
      if (available) setCollisionPosition(current => current?.x === available.x && current?.y === available.y ? current : available);
    };
    let frame = requestAnimationFrame(evaluate);
    const recalculate = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(evaluate); };
    window.addEventListener('resize', recalculate);
    window.addEventListener('orientationchange', recalculate);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', recalculate); window.removeEventListener('orientationchange', recalculate); };
  }, [Boolean(props.giftPanel), Boolean(props.chatOpen), swapped, position, collisionPosition, layoutVersion]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { if (props.giftPanel || props.chatOpen) setLayoutVersion(value => value + 1); });
    observer.observe(stage);
    for (const element of stage.querySelectorAll('.vcs-call-gift-picker,.vcs-chat,.vcs-controls,.vcs-participant')) observer.observe(element);
    return () => observer.disconnect();
  }, [Boolean(props.giftPanel), Boolean(props.chatOpen), swapped]);

  useEffect(() => {
    const receiveReaction = (event: Event) => {
      const emoji = (event as CustomEvent<string>).detail;
      if (typeof emoji === 'string') { setReaction(emoji); window.setTimeout(() => setReaction(current => current === emoji ? '' : current), 1600); }
    };
    window.addEventListener('velora-call-reaction', receiveReaction);
    return () => window.removeEventListener('velora-call-reaction', receiveReaction);
  }, []);

  useEffect(() => {
    if (!overlaysOpen) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement;
      if (moreButton.current?.contains(target)) return;
      if (target.closest('.vcs-controls') || target.closest('.vcs-balance')) {
        if (props.moreOpen) props.onMore();
        return;
      }
      const inMore = moreMenu.current?.contains(target) || moreButton.current?.contains(target);
      const inOverlay = target.closest('.vcs-chat') || target.closest('.vcs-call-gift-picker') || target.closest('.vcs-call-emoji-picker') || target.closest('.vcs-wallet-backdrop') || target.closest('.vcs-wallet-panel') || target.closest('.vcs-confirm-dialog') || target.closest('.vcs-call-modal');
      if (!inMore && !inOverlay) props.onCloseOverlays();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); props.onCloseOverlays(); moreButton.current?.focus(); } };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [overlaysOpen, props.onCloseOverlays]);

  const showToolbar = useCallback(() => {
    setToolbarDim(false);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => { if (!overlaysOpen) setToolbarDim(true); }, 4200);
  }, [overlaysOpen]);
  useEffect(() => { showToolbar(); return () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); }; }, [showToolbar]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    event.preventDefault();
    event.stopPropagation();
    const box = event.currentTarget.getBoundingClientRect();
    dragged.current = false;
    setCollisionPosition(null);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId || !stageRef.current) return;
    event.preventDefault(); event.stopPropagation();
    const stage = stageRef.current.getBoundingClientRect();
    const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragged.current = true;
    clampPosition(drag.current.left - stage.left + dx, drag.current.top - stage.top + dy);
  }
  function endDrag(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (drag.current?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (dragged.current && stageRef.current) {
        const stage = stageRef.current.getBoundingClientRect(), preview = (swapped ? remoteRef.current : localRef.current)?.getBoundingClientRect();
        if (preview) {
          const width = preview.width, height = preview.height;
          const right=Math.max(16,stage.width-width-16), bottom=Math.max(16,stage.height-height-76);
          const corners = [{x:16,y:bottom},{x:right,y:bottom},{x:right,y:16},{x:16,y:16}].sort((a,b)=>Math.hypot(a.x-(preview.left-stage.left),a.y-(preview.top-stage.top))-Math.hypot(b.x-(preview.left-stage.left),b.y-(preview.top-stage.top)));
          const blockers = Array.from(stageRef.current.querySelectorAll('.vcs-call-gift-picker,.vcs-chat-shell:not(.is-closing) .vcs-chat,.vcs-controls,.vcs-participant,.vcs-meta,.vcs-tools,.vcs-balance,.vcs-more')).map(el=>{const rect=el.getBoundingClientRect();return new DOMRect(rect.left-16,rect.top-16,rect.width+32,rect.height+32)});
          const fits=(point:{x:number;y:number})=>{const box=new DOMRect(stage.left+point.x,stage.top+point.y,width,height);return blockers.every(other=>box.right<=other.left||box.left>=other.right||box.bottom<=other.top||box.top>=other.bottom)};
          const upperMiddle={x:Math.max(16,(stage.width-width)/2),y:16};
          const preferred=props.chatOpen&&props.giftPanel?[...corners,upperMiddle]:corners;
          const available=preferred.find(fits)??corners.find(fits)??corners[0]; setPosition({x:available.x,y:available.y});
        }
      }
      drag.current = null;
    }
  }

  return <section ref={stageRef} className="vcs-stage" aria-label="Active video call" onPointerMove={showToolbar} onTouchStart={showToolbar} onClick={showToolbar}>
    <div ref={remoteRef} className={`vcs-remote${swapped?' is-preview':''}`} onPointerDown={event=>{if(swapped)startDrag(event)}} onPointerMove={event=>{if(swapped)moveDrag(event)}} onPointerUp={event=>{if(swapped)endDrag(event)}} onPointerCancel={event=>{if(swapped)endDrag(event)}} onClick={()=>{if(swapped&&!dragged.current)setSwapped(false)}} style={swapped&&(collisionPosition||position) ? { left: (collisionPosition||position)!.x, top: (collisionPosition||position)!.y, right: 'auto', bottom: 'auto' } : undefined}><div className="vcs-remote-media">{props.remote}</div>{swapped&&<span data-drag-handle><i/> {props.name}</span>}</div><div className="vcs-vignette" />
    <div className="vcs-participant vcs-glass"><span className="vcs-avatar">{props.avatar ? <img src={props.avatar} alt="" /> : <span aria-hidden="true">{props.name.slice(0, 1).toUpperCase()}</span>}</span><span className="vcs-person-copy"><b>{props.name}{props.age ? `, ${props.age}` : ''}</b><small><i />{props.onlineLabel || 'Online'}</small></span>{props.onFollow && <button type="button" className={`vcs-follow${props.following ? ' is-following' : ''}`} onClick={props.onFollow}><Heart size={15} fill={props.following ? 'currentColor' : 'none'} />{props.following ? 'Following' : 'Follow'}</button>}</div>
    <div className="vcs-meta vcs-glass">{props.quality === 'HD' && <><span className="vcs-quality"><i /><b>HD</b></span><i className="vcs-divider" /></>}<span>{props.duration}</span></div>
    <button type="button" className="vcs-balance vcs-glass" onClick={props.onAddCoins} aria-label={`Buy coins. Current balance ${props.balance}`}><Coins size={16} /><span>{props.balance}</span><Plus size={14} /></button>
    <div ref={localRef} className={`vcs-local vcs-glass${swapped?' is-main':''}`} onPointerDown={event=>{if(!swapped)startDrag(event)}} onPointerMove={event=>{if(!swapped)moveDrag(event)}} onPointerUp={event=>{if(!swapped)endDrag(event)}} onPointerCancel={event=>{if(!swapped)endDrag(event)}} onClick={()=>{if(!swapped&&!dragged.current)setSwapped(true)}} style={!swapped&&(collisionPosition||position) ? { left: (collisionPosition||position)!.x, top: (collisionPosition||position)!.y, right: 'auto', bottom: 'auto' } : undefined}><div className="vcs-local-media">{props.local}</div>{!swapped&&<span data-drag-handle title="Drag local preview" aria-label="Drag local preview"><i /> You</span>}</div>
    {chatMounted && <div className={`vcs-chat-shell${chatClosing ? ' is-closing' : ''}`}>{props.chatPanel}</div>}
    {props.giftPanel}{props.emojiPanel}{props.walletPanel}
    {reaction && <div className="vcs-reaction-float" aria-live="polite">{reaction}</div>}
    <div className="vcs-tools"><button type="button" title="Report participant" onClick={props.onReport} aria-label="Report participant"><Flag size={18}/></button><button type="button" ref={moreButton} title="More options" onClick={props.onMore} aria-label="More options" aria-expanded={Boolean(props.moreOpen)} aria-haspopup="menu"><MoreHorizontal size={19}/></button></div>
    <div className={`vcs-controls vcs-glass${toolbarDim && !overlaysOpen ? ' is-idle' : ''}`} onPointerEnter={showToolbar}>
      <button type="button" title={props.micOn ? 'Mute microphone' : 'Turn microphone on'} onClick={props.onMic} aria-label={props.micOn ? 'Mute microphone' : 'Turn microphone on'}><i>{props.micOn ? <Mic size={20} /> : <MicOff size={20} />}</i><small>{props.micOn ? 'Mic' : 'Muted'}</small></button>
      <button type="button" title={props.cameraOn ? 'Turn camera off' : 'Turn camera on'} onClick={props.onCamera} aria-label={props.cameraOn ? 'Turn camera off' : 'Turn camera on'}><i>{props.cameraOn ? <Video size={20} /> : <VideoOff size={20} />}</i><small>Camera</small></button>
      <button type="button" title="Send a gift" onClick={props.onGift} aria-label="Send a gift"><i><Coins size={20} /></i><small>Gift</small></button>
      <button type="button" title={props.chatOpen ? 'Close live chat' : 'Open live chat'} onClick={props.onChat} aria-label={props.chatOpen ? 'Close live chat' : 'Open live chat'} aria-expanded={Boolean(props.chatOpen)}><i><MessageCircle size={20} />{Boolean(props.unread) && !props.chatOpen && <em>{props.unread}</em>}</i><small>Chat</small></button>
      <button type="button" title="Next caller" onClick={props.onNext} aria-label="Next caller"><i><Repeat2 size={20} /></i><small>Next</small></button>
      <button type="button" className="vcs-end" title="End call" onClick={props.onEnd} aria-label="End call"><i><PhoneOff size={20} /></i><small>End</small></button>
    </div>
    {props.moreOpen && <div ref={moreMenu} className="vcs-more-dismiss-layer">{props.morePanel}</div>}
    {props.modalPanel}{props.error && <div className="vcs-error" role="alert">{props.error}</div>}
  </section>;
}
