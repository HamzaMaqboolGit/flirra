'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion } from 'motion/react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  labelledBy?: string;
  className?: string;
  closeLabel?: string;
  closeButton?: boolean;
  closeOnOutside?: boolean;
};

const FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, children, label, labelledBy, className = '', closeLabel = 'Close dialog', closeButton = false, closeOnOutside = true }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [present, setPresent] = useState(open);
  const [visible, setVisible] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) {
      setVisible(false);
      const timer = window.setTimeout(() => setPresent(false), 160);
      return () => window.clearTimeout(timer);
    }
    setPresent(true);
    setVisible(true);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scrollY = window.scrollY;
    const oldStyles = { overflow: document.body.style.overflow, position: document.body.style.position, top: document.body.style.top, width: document.body.style.width };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    const frame = requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>('[autofocus], input, button:not(:disabled), [tabindex="0"]');
      (target || panel.current)?.focus();
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(item => item.getClientRects().length > 0);
      if (!items.length) { event.preventDefault(); panel.current.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = oldStyles.overflow;
      document.body.style.position = oldStyles.position;
      document.body.style.top = oldStyles.top;
      document.body.style.width = oldStyles.width;
      window.scrollTo(0, scrollY);
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [open]);

  if (!mounted || !present) return null;
  return createPortal(
    <div className={`velora-modal-overlay${visible ? ' is-open' : ' is-closing'}`} onMouseDown={event => { if (closeOnOutside && event.target === event.currentTarget) closeRef.current(); }}>
      <motion.section ref={panel} initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={visible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 4, scale: 0.99 }} transition={{ duration: visible ? 0.22 : 0.16, ease: [0.22, 1, 0.36, 1] }} className={`velora-modal-panel ${className}`} role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} tabIndex={-1}>
        {closeButton && <button className="velora-modal-close" type="button" onClick={() => closeRef.current()} aria-label={closeLabel}><X size={18} /></button>}
        {children}
      </motion.section>
    </div>, document.body,
  );
}
