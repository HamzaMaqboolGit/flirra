'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Flag, ShieldAlert, X } from 'lucide-react';

type DialogRequest = { kind: 'confirm' | 'prompt' | 'report' | 'alert'; title: string; description: string; confirmLabel: string; danger?: boolean; inputLabel?: string; inputPlaceholder?: string };
type DialogApi = {
  confirm(request: Omit<DialogRequest, 'kind'>): Promise<boolean>;
  prompt(request: Omit<DialogRequest, 'kind'>): Promise<string | null>;
  report(request: Omit<DialogRequest, 'kind'>): Promise<{ reason: string; details: string } | null>;
  alert(title: string, description: string, kind?: 'info' | 'error' | 'success'): Promise<void>;
};
const DialogContext = createContext<DialogApi | null>(null);
export function useDialog() { const api = useContext(DialogContext); if (!api) throw new Error('useDialog must be used inside DialogProvider'); return api; }

export default function DialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('OTHER');
  const resolver = useRef<((value: boolean | string | { reason: string; details: string } | null) => void) | null>(null);
  const open = useCallback((item: DialogRequest) => new Promise<boolean | string | { reason: string; details: string } | null>(resolve => { resolver.current = resolve; setValue(''); setReason('OTHER'); setRequest(item); }), []);
  const close = useCallback((result: boolean | string | { reason: string; details: string } | null) => { const done = resolver.current; resolver.current = null; setRequest(null); done?.(result); }, []);
  useEffect(() => { if (!request) return; const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(null); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [request, close]);
  const api: DialogApi = {
    confirm: async options => (await open({ ...options, kind: 'confirm' })) === true,
    prompt: async options => { const result = await open({ ...options, kind: 'prompt' }); return typeof result === 'string' ? result : null; },
    report: async options => { const result = await open({ ...options, kind: 'report' }); return result && typeof result === 'object' ? result : null; },
    alert: async (title, description, kind = 'info') => { await open({ kind: 'alert', title, description, confirmLabel: 'Got it', danger: kind === 'error' }); },
  };
  const Icon = request?.kind === 'report' ? Flag : request?.danger ? ShieldAlert : AlertTriangle;
  return <DialogContext.Provider value={api}>{children}{request && <div className="velora-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(null); }}><section className="velora-dialog" role="dialog" aria-modal="true" aria-labelledby="velora-dialog-title" aria-describedby="velora-dialog-description"><button type="button" className="velora-dialog-close" onClick={() => close(null)} aria-label="Close dialog"><X size={18}/></button><span className={`velora-dialog-icon${request.danger ? ' is-danger' : ''}`}><Icon size={21}/></span><h2 id="velora-dialog-title">{request.title}</h2><p id="velora-dialog-description">{request.description}</p>{request.kind === 'prompt' && <label className="velora-dialog-field">{request.inputLabel||'Value'}<input autoFocus value={value} placeholder={request.inputPlaceholder} onChange={event=>setValue(event.target.value)} /></label>}{request.kind === 'report' && <div className="velora-dialog-report-fields"><label className="velora-dialog-field">Reason<select required value={reason} onChange={event=>setReason(event.target.value)}><option value="ABUSIVE_LANGUAGE">Abusive Language</option><option value="HARASSMENT">Harassment or Bullying</option><option value="HATE_SPEECH">Hate Speech</option><option value="THREATS">Threats or Violence</option><option value="SEXUAL_HARASSMENT">Sexual Harassment</option><option value="INAPPROPRIATE_VIDEO">Inappropriate Video Behavior</option><option value="SPAM_SCAM">Spam or Scam</option><option value="FAKE_PROFILE">Fake Profile or Impersonation</option><option value="UNDERAGE">Underage User</option><option value="OTHER">Other</option></select></label><label className="velora-dialog-field">Explanation (optional)<textarea value={value} maxLength={500} rows={3} placeholder="Tell us what happened" onChange={event=>setValue(event.target.value)}/></label></div>}<footer className={request.kind === 'alert' ? 'is-alert' : ''}>{request.kind !== 'alert' && <button type="button" className="velora-dialog-cancel" onClick={() => close(null)}>Cancel</button>}<button type="button" className={`velora-dialog-submit${request.danger ? ' is-danger' : ''}`} onClick={() => close(request.kind === 'report' ? { reason, details: value } : request.kind === 'prompt' ? value : true)}>{request.confirmLabel}</button></footer></section></div>}</DialogContext.Provider>;
}
