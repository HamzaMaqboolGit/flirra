'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowDownToLine, CircleDollarSign, Clock3, Gift, ShieldCheck, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { readApiJson } from '@/lib/client-api';
import CountrySelect from '../country-select';

type Earnings = { wallet: { availableCredits: number; pendingCredits: number; lifetimeCredits: number } | null; earnings: Array<{ id: string; credits: number; createdAt: string; status: string }>; withdrawals: Array<{ id: string; amountCredits: number; amountCents: number; createdAt: string; status: string }>; payoutAccount: { legalName: string; country: string; method: string; accountHint: string; hasBankDetails: boolean } | null; settings: { minWithdrawalCredits: number | null; creditValueCents: number | null; payoutsEnabled: boolean } };
type Gifts = { gifts: Array<{ id: string; name: string; coins: number; createdAt: string; gift: { imageUrl: string }; sender: { displayName: string } }>; totalGifts: number; totalGiftCoins: number; page: number; pageSize: number; filteredTotal: number };
const money = (credits: number, value: number | null) => value == null ? 'Not configured' : `$${(credits * value / 100).toFixed(2)}`;
const date = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

export default function CreatorEarningsInline({ view, onView, earningsAvailable }: { view: 'overview' | 'earnings' | 'gifts' | 'withdrawals'; onView: (view: 'overview' | 'earnings' | 'gifts' | 'withdrawals') => void; earningsAvailable: boolean }) {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [gifts, setGifts] = useState<Gifts | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState('');
  const [legalName, setLegalName] = useState('');
  const [country, setCountry] = useState('United States');
  const [hint, setHint] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [iban, setIban] = useState('');
  const [swiftCode, setSwiftCode] = useState('');
  const [giftQuery, setGiftQuery] = useState('');
  const [giftRange, setGiftRange] = useState<'all'|'30'|'90'>('all');
  const [giftPage, setGiftPage] = useState(1);

  useEffect(() => {
    let active = true;
    async function load() {
      setError('');
      try {
        const response = await fetch('/api/earnings', { cache: 'no-store' });
        const financials = await readApiJson(response, 'Could not load creator earnings.') as Earnings;
        if (!response.ok) throw new Error((financials as unknown as {error?:string}).error || 'Could not load creator earnings.');
        if (!active) return;
        setEarnings(financials);
        if (financials.payoutAccount) { setLegalName(financials.payoutAccount.legalName || ''); setCountry(financials.payoutAccount.country || 'United States'); setHint(financials.payoutAccount.accountHint || ''); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Could not load earnings.'); }
    }
    if (view !== 'overview' && earningsAvailable) void load();
    return () => { active = false; };
  }, [view, earningsAvailable]);

  useEffect(() => {
    if ((view !== 'gifts' && view !== 'earnings') || !earningsAvailable) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({page:String(view === 'gifts' ? giftPage : 1),days:giftRange});
        if (giftQuery.trim()) params.set('q',giftQuery.trim());
        const response = await fetch(`/api/earnings/gifts?${params}`, { cache: 'no-store' });
        const result = await readApiJson(response, 'Could not load gift collection.') as Gifts & {error?:string};
        if (!response.ok) throw new Error(result.error || 'Could not load gift collection.');
        if (active) setGifts(result);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Could not load gift collection.'); }
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [view,giftPage,giftRange,giftQuery,earningsAvailable]);

  async function submitWithdrawal(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const response = await fetch('/api/earnings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amountCredits: Number(credits) }) }); const body = await readApiJson(response, 'Withdrawal request failed.'); if (!response.ok) throw new Error(body.error || 'Withdrawal request failed.'); setCredits(''); const refreshed = await fetch('/api/earnings', { cache: 'no-store' }); const result = await readApiJson(refreshed, 'Could not refresh earnings.') as Earnings; if (!refreshed.ok) throw new Error('Withdrawal was submitted, but earnings could not be refreshed.'); setEarnings(result); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not request payout.'); } finally { setBusy(false); }
  }
  async function saveBankDetails(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const response = await fetch('/api/payout-account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'MANUAL', legalName, country, accountHint: hint, bankName, accountNumber, routingNumber, iban, swiftCode }) }); const body = await readApiJson(response, 'Bank details could not be saved.') as {error?:string}; if (!response.ok) throw new Error(body.error || 'Bank details could not be saved.'); const refreshed = await fetch('/api/earnings', { cache: 'no-store' }); setEarnings(await readApiJson(refreshed, 'Could not refresh earnings.') as Earnings); setAccountNumber(''); setRoutingNumber(''); setIban(''); setSwiftCode(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Payout setup unavailable.'); } finally { setBusy(false); }
  }

  const value = earnings?.settings.creditValueCents ?? null;
  const earned = earnings?.wallet?.lifetimeCredits || 0;
  const withdrawn = earnings?.withdrawals.filter(row => row.status === 'SUCCEEDED').reduce((sum, row) => sum + row.amountCredits, 0) || 0;
  const available = earnings?.wallet?.availableCredits || 0;
  const giftRows = gifts?.gifts || [];
  const giftPageSize = gifts?.pageSize || 8;
  const giftPageCount = Math.max(1, Math.ceil((gifts?.filteredTotal || 0) / giftPageSize));
  return <section className="profile-creator-card" aria-live="polite">
    <header className="profile-creator-card-head"><div><span className="profile-setting-icon">{view === 'gifts' ? <Gift size={18}/> : <CircleDollarSign size={18}/>}</span><div><h2>{view === 'gifts' ? 'Gift Collection' : view === 'earnings' ? 'Your Earnings' : 'Withdraw Earnings'}</h2><small>{view === 'gifts' ? 'Gifts received and earnings' : view === 'earnings' ? 'Your balance and activity' : 'Bank payout setup and withdrawal history'}</small></div></div><button type="button" className="profile-creator-back" onClick={() => onView('overview')}><ArrowLeft size={15}/> Back to Profile</button></header>
    {error && <p className="profile-alert" role="alert">{error}</p>}
    {earningsAvailable && !earnings && <p className="profile-creator-loading">Loading your earnings…</p>}
    {earningsAvailable && earnings && <>
      <div className="profile-creator-metrics"><article><Gift/><small>Total gifts received</small><b>{gifts?.totalGifts ?? '—'}</b></article><article><CircleDollarSign/><small>Earned coins</small><b>{earned.toLocaleString()}</b></article><article><CircleDollarSign/><small>Estimated earnings</small><b>{money(earned, value)}</b></article><article><ArrowDownToLine/><small>Available</small><b>{money(available, value)}</b></article></div>
      {view === 'earnings' ? <>
        <div className="profile-creator-metrics profile-creator-secondary-metrics"><article><Clock3/><small>Pending earnings</small><b>{money(earnings.wallet?.pendingCredits || 0, value)}</b></article><article><ArrowDownToLine/><small>Total withdrawn</small><b>{money(withdrawn, value)}</b></article><article><ShieldCheck/><small>Bank account</small><b>{earnings.payoutAccount?.hasBankDetails ? `Saved · ${earnings.payoutAccount.accountHint}` : 'Not added'}</b></article></div>
        <section className="profile-creator-subcard"><h3>Recent gift earnings</h3>{earnings.earnings.length ? <div className="profile-creator-history">{earnings.earnings.slice(0,6).map(row=><article key={row.id}><span>{date(row.createdAt)} · {row.status.toLowerCase()}</span><b>{row.credits.toLocaleString()} coins</b></article>)}</div> : <p className="profile-creator-empty">Your creator earnings activity will appear here.</p>}</section>
        <div className="profile-creator-shortcuts"><button type="button" onClick={()=>onView('gifts')}><Gift size={15}/> Gift Collection</button><button type="button" onClick={()=>onView('withdrawals')}><ArrowDownToLine size={15}/> Withdraw Earnings</button></div>
      </> : view === 'gifts' ? <>
        <section className="profile-creator-subcard"><div className="profile-creator-gift-toolbar"><h3>Gift transaction history</h3><label><Search size={15}/><input aria-label="Search gift history" value={giftQuery} onChange={event=>{setGiftQuery(event.target.value);setGiftPage(1)}} placeholder="Search gifts or senders"/></label></div><div className="profile-creator-gift-filters" role="group" aria-label="Filter gift history">{([['all','All time'],['30','30 days'],['90','90 days']] as const).map(([value,label])=><button key={value} type="button" className={giftRange===value?'is-active':''} aria-pressed={giftRange===value} onClick={()=>{setGiftRange(value);setGiftPage(1)}}>{label}</button>)}</div>{gifts?.totalGifts ? giftRows.length ? <><div className="profile-gift-gallery">{giftRows.map(gift => <article key={gift.id}>{gift.gift.imageUrl ? <img src={gift.gift.imageUrl} alt=""/> : <span><Gift/></span>}<div><b>{gift.name}</b><small>{gift.coins.toLocaleString()} coins · {gift.sender.displayName}</small><small>{date(gift.createdAt)}</small></div></article>)}</div><nav className="profile-creator-pagination" aria-label="Gift history pages"><span>{`${(giftPage-1)*giftPageSize+1}–${Math.min(giftPage*giftPageSize,gifts.filteredTotal)} of ${gifts.filteredTotal}`}</span><button type="button" aria-label="Previous gift page" disabled={giftPage<=1} onClick={()=>setGiftPage(value=>Math.max(1,value-1))}><ChevronLeft size={16}/></button><b>{giftPage} / {giftPageCount}</b><button type="button" aria-label="Next gift page" disabled={giftPage>=giftPageCount} onClick={()=>setGiftPage(value=>Math.min(giftPageCount,value+1))}><ChevronRight size={16}/></button></nav></> : <p className="profile-creator-empty">No gifts match these filters.</p> : <p className="profile-creator-empty">No gifts received yet.</p>}</section>
        <section className="profile-creator-subcard"><h3>Gift totals</h3><p>{(gifts?.totalGiftCoins || 0).toLocaleString()} gift coins received · gift coins are tracked separately from call earnings and wallet payouts.</p></section>
        <button type="button" className="profile-creator-primary" onClick={() => onView('withdrawals')}>Withdraw Earnings <ArrowDownToLine size={15}/></button>
      </> : <>
        <div className="profile-creator-metrics profile-creator-secondary-metrics"><article><Clock3/><small>Pending earnings</small><b>{money(earnings.wallet?.pendingCredits || 0, value)}</b></article><article><ArrowDownToLine/><small>Total withdrawn</small><b>{money(withdrawn, value)}</b></article><article><ShieldCheck/><small>Bank account</small><b>{earnings.payoutAccount?.hasBankDetails ? `Saved · ${earnings.payoutAccount.accountHint}` : 'Not added'}</b></article></div>
        <section className="profile-creator-subcard"><h3>Bank account for payouts</h3><p>{earnings.payoutAccount?.hasBankDetails ? `Saved account · ${earnings.payoutAccount.accountHint}. Update the fields below if your payout details change.` : 'Add your bank details to request a payout. Details are encrypted before storage.'}</p><form className="profile-creator-form" onSubmit={saveBankDetails}><label>Account holder name<input value={legalName} onChange={event => setLegalName(event.target.value)} minLength={2} required/></label><label>Country<CountrySelect id="profile-payout-country" value={country} onChange={setCountry} placeholder="Search country"/></label><label>Bank name<input value={bankName} onChange={event => setBankName(event.target.value)} minLength={2} required/></label><label>Account number<input type="password" autoComplete="new-password" value={accountNumber} onChange={event => setAccountNumber(event.target.value)} placeholder={earnings.payoutAccount?.hasBankDetails ? 'Enter to replace saved number' : ''} required={!earnings.payoutAccount?.hasBankDetails && !iban.trim()}/></label><label>Routing / sort code (optional)<input value={routingNumber} onChange={event => setRoutingNumber(event.target.value)} autoComplete="off"/></label><label>IBAN (optional)<input value={iban} onChange={event => setIban(event.target.value)} autoComplete="off"/></label><label>SWIFT / BIC (optional)<input value={swiftCode} onChange={event => setSwiftCode(event.target.value)} autoComplete="off"/></label><button type="submit" disabled={busy || !legalName.trim() || !bankName.trim() || (!accountNumber.trim() && !iban.trim())}>{busy ? 'Saving…' : 'Save bank details'}</button><small>Bank information is encrypted and is visible only to authorized payout administrators.</small></form></section>
        <section className="profile-creator-subcard"><h3>Request a withdrawal</h3><p>{money(1, value)} per credit. Requests are reviewed and paid manually.</p><form className="profile-creator-form" onSubmit={submitWithdrawal}><label>Credits to withdraw<input type="number" min={1} max={available} step="1" value={credits} onChange={event => setCredits(event.target.value)} placeholder="Enter credits" required/></label><button type="submit" disabled={busy || value == null || !earnings.payoutAccount?.hasBankDetails}>{busy ? 'Submitting…' : 'Request withdrawal'}</button></form><p className="profile-creator-security"><ShieldCheck size={15}/> Requested credits are reserved from your available balance. A payout administrator processes bank transfers manually.</p></section>
        <section className="profile-creator-subcard"><h3>Withdrawal history</h3>{earnings.withdrawals.length ? <div className="profile-creator-history">{earnings.withdrawals.map(row => <article key={row.id}><span>{date(row.createdAt)} · {row.status.toLowerCase()}</span><b>{money(row.amountCredits, value)}</b></article>)}</div> : <p className="profile-creator-empty">No withdrawal requests yet.</p>}</section>
      </>}
    </>}
  </section>;
}
