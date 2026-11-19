'use client';

import { useEffect, useState } from 'react';
import { Eye, Gift, ImagePlus, Plus, Save, Star, Trash2, Upload } from 'lucide-react';
import { readApiJson } from '@/lib/client-api';
import AdminDataTable from './admin-data-table';

type GiftItem = { id: string; name: string; imageUrl: string; coins: number | ''; category: string; featured: boolean; enabled: boolean; sortOrder: number | '' };
type Transaction = { id: string; name: string; coins: number; createdAt: string; sender: { displayName: string }; recipient: { displayName: string }; gift: { category: string } };
type GiftForm = Omit<GiftItem, 'id'> & { id?: string };
const emptyGift = (): GiftForm => ({ name: '', imageUrl: '', coins: '', category: 'Popular', featured: false, enabled: true, sortOrder: '' });

export default function GiftsAdmin() {
  const [items, setItems] = useState<GiftItem[]>([]);
  const [draft, setDraft] = useState<GiftForm>(emptyGift());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalCoinsSpent, setTotalCoinsSpent] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  async function load() {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/gifts', { cache: 'no-store' });
      const data = await readApiJson(response, 'Could not load gifts.') as { gifts?: GiftItem[]; transactions?: Transaction[]; totalCoinsSpent?: number; transactionCount?: number; error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not load gifts.');
      setItems(data.gifts || []);
      setTransactions(data.transactions || []);
      setTotalCoinsSpent(data.totalCoinsSpent || 0);
      setTransactionCount(data.transactionCount || 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load gifts.'); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []);

  async function uploadImage(file: File, setImage: (url: string) => void) {
    setError(''); setUploading(file.name);
    try {
      const form = new FormData(); form.set('file', file);
      form.set('altText', `Virtual gift ${file.name}`);
      const response = await fetch('/api/admin/cms/media', { method: 'POST', body: form });
      const data = await readApiJson(response, 'Could not upload gift image.') as { media?: { url?: string }; error?: string };
      if (!response.ok || !data.media?.url) throw new Error(data.error || 'Could not upload gift image.');
      setImage(data.media.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload gift image.'); }
    finally { setUploading(''); }
  }

  async function save(item: GiftForm) {
    const coins = Number(item.coins), sortOrder = Number(item.sortOrder);
    if (item.coins === '' || !Number.isInteger(coins) || coins < 1) { setError('Enter a gift coin price greater than 0.'); return; }
    if (item.sortOrder === '' || !Number.isInteger(sortOrder) || sortOrder < 0) { setError('Enter a display order.'); return; }
    setBusy(true); setError(''); setSaved('');
    try {
      const response = await fetch('/api/admin/gifts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...item, coins, sortOrder }) });
      const data = await readApiJson(response, 'Could not save gift.') as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not save gift.');
      setSaved('Gift catalog updated.'); await load();
      if (!item.id) setDraft(emptyGift());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save gift.'); }
    finally { setBusy(false); }
  }

  async function disable(item: GiftItem) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/gifts', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: item.id }) });
      const data = await readApiJson(response, 'Could not remove gift.') as { error?: string; deleted?: boolean };
      if (!response.ok) throw new Error(data.error || 'Could not remove gift.');
      setSaved(data.deleted ? `${item.name} was deleted.` : `${item.name} was disabled to preserve its transaction history.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove gift.'); }
    finally { setBusy(false); }
  }

  const edit = (item: GiftItem, patch: Partial<GiftItem>) => setItems(rows => rows.map(row => row.id === item.id ? { ...row, ...patch } : row));
  const image = (url: string) => url.startsWith('/') || url.startsWith('https://');
  const giftFields = (value: GiftForm, update: (patch: Partial<GiftForm>) => void, prefix: string) => <>
    <label>Name<input required minLength={2} maxLength={48} value={value.name} onChange={event => update({ name: event.target.value })}/></label>
    <label>Coin price<input required type="number" min="1" max="100000" value={value.coins} onChange={event => update({ coins: event.target.value === '' ? '' : Number(event.target.value) })}/></label>
    <label>Category<input required minLength={2} maxLength={32} list="virtual-gift-categories" value={value.category} onChange={event => update({ category: event.target.value })} placeholder="Popular, Romantic, Premium…"/></label>
    <label>Display order<input required type="number" min="0" max="9999" value={value.sortOrder} onChange={event => update({ sortOrder: event.target.value === '' ? '' : Number(event.target.value) })}/></label>
    <label className="gift-admin-image-field">Image or emoji<div className="gift-admin-image-control"><input value={value.imageUrl} maxLength={500} onChange={event => update({ imageUrl: event.target.value })} placeholder="Image URL or 🎁"/><label className="gift-admin-upload"><Upload size={14}/>{uploading ? 'Uploading…' : 'Upload'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={Boolean(uploading)} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file, url => update({ imageUrl: url })); event.currentTarget.value = ''; }}/></label></div></label>
    {value.imageUrl && <span className="gift-admin-preview" title="Gift preview">{image(value.imageUrl) ? <img src={value.imageUrl} alt={`${value.name || 'Gift'} preview`}/> : value.imageUrl}</span>}
    <label className="gift-admin-enabled"><input type="checkbox" checked={value.enabled} onChange={event => update({ enabled: event.target.checked })}/> Enabled</label>
    <label className="gift-admin-enabled"><input type="checkbox" checked={value.featured} onChange={event => update({ featured: event.target.checked })}/> Featured</label>
    {prefix === 'item' && <button disabled={busy || Boolean(uploading)}><Save size={14}/> Save</button>}
    {prefix === 'item' && <button type="button" className="danger" disabled={busy} onClick={() => { const item = items.find(row => row.id === value.id); if (item) void disable(item); }} aria-label="Remove gift"><Trash2 size={14}/></button>}
  </>;

  return <section className="admin-v2-card gift-admin">
    <div className="admin-v2-card-head"><div><h2>Virtual gifts</h2><p className="admin-v2-note">Manage the gifts, categories, animations, and coin prices available during calls.</p></div><Gift/></div>
    <datalist id="virtual-gift-categories">{['Popular', 'Romantic', 'Premium', ...new Set(items.map(item => item.category))].map(category => <option key={category} value={category}/>)}</datalist>
    <div className="gift-admin-metrics"><span><small>Transactions</small><b>{transactionCount.toLocaleString()}</b></span><span><small>Coins spent</small><b>{totalCoinsSpent.toLocaleString()}</b></span><span><small>Active gifts</small><b>{items.filter(item => item.enabled).length}</b></span></div>
    {error && <p className="admin-v2-alert" role="alert">{error}</p>}{saved && <p className="admin-v2-note" role="status">{saved}</p>}
    <div className="gift-admin-list">{items.map(item => {
      const value: GiftForm = { ...item };
      return <form className="gift-admin-row" key={item.id} onSubmit={event => { event.preventDefault(); void save(value); }}>
        {giftFields(value, patch => edit(item, patch), 'item')}
      </form>;
    })}</div>
    <form className="admin-v2-form gift-admin-new" onSubmit={event => { event.preventDefault(); void save(draft); }}><h3><Plus size={16}/> Add a virtual gift</h3>{giftFields(draft, patch => setDraft(current => ({ ...current, ...patch })), 'new')}<button type="submit" disabled={busy || Boolean(uploading)}><Plus size={15}/> Add gift</button></form>
    <section className="gift-admin-transactions"><header><div><h3>Recent gift transactions</h3><p className="admin-v2-note">Showing the latest 50 completed gifts.</p></div><Eye size={18}/></header><AdminDataTable module="gift-transactions" heads={['Gift','From','To','Category','Coins','Date']} rows={transactions.map(transaction=><tr key={transaction.id}><td>{transaction.name}</td><td>{transaction.sender.displayName}</td><td>{transaction.recipient.displayName}</td><td>{transaction.gift.category}</td><td>{transaction.coins.toLocaleString()}</td><td>{new Date(transaction.createdAt).toLocaleString()}</td></tr>)}/></section>
  </section>;
}
