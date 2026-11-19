'use client';

import { Children, cloneElement, isValidElement, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Download, MoreHorizontal, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { useDialog } from '@/app/ui/dialog-provider';
import { useToast } from '@/app/toast-provider';
import { normalizeAdminTableId } from '@/lib/admin-table-ids';
import DatePicker from '@/app/date-picker';

type Props = { heads: string[]; rows: ReactNode[]; module?: string };
type Row = { key: string; cells: ReactNode[]; text: string[]; actionCell: number };

function AdminTableToolbar({ children }: { children: ReactNode }) {
  return <div className="admin-data-table-tools" role="group" aria-label="Table tools">{children}</div>;
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function RowMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape') setOpen(false); else if (event.type === 'pointerdown' && !(event.target as Element)?.closest?.('[data-admin-row-menu]')) setOpen(false); };
    document.addEventListener('pointerdown', close); window.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', close); };
  }, [open]);
  return <span className="admin-row-menu-anchor" data-admin-row-menu><button type="button" className="admin-row-menu-trigger" aria-label="Row actions" aria-haspopup="menu" aria-expanded={open} onClick={event => { event.stopPropagation(); const r = event.currentTarget.getBoundingClientRect(); setRect(r); setOpen(value => !value); }}><MoreHorizontal size={18}/></button>{open && rect && createPortal(<div className="admin-row-menu" role="menu" data-admin-row-menu style={{ position:'fixed', top:Math.min(rect.bottom + 4, window.innerHeight - 220), left:Math.max(8, Math.min(rect.right - 190, window.innerWidth - 198)) }} onClick={() => setOpen(false)}>{children}</div>, document.body)}</span>;
}

