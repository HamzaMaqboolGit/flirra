'use client';

import { useEffect, useState } from 'react';
import { Bell, Volume2 } from 'lucide-react';
import { readApiJson } from '@/lib/client-api';
import { SOUND_IDS, type SoundCatalog, type SoundId } from '@/lib/sounds';

const names: Record<SoundId, string> = { incoming_call: 'Incoming call ringtone', outgoing_call: 'Outgoing call ringback', random_matching: 'Random matching', match_found: 'Match found', call_connected: 'Call connected', new_message: 'New messages', new_notification: 'Notifications', missed_call: 'Missed calls', gift_received: 'Gifts received', call_ended: 'Call ended' };
type Prefs = { muted: Partial<Record<SoundId, boolean>>; volume: number; browserNotifications: boolean };

export default function SoundPreferences() {
  const [catalog, setCatalog] = useState<SoundCatalog | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({ muted: {}, volume: 1, browserNotifications: false });
  const [permission, setPermission] = useState('default');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; fetch('/api/sounds', { cache: 'no-store' }).then(async response => { const result = await readApiJson(response, 'Could not load sound preferences.') as { catalog?: SoundCatalog; preferences?: Prefs }; if (!response.ok) throw new Error('Could not load sound preferences.'); if (alive) { setCatalog(result.catalog || null); setPrefs(result.preferences || { muted: {}, volume: 1, browserNotifications: false }); setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission); } }).catch(error => alive && setMessage(error instanceof Error ? error.message : 'Sound preferences are unavailable.')); return () => { alive = false; }; }, []);
  async function save(next: Prefs) { setPrefs(next); setBusy(true); setMessage(''); try { const response = await fetch('/api/sounds', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) }); const result = await readApiJson(response, 'Could not save sound preferences.') as { error?: string; preferences?: Prefs; catalog?: SoundCatalog }; if (!response.ok) throw new Error(result.error || 'Could not save sound preferences.'); setPrefs(result.preferences || next); setCatalog(result.catalog || catalog); setMessage('Sound preferences saved.'); window.dispatchEvent(new Event('flirra-sound-preferences-changed')); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save sound preferences.'); } finally { setBusy(false); } }
  async function requestBrowserPermission() { if (typeof Notification === 'undefined') { setMessage('Browser notifications are not supported here.'); return; } if (Notification.permission === 'granted') { void save({ ...prefs, browserNotifications: true }); return; } if (Notification.permission === 'denied') { setPermission('denied'); setMessage('Browser notifications are blocked in this browser’s site settings.'); return; } const result = await Notification.requestPermission(); setPermission(result); void save({ ...prefs, browserNotifications: result === 'granted' }); }
  if (!catalog) return <section className="profile-setting-card"><header><span className="profile-setting-icon"><Volume2 size={17}/></span><div><h2>Sounds &amp; Notifications</h2><small>{message || 'Loading sound preferences…'}</small></div></header></section>;
  return <section className="profile-setting-card sound-preferences-card"><header><span className="profile-setting-icon"><Volume2 size={17}/></span><div><h2>Sounds &amp; Notifications</h2><small>{catalog.allowUserPreferences ? 'Choose which enabled sounds you hear.' : 'Sound preferences are currently managed by Flirra.'}</small></div></header>
    {catalog.allowUserPreferences ? <>
      <label className="sound-user-volume"><span>Notification volume</span><b>{Math.round(prefs.volume * 100)}%</b><input type="range" min="0" max="1" step="0.01" value={prefs.volume} disabled={busy} onChange={event => setPrefs(value => ({ ...value, volume: Number(event.target.value) }))} onPointerUp={() => void save(prefs)} onKeyUp={() => void save(prefs)}/></label>
      <div className="sound-user-list">{SOUND_IDS.map(id => <label key={id} className={!catalog.sounds[id].enabled ? 'is-disabled' : ''}><span><b>{names[id]}</b>{!catalog.sounds[id].enabled&&<small>Disabled by administrator</small>}</span><input type="checkbox" checked={catalog.sounds[id].enabled && !prefs.muted[id]} disabled={!catalog.sounds[id].enabled || busy} onChange={event => void save({ ...prefs, muted: { ...prefs.muted, [id]: !event.target.checked } })}/></label>)}</div>
    </> : <p className="sound-policy-note">Your sound preferences are unavailable while the administrator manages the global configuration.</p>}
    <div className="sound-browser-option"><span><Bell size={16}/><b>Browser notifications</b><small>Permission: {permission}</small></span><button type="button" className="account-row-action" disabled={busy || permission === 'denied' || permission === 'unsupported'} onClick={() => void requestBrowserPermission()}>{prefs.browserNotifications ? 'Enabled' : 'Enable'}</button></div>
    {message&&<small className="sound-preference-status" role="status">{message}</small>}
  </section>;
}
