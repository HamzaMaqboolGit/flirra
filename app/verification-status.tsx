'use client';

import { useState } from 'react';
import { readApiJson } from '@/lib/client-api';
import { CheckCircle2, MailCheck, ShieldAlert } from 'lucide-react';

export default function VerificationStatus({ verified, email, dismissible = false }: { verified: boolean; email: string; dismissible?: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(verified);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  if (complete) return <div className="email-verification email-verification-ok"><CheckCircle2 size={18}/><span><b>Verified</b><small>Email verification controls your profile badge. It is not required for payouts.</small></span></div>;
  if (dismissed) return <button type="button" className="email-verification-later-link" onClick={() => setDismissed(false)}>Verification Pending · Review options</button>;

  async function resend() {
    setBusy(true); setError(''); setMessage(''); setDevCode('');
    try {
      const response = await fetch('/api/auth/resend', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await readApiJson(response,'Verification request failed.') as { error?: string; devCode?: string; sent?: boolean; verified?: boolean };
      if (!response.ok) throw new Error(data.error || 'Could not send the verification code.');
      if (data.verified) { setComplete(true); window.dispatchEvent(new Event('flirra-email-verified')); return; }
      setSent(true); setMessage('A 6-digit verification code has been sent to your email.'); setDevCode(data.devCode || '');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send the verification code.'); }
    finally { setBusy(false); }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();setBusy(true);setError('');setMessage('');
    try { const response=await fetch('/api/auth/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});const data=await readApiJson(response,'Could not verify your email.') as {error?:string};if(!response.ok)throw new Error(data.error||'Could not verify your email.');setComplete(true);setMessage('Your email is verified.');window.dispatchEvent(new Event('flirra-email-verified')); }
    catch(reason){setError(reason instanceof Error?reason.message:'Could not verify your email.')}finally{setBusy(false)}
  }

  return <section className="email-verification" aria-label="Email verification status">
    <span className="email-verification-icon"><ShieldAlert size={18}/></span>
    <div className="email-verification-copy"><b>Verification Pending</b><p>Verify your email to show a Verified badge on your profile. Email verification is separate from payout setup.</p>
      {message && <small className="email-verification-message" role="status">{message}</small>}
      {error && <small className="email-verification-error" role="alert">{error}</small>}
      {devCode && <small className="email-verification-message" role="status">Development code: <b>{devCode}</b></small>}
      {sent&&<form className="email-verification-code-form" onSubmit={verify}><label htmlFor="email-verification-code">6-digit code</label><input id="email-verification-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" required/><button type="submit" disabled={busy||code.length!==6}>{busy?'Checking…':'Verify code'}</button></form>}
    </div>
    <div className="email-verification-actions"><button type="button" onClick={resend} disabled={busy}><MailCheck size={15}/>{busy ? 'Sending…' : sent?'Resend code':'Send code'}</button>{dismissible && <button type="button" className="email-verification-later" onClick={() => setDismissed(true)}>Later</button>}</div>
  </section>;
}