export default function AdminDataTable({ heads, rows: rowNodes, module = '' }: Props) {
  const dialog=useDialog();const toast=useToast();
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ column: number; direction: 1 | -1 } | null>(null);
  const [dateFrom,setDateFrom]=useState('');const [dateTo,setDateTo]=useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const dateColumn = heads.findIndex(head => /date|created|time/i.test(head));
  const rows = useMemo<Row[]>(() => Children.toArray(rowNodes).filter(isValidElement).map((element, index) => {
    const cells = Children.toArray((element as ReactElement<{children?:ReactNode}>).props.children).filter(isValidElement) as ReactElement<{children?:ReactNode}>[];
    // React.Children.toArray prefixes explicit keys with `.$`. Strip that
    // renderer-only prefix so exported/bulk-action IDs match database IDs.
    const key = normalizeAdminTableId(element.key === null ? null : String(element.key), index);
    return { key, cells: cells.map(cell => cell.props.children), text: cells.map(cell => textOf(cell.props.children)), actionCell: heads.findIndex(head => /actions?/i.test(head)) };
  }), [rowNodes, heads]);
  const filtered = useMemo(() => {
    let result = rows.filter(row => {
      if (!row.text.join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) return false;
      if ((!dateFrom && !dateTo) || dateColumn < 0) return true;
      const timestamp = Date.parse(row.text[dateColumn] || '');
      if (!Number.isFinite(timestamp)) return true;
      const day = new Date(timestamp).toISOString().slice(0, 10);
      return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
    });
    if (sort) result = [...result].sort((a,b) => a.text[sort.column].localeCompare(b.text[sort.column], undefined, { numeric:true, sensitivity:'base' }) * sort.direction);
    return result;
  }, [rows, query, sort, dateFrom, dateTo, dateColumn]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page-1)*pageSize, page*pageSize);
  const visibleIds = visible.map(row => row.key);
  const selectedRows = rows.filter(row => selected.has(row.key));
  const toggle = (id:string) => setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const allVisible = visible.length > 0 && visible.every(row => selected.has(row.key));
  const updatePage = (next:number) => setPage(Math.max(1, Math.min(pageCount, next)));
  async function exportRecords(format:string, scope:'page'|'selected'|'filtered') {
    setBusy(true); setExportOpen(false);
    try {
      const ids = scope === 'selected' ? selectedRows.map(row=>row.key) : scope === 'page' ? visibleIds : undefined;
      const response = await fetch('/api/admin/export', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({module,format,ids,search:scope==='filtered'?query:undefined,columns:heads.filter((_,i)=>!hidden.has(i)),...(dateFrom?{dateFrom:new Date(`${dateFrom}T00:00:00`).toISOString()}:{}),...(dateTo?{dateTo:new Date(`${dateTo}T23:59:59.999`).toISOString()}:{}),...(sort?{sortBy:heads[sort.column],sortDirection:sort.direction===1?'asc':'desc'}:{})}) });
      if (!response.ok) { const result = await response.json().catch(()=>({})); throw new Error(result.error || 'Export could not be created.'); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href=url; link.download=response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1] || `${module||'admin-report'}.${format}`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error('Export failed',error instanceof Error?error.message:'Export could not be created.'); }
    finally { setBusy(false); }
  }
  async function deleteRecords(scope:'selected'|'filtered'){
    if(module!=='users'&&module!=='creators')return;
    setBusy(true);try{const ids=scope==='selected'?selectedRows.map(row=>row.key):undefined;const searchValue=scope==='filtered'?query:undefined;const countResponse=await fetch('/api/admin/bulk',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'count',module,scope,ids,search:searchValue})});const countData=await countResponse.json();if(!countResponse.ok)throw new Error(countData.error||'Could not count eligible accounts.');const count=Number(countData.count||0);if(!count){toast.info('No eligible accounts','Protected or previously deleted accounts are excluded.');return}if(scope==='filtered'){if(!await dialog.confirm({title:`Soft delete ${count} matching accounts?`,description:'These accounts will be deactivated and marked deleted. Administrator accounts are excluded, and no related records or financial history will be removed.',confirmLabel:`Continue with ${count}`,danger:true}))return;const typed=await dialog.prompt({title:'Confirm bulk deletion',description:`Type DELETE ALL to soft delete exactly ${count} eligible accounts. This action is recorded in the audit log.`,confirmLabel:'Continue',inputLabel:'Confirmation phrase',inputPlaceholder:'DELETE ALL'});if(typed!=='DELETE ALL')return;if(!await dialog.confirm({title:`Confirm final deletion of ${count} accounts?`,description:'This is the second confirmation. The accounts are soft deleted; their financial and call history remains intact.',confirmLabel:'Soft delete accounts',danger:true}))return}else if(!await dialog.confirm({title:`Soft delete ${count} selected accounts?`,description:'Accounts are deactivated and marked deleted. Administrator accounts are excluded, and financial or call history remains intact.',confirmLabel:`Delete ${count}`,danger:true}))return;const response=await fetch('/api/admin/bulk',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'delete',module,scope,ids,search:searchValue,expectedCount:count,...(scope==='filtered'?{confirmation:'DELETE ALL',secondConfirmation:true}:{})})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not delete accounts.');setSelected(new Set());toast.success('Accounts soft deleted',`${result.deleted} account${result.deleted===1?'':'s'} updated.`);window.dispatchEvent(new CustomEvent('velora-admin-refresh'));
    }catch(error){toast.error('Bulk action failed',error instanceof Error?error.message:'Could not delete accounts.')}finally{setBusy(false)}}
  if (!heads.length) return null;
  return <div className="admin-data-table-wrap">
    <AdminTableToolbar><label className="admin-table-search">Search this table<input value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="Search records"/></label><div className="admin-table-date-filters"><label>From<DatePicker value={dateFrom} onChange={setDateFrom} ariaLabel="Filter from date" placeholder="From date"/></label><label>To<DatePicker value={dateTo} onChange={setDateTo} ariaLabel="Filter to date" placeholder="To date"/></label></div><div className="admin-table-tool-actions"><div className="admin-table-menu-holder"><button type="button" className="admin-table-tool" onClick={()=>setColumnsOpen(v=>!v)}><Settings2 size={15}/>Columns<ChevronDown size={13}/></button>{columnsOpen&&<div className="admin-table-column-menu">{heads.map((head,index)=><label key={head}><input type="checkbox" checked={!hidden.has(index)} onChange={()=>setHidden(current=>{const next=new Set(current);next.has(index)?next.delete(index):next.add(index);return next})}/>{head}</label>)}</div>}</div><div className="admin-table-menu-holder"><button type="button" className="admin-table-tool" disabled={busy||!module} onClick={()=>setExportOpen(v=>!v)}><Download size={15}/>{busy?'Preparing…':'Export'}<ChevronDown size={13}/></button>{exportOpen&&<div className="admin-table-column-menu admin-table-export-menu">{['csv','xlsx','json','pdf'].map(format=><section key={format}><b>{format.toUpperCase()}</b>{(['page','selected','filtered'] as const).map(scope=><button key={scope} type="button" disabled={scope==='selected'&&!selected.size} onClick={()=>void exportRecords(format,scope)}>{scope==='page'?'Current page':scope==='selected'?`Selected (${selected.size})`:'All matching'}</button>)}</section>)}</div>}</div><button type="button" className="admin-table-tool" disabled={busy||refreshing} onClick={()=>{setRefreshing(true);window.dispatchEvent(new CustomEvent('velora-admin-refresh',{detail:{complete:()=>setRefreshing(false)}}))}}><RefreshCw className={refreshing?'admin-refresh-spinning':''} size={14}/>{refreshing?'Refreshing…':'Refresh'}</button></div></AdminTableToolbar>
    {filtered.length>pageSize&&selected.size<filtered.length&&<div className="admin-table-select-matching"><button type="button" onClick={()=>setSelected(current=>new Set([...current,...filtered.map(row=>row.key)]))}>Select all {filtered.length} matching loaded records</button></div>}
    {selected.size>0&&<div className="admin-table-bulk"><b>{selected.size} selected</b><button type="button" onClick={()=>void exportRecords('csv','selected')}>Export selected</button>{['users','creators'].includes(module)&&<button type="button" disabled={busy} onClick={()=>void deleteRecords('selected')}><Trash2 size={13}/>Soft delete selected</button>}<button type="button" onClick={()=>setSelected(new Set())}>Clear selection</button></div>}{['users','creators'].includes(module)&&<div className="admin-table-filtered-delete"><button type="button" disabled={busy} onClick={()=>void deleteRecords('filtered')}><Trash2 size={13}/>Soft delete all matching filter</button><span>Protected admin accounts and financial history are retained.</span></div>}
    <div className="admin-v2-table admin-data-table"><table><thead><tr><th className="admin-table-checkbox"><input type="checkbox" aria-label="Select current page" checked={allVisible} onChange={()=>setSelected(current=>{const next=new Set(current);allVisible?visibleIds.forEach(id=>next.delete(id)):visibleIds.forEach(id=>next.add(id));return next})}/></th>{heads.map((head,index)=><th key={head} hidden={hidden.has(index)}><button type="button" className="admin-table-sort" onClick={()=>setSort(current=>current?.column===index?{column:index,direction:current.direction===1?-1:1}:{column:index,direction:1})}>{head}{sort?.column===index?(sort.direction===1?' ↑':' ↓'):null}</button></th>)}{!heads.some(head=>/actions?/i.test(head))&&<th>Actions</th>}</tr></thead><tbody>{visible.length?visible.map(row=><tr key={row.key}><td className="admin-table-checkbox"><input type="checkbox" aria-label="Select record" checked={selected.has(row.key)} onChange={()=>toggle(row.key)}/></td>{row.cells.map((cell,index)=><td key={index} hidden={hidden.has(index)}>{index===row.actionCell?<RowMenu>{textOf(cell)?cell:<span className="admin-row-menu-empty">No additional actions for this record</span>}</RowMenu>:cell}</td>)}{row.actionCell<0&&<td><RowMenu><span className="admin-row-menu-empty">No additional actions for this record</span></RowMenu></td>}</tr>):<tr><td colSpan={heads.length+2} className="admin-table-empty">{query?'No records match this search.':'No records available.'}</td></tr>}</tbody></table></div>
    <div className="admin-table-pagination"><span>{filtered.length?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,filtered.length)} of ${filtered.length} loaded records`: '0 records'}{selected.size>0?` · ${selected.size} selected`:''}</span><label>Rows <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}>{[10,25,50,100].map(size=><option key={size}>{size}</option>)}</select></label><button type="button" disabled={page<=1} onClick={()=>updatePage(page-1)} aria-label="Previous page"><ChevronLeft size={16}/></button><span>Page {page} of {pageCount}</span><button type="button" disabled={page>=pageCount} onClick={()=>updatePage(page+1)} aria-label="Next page"><ChevronRight size={16}/></button></div>
  </div>;
}
