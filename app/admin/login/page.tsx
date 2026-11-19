'use client';
import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { readApiJson } from '@/lib/client-api';
import { adminPostAuthDestination } from '@/lib/redirect';
export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await readApiJson(response, 'Could not sign in.') as { authenticated?: boolean; error?: string };
      if (!response.ok || result.authenticated !== true) throw new Error(result.error || 'Could not sign in.');
      location.replace(adminPostAuthDestination(new URLSearchParams(location.search).get('next')));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not sign in.');
      setBusy(false);
    }
  }
  return <main className="admin-login-page"><form className="admin-login-card" onSubmit={submit}><div className="admin-login-brand"><span><ShieldCheck size={23}/></span><b>flirra</b><small>ADMIN</small></div><div className="admin-login-heading"><small>SECURE ADMINISTRATOR ACCESS</small><h1>Welcome back</h1><p>Sign in to manage your Flirra workspace.</p></div>{error&&<div role="alert">{error}</div>}<label>Email address<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@flirra.com"/></label><label>Password<span className="admin-password-field"><input type={showPassword?'text':'password'} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/><button type="button" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label><div className="admin-login-options"><span>24-hour session</span><a href="/forgot-password?next=%2Fadmin%2Fdashboard">Forgot password?</a></div><button className="admin-login-submit" disabled={busy}>{busy?'Signing in…':'Sign in securely'}</button><small className="admin-login-security"><ShieldCheck size={14}/> Protected access for authorized staff</small></form></main>;
}
