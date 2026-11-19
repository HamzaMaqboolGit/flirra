'use client';

import { useEffect, useState } from 'react';
import { readApiJson } from '@/lib/client-api';

type Props = { data: any; refresh: () => Promise<void> };

export default function VideoCallingSettings({ data, refresh }: Props) {
  const rtc = data.rtc || {};
  const [stunUrls, setStunUrls] = useState('');
  const [turnUrls, setTurnUrls] = useState('');
  const [turnUsername, setTurnUsername] = useState('');
  const [turnCredential, setTurnCredential] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setStunUrls(Array.isArray(rtc.stunUrls) ? rtc.stunUrls.join('\n') : '');
    setTurnUrls(Array.isArray(rtc.turnUrls) ? rtc.turnUrls.join('\n') : '');
    setTurnUsername(rtc.turnUsername || '');
  }, [rtc.stunUrls, rtc.turnUrls, rtc.turnUsername]);

  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        action: 'rtcSettings',
        stunUrls: stunUrls.split(/[\n,]+/).map(v => v.trim()).filter(Boolean),
        turnUrls: turnUrls.split(/[\n,]+/).map(v => v.trim()).filter(Boolean),
        turnUsername: turnUsername.trim(),
        ...(turnCredential ? { turnCredential } : {}),
      }) });
      const result = await readApiJson(response, 'Could not save video calling settings.') as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not save video calling settings.');
      setTurnCredential(''); setMessage('Video calling settings saved securely. Existing calls are unchanged.'); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save video calling settings.'); }
    finally { setBusy(false); }
  }

  return <section className="admin-v2-card admin-v2-form">
    <h2>Video Calling / WebRTC</h2>
    <p className="admin-v2-note">Configure ICE servers used by the existing random and private video-call implementation. One URL per line; changes apply to new peer connections.</p>
    <div className="admin-v2-grid">
      <label>STUN server URLs<textarea value={stunUrls} onChange={event => setStunUrls(event.target.value)} placeholder="stun:stun.l.google.com:19302" /></label>
      <label>TURN server URLs<textarea value={turnUrls} onChange={event => setTurnUrls(event.target.value)} placeholder="turns:turn.example.com:5349" /></label>
      <label>TURN username<input value={turnUsername} onChange={event => setTurnUsername(event.target.value)} autoComplete="off" /></label>
      <label>TURN credential (enter to replace)<input type="password" value={turnCredential} onChange={event => setTurnCredential(event.target.value)} autoComplete="new-password" placeholder={rtc.turnCredential === 'configured' ? 'Saved securely — enter a new credential to replace' : 'Required when TURN is enabled'} /></label>
    </div>
    <div className="admin-v2-row"><div><b>Runtime status</b><small>{rtc.turnConfigured ? 'TURN configured' : 'STUN only / TURN unavailable'} · {rtc.turnConfigured ? 'Credentials are present' : 'Configure TURN for restrictive networks'}</small></div><button type="button" onClick={() => void save()} disabled={busy}>{busy ? 'Saving securely…' : 'Save WebRTC settings'}</button></div>
    {message && <p className="stripe-connection-success" role="status">{message}</p>}
    {error && <p className="admin-v2-alert" role="alert">{error}</p>}
    <p className="admin-v2-note">TURN credentials are encrypted at rest and never returned by admin APIs. The browser receives only the runtime ICE credential required by WebRTC; use an ephemeral TURN provider credential when your provider supports it.</p>
  </section>;
}
