'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, CircleAlert, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

type Kind = 'success' | 'error' | 'warning' | 'info' | 'loading';
type ToastItem = { id: string; kind: Kind; title: string; description?: string; action?: { label: string; onClick: () => void }; duration: number };
type PromiseMessages = { loading: string; success: string; error: string };
type ToastApi = {
  success(title: string, description?: string): string;
  error(title: string, description?: string, action?: ToastItem['action']): string;
  warning(title: string, description?: string, action?: ToastItem['action']): string;
  info(title: string, description?: string, action?: ToastItem['action']): string;
  loading(title: string, description?: string): string;
  dismiss(id: string): void;
  promise<T>(promise: Promise<T>, messages: PromiseMessages): Promise<T>;
};
const ToastContext = createContext<ToastApi | null>(null);
const life: Record<Kind, number> = { success: 3000, error: 6000, warning: 5000, info: 4000, loading: 0 };
const icons = { success: CheckCircle2, error: CircleAlert, warning: TriangleAlert, info: Info, loading: LoaderCircle };

export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside ToastProvider');
  return api;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const timers = useRef(new Map<string, number>());
  const queue = useRef<ToastItem[]>([]);
  useEffect(() => { setMounted(true); return () => timers.current.forEach(window.clearTimeout); }, []);
  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id); if (timer) window.clearTimeout(timer); timers.current.delete(id);
    setItems(current => {
      const next = current.filter(item => item.id !== id);
      const queued = queue.current.shift();
      if (queued) next.push(queued);
      return next;
    });
  }, []);
  const scheduleDismiss = useCallback((item: ToastItem, duration = item.duration) => {
    const existing = timers.current.get(item.id);
    if (existing) window.clearTimeout(existing);
    if (item.kind !== 'loading') timers.current.set(item.id, window.setTimeout(() => dismiss(item.id), duration));
  }, [dismiss]);
  useEffect(() => {
    const visible = new Set(items.map(item => item.id));
    for (const [id, timer] of timers.current) {
      if (!visible.has(id)) { window.clearTimeout(timer); timers.current.delete(id); }
    }
    for (const item of items) if (item.kind !== 'loading' && !timers.current.has(item.id)) scheduleDismiss(item);
  }, [items, scheduleDismiss]);
  const add = useCallback((kind: Kind, title: string, description?: string, action?: ToastItem['action']) => {
    const id = crypto.randomUUID(); const item = { id, kind, title, description, action, duration: life[kind] };
    setItems(current => {
      if (current.some(toast => toast.kind === kind && toast.title === title && toast.description === description)) return current;
      if (current.length >= 3) { queue.current.push(item); return current; }
      return [...current, item];
    });
    return id;
  }, [dismiss]);
  const api = useMemo<ToastApi>(() => ({
    success: (title, description) => add('success', title, description),
    error: (title, description, action) => add('error', title, description, action),
    warning: (title, description, action) => add('warning', title, description, action),
    info: (title, description, action) => add('info', title, description, action),
    loading: (title, description) => add('loading', title, description),
    dismiss,
    async promise<T>(promise: Promise<T>, messages: PromiseMessages) {
      const id = add('loading', messages.loading);
      try { const value = await promise; dismiss(id); add('success', messages.success); return value; }
      catch (error) { dismiss(id); add('error', messages.error); throw error; }
    },
  }), [add, dismiss]);
  return <ToastContext.Provider value={api}>{children}{mounted ? createPortal(<div className="velora-toast-stack" aria-live="polite" aria-relevant="additions text"><AnimatePresence initial={false}>{items.map(item => {
    const Icon = icons[item.kind];
    return <motion.article key={item.id} initial={{ opacity: 0, y: -8, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.995 }} layout transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className={`velora-toast is-${item.kind}`} role={item.kind === 'error' ? 'alert' : 'status'} onMouseEnter={() => { const timer = timers.current.get(item.id); if (timer) { window.clearTimeout(timer); timers.current.delete(item.id); } }} onMouseLeave={() => { if (item.kind !== 'loading' && !timers.current.has(item.id)) scheduleDismiss(item, Math.max(1000, item.duration / 2)); }}>
      <span className="velora-toast-icon"><Icon size={17} className={item.kind === 'loading' ? 'is-spinning' : ''}/></span><span className="velora-toast-copy"><b>{item.title}</b>{item.description&&<small>{item.description}</small>}{item.action&&<button className="velora-toast-action" onClick={item.action.onClick}>{item.action.label}</button>}</span><button className="velora-toast-close" onClick={() => dismiss(item.id)} aria-label="Dismiss notification"><X size={15}/></button>{item.kind !== 'loading'&&<i className="velora-toast-progress" style={{ animationDuration: `${item.duration}ms` }}/>}</motion.article>;
  })}</AnimatePresence></div>, document.body) : null}</ToastContext.Provider>;
}
