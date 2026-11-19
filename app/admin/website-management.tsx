'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, ImagePlus, Monitor, Save, Smartphone, Trash2, UploadCloud } from 'lucide-react';
import type { CmsContent } from '@/lib/cms';
import { cmsContent, cmsPageCatalog, defaultCmsContent } from '@/lib/cms';
import { readApiJson } from '@/lib/client-api';
import { useDialog } from '@/app/ui/dialog-provider';

type CmsPageRow = { id: string; slug: string; title: string; draftContent: unknown; publishedContent: unknown; publishedAt: string | null; revisions: { id: string; createdAt: string; content: unknown; author?: { displayName: string } }[] };
type CmsMediaRow = { id: string; url: string; filename: string; mimeType: string; sizeBytes: number; altText: string; createdAt: string };
type CmsData = { pages: CmsPageRow[]; media: CmsMediaRow[] };
const tabs = [['pages','Pages'],['media','Media Library'],['navigation','Navigation & Footer'],['seo','SEO Settings']] as const;
const hrefs = ['/dashboard','#match','#hero','#discover','#how-it-works','#safety','#coins','#footer','/terms','/privacy','/discover'];

export default function WebsiteManagement({ section }: { section: string }) {
  const dialog=useDialog();
  const [data, setData] = useState<CmsData | null>(null);
  const [selected, setSelected] = useState('homepage');
  const [content, setContent] = useState<CmsContent>(defaultCmsContent);
  const [savedContent, setSavedContent] = useState<CmsContent>(defaultCmsContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);
  const [device, setDevice] = useState<'desktop'|'tablet'|'mobile'>('desktop');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAlt, setUploadAlt] = useState('');
  const [mediaSearch,setMediaSearch]=useState('');
  const activeTab = section.split('/')[1] || 'pages';
  const currentPage = useMemo(() => data?.pages.find(page => page.slug === selected), [data, selected]);

  async function load() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/cms', { cache: 'no-store' });
      const result = await readApiJson(response, 'Could not load Website Management.') as CmsData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not load Website Management.');
      setData(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load Website Management.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener('velora-admin-refresh', refresh);
    return () => window.removeEventListener('velora-admin-refresh', refresh);
  }, []);
  useEffect(() => {
    const page = data?.pages.find(row => row.slug === selected);
    if (!page) return;
    const next = cmsContent(page.draftContent);
    setContent(next); setSavedContent(next); setPreview(false);
  }, [data, selected]);
  const dirty = JSON.stringify(content) !== JSON.stringify(savedContent);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function selectPage(slug: string) {
    if (slug === selected) return;
    if (dirty && !await dialog.confirm({ title: 'Discard unsaved changes?', description: 'Switching pages will discard the changes that have not been saved as a draft.', confirmLabel: 'Discard changes', danger: true })) return;
    setSelected(slug);
  }

  function update(path: string, value: unknown) {
    setContent(previous => {
      const next = structuredClone(previous) as any;
      const parts = path.split('.'); let target = next;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts[parts.length - 1]] = value;
      return next;
    });
  }
  async function save(action: 'draft'|'publish'): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/cms', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: selected, content, action }) });
      const result = await readApiJson(response, 'Could not save page content.') as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not save page content.');
      setNotice(action === 'publish' ? 'Published changes are now live.' : 'Draft saved. Public pages remain unchanged.');
      setSavedContent(structuredClone(content)); await load(); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save page content.'); }
    finally { setBusy(false); }
    return false;
  }
  async function previewDraft(openNewTab = false) {
    if (dirty && !await save('draft')) return;
    const path = `/admin/website-management/preview/${encodeURIComponent(selected)}`;
    if (openNewTab) window.open(path, '_blank', 'noopener,noreferrer');
    else setPreview(true);
  }
  async function upload() {
    if (!uploadFile) return;
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.set('file', uploadFile); form.set('altText', uploadAlt);
      const response = await fetch('/api/admin/cms/media', { method: 'POST', body: form });
      const result = await readApiJson(response, 'Could not upload image.') as { media?: CmsMediaRow; error?: string };
      if (!response.ok || !result.media) throw new Error(result.error || 'Could not upload image.');
      setData(previous => previous ? { ...previous, media: [result.media!, ...previous.media] } : previous);
      setUploadFile(null); setUploadAlt(''); setNotice('Image uploaded to the media library.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload image.'); }
    finally { setBusy(false); }
  }
  async function removeMedia(media: CmsMediaRow) {
    if (!await dialog.confirm({title:'Delete this media file?',description:`${media.filename} will be removed from the media library.`,confirmLabel:'Delete file',danger:true})) return;
    const response = await fetch(`/api/admin/cms/media/${encodeURIComponent(media.id)}`, { method: 'DELETE' });
    const result = await readApiJson(response, 'Could not delete media.') as { error?: string };
    if (!response.ok) { setError(result.error || 'Could not delete media.'); return; }
    setData(previous => previous ? { ...previous, media: previous.media.filter(item => item.id !== media.id) } : previous);
  }

  const field = (label: string, path: string, multiline = false) => {
    const current = path.split('.').reduce((value:any,key)=>value?.[key],content);
    return <label className="wm-field" key={path}>{label}{multiline ? <textarea value={Array.isArray(current)?current.join('\n'):String(current??'')} onChange={event=>update(path,Array.isArray(current)?event.target.value.split('\n').map((item:string)=>item.trim()).filter(Boolean):event.target.value)} rows={3}/> : <input value={String(current??'')} onChange={event=>update(path,event.target.value)}/>}</label>;
  };
  const toggle = (label:string,path:string) => <label className="wm-toggle" key={path}><span>{label}</span><input type="checkbox" checked={Boolean(path.split('.').reduce((value:any,key)=>value?.[key],content))} onChange={event=>update(path,event.target.checked)}/></label>;
  const pageName = cmsPageCatalog.find(([slug])=>slug===selected)?.[1] || 'Homepage';

  return <section className="wm-page">
    <div className="wm-tabs">{tabs.map(([id,label])=><a className={activeTab===id?'is-active':''} href={`/admin/website-management/${id}`} key={id}>{label}</a>)}</div>
    {error&&<div className="admin-v2-alert" role="alert">{error}</div>}{notice&&<div className="wm-notice" role="status"><Check size={15}/>{notice}</div>}
    {activeTab==='media'?<div className="wm-media-layout"><section className="admin-v2-card wm-upload"><h2>Media Library</h2><p>Upload reusable JPG, PNG, or WebP images up to 8 MB.</p><label>Choose image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setUploadFile(event.target.files?.[0]||null)}/></label><label>Image description<input value={uploadAlt} maxLength={180} onChange={event=>setUploadAlt(event.target.value)} placeholder="Describe this image"/></label><button disabled={!uploadFile||busy} onClick={()=>void upload()}><UploadCloud size={15}/>{busy?'Uploading…':'Upload image'}</button></section><div><label className="wm-search">Search media<input value={mediaSearch} onChange={event=>setMediaSearch(event.target.value)} placeholder="Filename or image description"/></label><div className="wm-media-grid">{data?.media.filter(media=>`${media.filename} ${media.altText}`.toLowerCase().includes(mediaSearch.toLowerCase())).map(media=><article className="admin-v2-card wm-media-card" key={media.id}><img src={media.url} alt={media.altText}/><b>{media.filename}</b><small>{(media.sizeBytes/1024).toFixed(0)} KB · {media.mimeType}</small><div><button onClick={async()=>{await navigator.clipboard.writeText(media.url);setNotice('Image URL copied. Paste it into the page image field, then save a draft.') }}>Copy image URL</button><button aria-label={`Delete ${media.filename}`} onClick={()=>void removeMedia(media)}><Trash2 size={15}/></button></div></article>)}</div></div></div>:activeTab==='pages'?<>
      <div className="wm-editor-actions"><div><span>WEBSITE MANAGEMENT / {pageName.toUpperCase()}</span><h2>{pageName}</h2><small>{dirty?'Unsaved changes':currentPage?.publishedAt?`Published ${new Date(currentPage.publishedAt).toLocaleString()}`:'Not published yet'}</small></div><div><button className="admin-v2-action" disabled={!dirty||busy} onClick={()=>setContent(structuredClone(savedContent))}>Discard Changes</button><button className="admin-v2-action" disabled={busy} onClick={()=>previewDraft()}><Monitor size={15}/>{preview?'Edit content':'Preview draft'}</button><button className="admin-v2-action" disabled={busy} onClick={()=>previewDraft(true)}><ArrowUpRight size={15}/>Open preview in new tab</button><button className="admin-v2-action" disabled={!dirty||busy} onClick={()=>void save('draft')}><Save size={15}/>{busy?'Saving…':'Save Draft'}</button><button className="wm-publish" disabled={busy||!dirty} onClick={()=>void save('publish')}>{busy?'Saving…':'Publish'}</button></div></div>
      <div className="wm-visual-editor"><aside className="wm-section-list"><b>Pages</b>{cmsPageCatalog.map(([slug,title])=><button className={slug===selected?'is-active':''} key={slug} onClick={()=>void selectPage(slug)}>{title}</button>)}<hr/><b>Sections</b>{['Hero','Discover','Coins','Safety','Footer'].map(label=><a key={label} href={`#wm-${label.toLowerCase()}`}>{label}</a>)}</aside>
        <div className={`wm-preview${device==='mobile'?' is-mobile':device==='tablet'?' is-tablet':''}`}><div className="wm-preview-toolbar"><span>{preview?'SAVED DRAFT PREVIEW':'PUBLIC PAGE PREVIEW'}</span><div><button aria-label="Desktop preview" onClick={()=>setDevice('desktop')}><Monitor size={15}/></button><button aria-label="Tablet preview" onClick={()=>setDevice('tablet')}>▭</button><button aria-label="Mobile preview" onClick={()=>setDevice('mobile')}><Smartphone size={15}/></button><button aria-label="Full screen preview" onClick={event=>{const frame=event.currentTarget.closest('.wm-preview') as HTMLElement;void (document.fullscreenElement?document.exitFullscreen():frame?.requestFullscreen())}}>⛶</button><button aria-label="Open draft preview in new tab" onClick={()=>void previewDraft(true)}><ArrowUpRight size={15}/></button></div></div>{preview?<iframe className="wm-preview-iframe" title={`${pageName} saved draft`} src={`/admin/website-management/preview/${encodeURIComponent(selected)}`}/>:<div className="wm-preview-site"><span className="wm-preview-nav">Flirra <span>Home　 Discover　 How It Works　 Safety　 Pricing　 About</span></span><div className="wm-preview-hero"><div><small>{content.hero.badge}</small><h2>{content.hero.heading.replace('\n',' ')}<br/><em>{content.hero.highlight}</em></h2><p>{content.hero.description}</p><div className="wm-preview-badge">●　{loadingCount(data)} People online now</div><button>{content.hero.ctaText}</button></div><img src={content.hero.image} alt={content.hero.imageAlt}/></div></div>}</div>
        <aside className="wm-settings-panel">{preview?<><h3>Draft preview</h3><p>This preview shows the current draft. It is only public after publishing.</p><button className="wm-publish" onClick={()=>setPreview(false)}>Return to editor</button></>:<>
          <section id="wm-hero"><h3>Hero Section</h3>{field('Badge text','hero.badge')}{field('Heading lines','hero.heading',true)}{field('Highlighted heading','hero.highlight')}{field('Description','hero.description',true)}<label className="wm-field">Hero image<select value={data?.media.some(item=>item.url===content.hero.image)?content.hero.image:''} onChange={event=>event.target.value&&update('hero.image',event.target.value)}><option value="">Use existing/custom image URL</option>{data?.media.map(item=><option key={item.id} value={item.url}>{item.filename}{item.altText?` · ${item.altText}`:''}</option>)}</select><input aria-label="Hero image URL" value={content.hero.image} onChange={event=>update('hero.image',event.target.value)} placeholder="/images/hero.jpg"/><small>Choose an uploaded media file or keep an existing local image URL.</small>{content.hero.image&&<img className="wm-image-preview" src={content.hero.image} alt={content.hero.imageAlt||'Selected hero image preview'}/>}</label>{field('Image alternative text','hero.imageAlt')}{field('CTA text','hero.ctaText')}<label className="wm-field">CTA destination<select value={content.hero.ctaHref} onChange={event=>update('hero.ctaHref',event.target.value)}><option value="/dashboard">Video call flow</option><option value="#match">Matching selector</option></select></label></section>
          <section id="wm-discover"><h3>Discover Section</h3>{toggle('Show section','sections.discover.visible')}{field('Heading','sections.discover.heading')}{field('Description','sections.discover.description',true)}{field('CTA text','sections.discover.ctaText')}</section>
          <section id="wm-coins"><h3>Coins Section</h3>{toggle('Show section','sections.coins.visible')}{field('Heading','sections.coins.heading')}{field('Description','sections.coins.description',true)}{field('Package artwork URLs (one per line)','sections.coins.artwork',true)}</section>
          <section id="wm-safety"><h3>Safety Section</h3>{toggle('Show section','sections.safety.visible')}{field('Heading','sections.safety.heading')}{field('Description','sections.safety.description',true)}{content.sections.safety.features.map((feature,index)=><div className="wm-feature-editor" key={index}><b>Feature {index+1}</b>{field('Title',`sections.safety.features.${index}.title`)}{field('Description',`sections.safety.features.${index}.description`)}<label className="wm-field">Icon<select value={feature.icon} onChange={event=>update(`sections.safety.features.${index}.icon`,event.target.value)}>{['privacy','report','verification','adults'].map(icon=><option key={icon}>{icon}</option>)}</select></label><button className="admin-v2-action" onClick={()=>update('sections.safety.features',content.sections.safety.features.filter((_,i)=>i!==index))}>Remove feature</button></div>)}{content.sections.safety.features.length<8&&<button className="admin-v2-action" onClick={()=>update('sections.safety.features',[...content.sections.safety.features,{title:'New feature',description:'Describe this safety feature.',icon:'privacy'}])}>Add safety feature</button>}</section>
          <section id="wm-footer"><h3>Footer</h3>{field('Brand description','footer.description',true)}<small>Footer links and navigation are managed in Navigation &amp; Footer.</small></section>
          <section><h3>Search engine</h3>{field('Page title','seo.title')}{field('Meta description','seo.description',true)}</section>
        </>}</aside>
      </div>
    </>:activeTab==='navigation'?<div className="admin-v2-card wm-navigation"><h2>Navigation &amp; Footer</h2><p>Edit navigation labels and internal destinations. Only local paths and page anchors are accepted.</p><h3>Navigation items</h3>{content.navigation.map((item,index)=><div className="wm-link-row" key={index}><input aria-label="Navigation label" value={item.label} onChange={event=>update(`navigation.${index}.label`,event.target.value)}/><select aria-label="Navigation destination" value={item.href} onChange={event=>update(`navigation.${index}.href`,event.target.value)}>{hrefs.map(href=><option key={href} value={href}>{href}</option>)}</select><button onClick={()=>update('navigation',content.navigation.filter((_,i)=>i!==index))}><Trash2 size={15}/></button></div>)}<button className="admin-v2-action" onClick={()=>update('navigation',[...content.navigation,{label:'New link',href:'#discover'}])}>Add navigation link</button><h3>Footer links</h3>{content.footer.links.map((item,index)=><div className="wm-link-row" key={index}><input aria-label="Footer link label" value={item.label} onChange={event=>update(`footer.links.${index}.label`,event.target.value)}/><select aria-label="Footer destination" value={item.href} onChange={event=>update(`footer.links.${index}.href`,event.target.value)}>{hrefs.map(href=><option key={href} value={href}>{href}</option>)}</select><button onClick={()=>update('footer.links',content.footer.links.filter((_,i)=>i!==index))}><Trash2 size={15}/></button></div>)}<button className="admin-v2-action" onClick={()=>update('footer.links',[...content.footer.links,{label:'New link',href:'#footer'}])}>Add footer link</button><div className="wm-editor-actions"><button className="admin-v2-action" onClick={()=>setContent(structuredClone(savedContent))}>Discard Changes</button><button className="admin-v2-action" disabled={busy} onClick={()=>void save('draft')}>Save Draft</button><button className="wm-publish" disabled={busy} onClick={()=>void save('publish')}>Publish</button></div></div>:<div className="admin-v2-card wm-seo"><h2>SEO Settings</h2>{field('Homepage title','seo.title')}{field('Meta description','seo.description',true)}<div className="wm-editor-actions"><button className="admin-v2-action" onClick={()=>setContent(structuredClone(savedContent))}>Discard Changes</button><button className="admin-v2-action" disabled={busy} onClick={()=>void save('draft')}>Save Draft</button><button className="wm-publish" disabled={busy} onClick={()=>void save('publish')}>Publish</button></div></div>}
  </section>;
}

function loadingCount(data: CmsData | null) { return data ? 'Live' : '—'; }
