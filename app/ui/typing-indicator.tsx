'use client';

import type { Socket } from 'socket.io-client';
import { useCallback, useEffect, useRef, useState } from 'react';

type EventKey = 'conversationId' | 'callId';
type TypingEvent = { conversationId?: string; callId?: string; userId?: string; typing?: boolean };

/** Shared, ephemeral typing presence for private conversations and active calls. */
export function useTypingPresence({ socket, event, key, keyField, userId, enabled = true }: {
  socket: Socket | null; event: 'message:typing' | 'call:typing'; key: string; keyField: EventKey; userId: string; enabled?: boolean;
}) {
  const [remoteTyping, setRemoteTyping] = useState(false);
  const localActive = useRef(false);
  const lastEmit = useRef(0);
  const localTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useRef<{ socket: Socket; event: string; key: string; keyField: EventKey } | null>(null);
  const stateRef = useRef({ socket, event, key, keyField, enabled });
  stateRef.current = { socket, event, key, keyField, enabled };

  const stop = useCallback((targetKey = stateRef.current.key) => {
    if (localTimer.current) clearTimeout(localTimer.current);
    localTimer.current = null;
    const activeSession = session.current;
    if (localActive.current && activeSession && (!targetKey || targetKey === activeSession.key)) {
      activeSession.socket.emit(activeSession.event, { [activeSession.keyField]: activeSession.key, typing: false });
    }
    if (!targetKey || !activeSession || targetKey === activeSession.key) session.current = null;
    localActive.current = false;
    lastEmit.current = 0;
  }, []);

  const setLocalTyping = useCallback((active: boolean) => {
    const current = stateRef.current;
    if (!active || !current.enabled || !current.socket || !current.key) { stop(); return; }
    const now = Date.now();
    if (!localActive.current || now - lastEmit.current >= 900) {
      current.socket.emit(current.event, { [current.keyField]: current.key, typing: true });
      session.current = { socket: current.socket, event: current.event, key: current.key, keyField: current.keyField };
      lastEmit.current = now;
    }
    localActive.current = true;
    if (localTimer.current) clearTimeout(localTimer.current);
    localTimer.current = setTimeout(() => stop(current.key), 2000);
  }, [stop]);

  useEffect(() => {
    setRemoteTyping(false);
    if (remoteTimer.current) clearTimeout(remoteTimer.current);
    if (!socket || !key || !enabled) return;
    const receive = (payload: TypingEvent) => {
      if (payload[keyField] !== key || payload.userId === userId) return;
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
      const active = Boolean(payload.typing);
      setRemoteTyping(active);
      if (active) remoteTimer.current = setTimeout(() => setRemoteTyping(false), 2300);
    };
    const disconnected = () => { setRemoteTyping(false); if (remoteTimer.current) clearTimeout(remoteTimer.current); };
    socket.on(event, receive);
    socket.on('disconnect', disconnected);
    return () => {
      socket.off(event, receive);
      socket.off('disconnect', disconnected);
      stop(key);
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
      remoteTimer.current = null;
    };
  }, [socket, event, key, keyField, userId, enabled, stop]);

  return { remoteTyping, setLocalTyping, stop };
}

export default function TypingIndicator({ label = 'Typing…', variant = 'bubble' }: { label?: string; variant?: 'bubble' | 'inline' }) {
  return <div className={`flirra-typing-indicator is-${variant}`} role="status" aria-label={label}>
    {variant === 'bubble' && <span className="flirra-typing-dots" aria-hidden="true"><i/><i/><i/></span>}
    <span className="flirra-typing-label">{label}</span>
    {variant === 'inline' && <span className="flirra-typing-dots" aria-hidden="true"><i/><i/><i/></span>}
  </div>;
}
