'use client';

import { useCallback, useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOUND_IDS, type SoundId, type SoundItem, type SoundCatalog } from '@/lib/sounds';

type SoundPayload = { id?: string; call?: { id?: string; status?: string; viewerRole?: string }; callId?: string; conversationId?: string; message?: { id?: string; senderId?: string; body?: string; attachmentUrl?: string | null }; gift?: { id?: string }; senderId?: string; kind?: string };
type Config = { catalog: SoundCatalog; preferences: { muted: Partial<Record<SoundId, boolean>>; volume: number; browserNotifications?: boolean }; browserPermission?: NotificationPermission | 'unsupported' };

const crossTab = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('flirra-sounds-v1') : null;

export function useSoundPlayer() {
  const config = useRef<Config | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const callActive = useRef(false);
  const lastEvents = useRef(new Map<string, number>());
  const setConfig = useCallback((value: Config) => { config.current = value; }, []);
  const stop = useCallback(() => { if (audio.current) { audio.current.pause(); audio.current.currentTime = 0; audio.current = null; } }, []);
  const play = useCallback((id: SoundId, eventId: string, loop = false, remote = false, targetUrl?: string) => {
    const current = config.current;
    if (!current) return;
    const item: SoundItem = current.catalog.sounds[id];
    const now = Date.now();
    for (const [key, at] of lastEvents.current) if (now - at > 30_000) lastEvents.current.delete(key);
    if (lastEvents.current.has(`${id}:${eventId}`)) return;
    lastEvents.current.set(`${id}:${eventId}`, now);
    if (remote && crossTab) {
      const winnerKey = `flirra-sound:${id}:${eventId}`;
      try { if (localStorage.getItem(winnerKey)) return; localStorage.setItem(winnerKey, String(now)); window.setTimeout(() => localStorage.removeItem(winnerKey), 15_000); } catch { /* Same-tab duplicate guard remains active. */ }
      crossTab.postMessage({ type: 'played', id, eventId, at: now });
    }
    if (remote && current.preferences.browserNotifications && document.visibilityState === 'hidden' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const notification = new Notification('Flirra', { body: id === 'incoming_call' ? 'Someone is calling you.' : id === 'new_message' ? 'You have a new message.' : id === 'missed_call' ? 'You missed a call.' : 'You have a new notification.' });
      notification.onclick = () => { window.focus(); window.location.assign(targetUrl || (id === 'incoming_call' ? '/dashboard' : id === 'new_message' ? '/messages' : '/history')); notification.close(); };
    }
    if (!item?.enabled || (current.catalog.allowUserPreferences && current.preferences.muted[id])) return;
    if (callActive.current && !['call_connected', 'call_ended', 'incoming_call', 'outgoing_call'].includes(id)) return;
    stop();
    const player = new Audio(item.url);
    player.loop = loop;
    player.volume = Math.max(0, Math.min(1, current.catalog.masterVolume * item.volume * (current.catalog.allowUserPreferences ? current.preferences.volume : 1)));
    audio.current = player;
    void player.play().catch(() => { if (audio.current === player) audio.current = null; });
  }, [stop]);
  const event = useCallback((name: string, payload: SoundPayload, selfId: string) => {
    const callId = payload.call?.id || payload.callId;
    const eventId = payload.id || payload.message?.id || payload.gift?.id || callId || `${name}:${payload.conversationId || payload.kind || Date.now()}`;
    if (name === 'call:incoming' && payload.call?.viewerRole === 'RECIPIENT') { callActive.current = false; play('incoming_call', eventId, true, true, '/dashboard'); return; }
    if (name === 'queue:position') { play('random_matching', eventId, true); return; }
    if (name === 'call:ringing') { play('outgoing_call', eventId, true); return; }
    if (name === 'call:accepted') { stop(); return; }
    if (name === 'call:rejected') { callActive.current = false; stop(); return; }
    if (name === 'call:active') { callActive.current = true; stop(); play('call_connected', eventId); return; }
    if (name === 'call:ended') { callActive.current = false; stop(); play('call_ended', eventId); return; }
    if (name === 'call:match-found') { stop(); play('match_found', eventId); return; }
    if (name === 'call:gift' && payload.senderId !== selfId) { play('gift_received', eventId, false, true); return; }
    if (name === 'message:new' && payload.message?.senderId !== selfId) { play('new_message', eventId, false, true, payload.conversationId ? `/messages?conversation=${encodeURIComponent(payload.conversationId)}` : '/messages'); return; }
    if (name === 'notification:new' && payload.id) {
      const kind = String(payload.kind || '');
      if (kind === 'INCOMING_CALL' || kind === 'DIRECT_MESSAGE') return;
      const key: SoundId = kind === 'GIFT_RECEIVED' ? 'gift_received' : kind === 'INCOMING_CALL' ? 'incoming_call' : kind === 'MISSED_CALL' ? 'missed_call' : 'new_notification';
      play(key, eventId, key === 'incoming_call', true);
    }
  }, [play, stop]);
  useEffect(() => {
    if (!crossTab) return;
    const onMessage = (message: MessageEvent<{ type?: string; id?: SoundId; eventId?: string; at?: number }>) => {
      if (message.data?.type === 'played' && message.data.id && message.data.eventId) lastEvents.current.set(`${message.data.id}:${message.data.eventId}`, message.data.at || Date.now());
    };
    crossTab.addEventListener('message', onMessage);
    return () => crossTab.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      const silent = new Audio('/sounds/call_ended.wav');
      silent.muted = true;
      void silent.play().then(() => { silent.pause(); silent.currentTime = 0; silent.muted = false; }).catch(() => undefined);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);
  useEffect(() => () => stop(), [stop]);
  return useRef({ setConfig, event, play, stop }).current;
}

export function SoundEventsBridge({ selfId, onConfig }: { selfId: string; onConfig: (config: Config) => void }) {
  const manager = useSoundPlayer();
  useEffect(() => {
    let live = true;
    const load = () => fetch('/api/sounds', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => { if (live && data?.catalog && data?.preferences) { const value = data as Config; manager.setConfig(value); onConfig(value); } }).catch(() => undefined);
    void load();
    const socket: Socket = io({ withCredentials: true });
    const names = ['call:incoming','call:ringing','call:accepted','call:rejected','call:active','call:ended','call:gift','call:match-found','message:new','notification:new'];
    const listeners = new Map<string, (payload: SoundPayload) => void>();
    for (const name of names) { const listener = (payload: SoundPayload) => manager.event(name, payload || {}, selfId); listeners.set(name, listener); socket.on(name, listener); }
    socket.on('sound:config-updated', () => void load());
    const policy = () => void load();
    window.addEventListener('flirra-sound-preferences-changed', policy);
    return () => { live = false; window.removeEventListener('flirra-sound-preferences-changed', policy); listeners.forEach((listener, name) => socket.off(name, listener)); socket.disconnect(); manager.stop(); };
  }, [manager, onConfig, selfId]);
  return null;
}

export function SoundPreview({ id, config }: { id: SoundId; config: SoundCatalog }) {
  const manager = useSoundPlayer();
  useEffect(() => { manager.setConfig({ catalog: config, preferences: { muted: {}, volume: 1 } }); return () => manager.stop(); }, [config, manager]);
  return <button type="button" className="sound-preview-button" onClick={() => manager.play(id, `preview:${id}:${Date.now()}`)} aria-label={`Preview ${id.replaceAll('_', ' ')}`}>Preview</button>;
}

export { SOUND_IDS };
