'use client';

import { AnimatePresence, MotionConfig, motion, type HTMLMotionProps } from 'motion/react';
import { usePathname } from 'next/navigation';
import { type ReactNode, useRef, useState } from 'react';

const ease = [0.22, 1, 0.36, 1] as const;

export function AppMotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease }}>{children}</MotionConfig>;
}

/** Route-level entrance that settles to `transform: none` so fixed app controls stay viewport-anchored. */
export function RouteMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const firstPath = useRef(pathname);
  const [settledPath, setSettledPath] = useState(pathname);
  const entering = pathname !== settledPath;
  const hasViewportAnchoredWorkspace = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
  const entrance = hasViewportAnchoredWorkspace ? { opacity: 1 } : { opacity: 1, y: 0 };

  return <AnimatePresence mode="wait" initial={false}>
    <motion.div
      className="flirra-route-motion"
      key={pathname}
      initial={firstPath.current === pathname ? false : hasViewportAnchoredWorkspace ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={entering ? entrance : { opacity: 1, transform: 'none' }}
      exit={hasViewportAnchoredWorkspace ? { opacity: 0 } : { opacity: 0, y: -5 }}
      transition={{ duration: 0.25, ease }}
      onAnimationComplete={() => {
        firstPath.current = pathname;
        setSettledPath(current => current === pathname ? current : pathname);
      }}
    >{children}</motion.div>
  </AnimatePresence>;
}

export function AnimatedPage({ children, className, ...props }: HTMLMotionProps<'main'>) {
  return <motion.main className={className} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease }} {...props}>{children}</motion.main>;
}

export function AnimatedCard({ children, className, ...props }: HTMLMotionProps<'article'>) {
  return <motion.article className={className} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.08 }} whileHover={{ y: -2 }} transition={{ duration: 0.22, ease }} {...props}>{children}</motion.article>;
}

export function AnimatedModal({ children, className, ...props }: HTMLMotionProps<'section'>) {
  return <motion.section className={className} initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.99 }} transition={{ duration: 0.22, ease }} {...props}>{children}</motion.section>;
}

export function AnimatedDropdown({ children, className, ...props }: HTMLMotionProps<'div'>) {
  return <motion.div className={className} initial={{ opacity: 0, y: -5, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -3, scale: 0.995 }} transition={{ duration: 0.18, ease }} {...props}>{children}</motion.div>;
}

export function AnimatedTabs({ children, className, ...props }: HTMLMotionProps<'div'>) {
  return <motion.div className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease }} {...props}>{children}</motion.div>;
}

export function AnimatedList({ children, className, ...props }: HTMLMotionProps<'div'>) {
  return <motion.div className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } } }} {...props}>{children}</motion.div>;
}

export function AnimatedListItem({ children, className, ...props }: HTMLMotionProps<'div'>) {
  return <motion.div className={className} variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }} transition={{ duration: 0.2, ease }} {...props}>{children}</motion.div>;
}

export function AnimatedButton({ children, className, ...props }: HTMLMotionProps<'button'>) {
  return <motion.button className={className} whileHover={{ scale: 1.012 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.15, ease }} {...props}>{children}</motion.button>;
}

export function AnimatedSidebar({ children, className, ...props }: HTMLMotionProps<'aside'>) {
  return <motion.aside className={className} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, ease }} {...props}>{children}</motion.aside>;
}

export function AnimatedToast({ children, className, ...props }: HTMLMotionProps<'article'>) {
  return <motion.article className={className} initial={{ opacity: 0, y: -8, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.995 }} layout transition={{ duration: 0.22, ease }} {...props}>{children}</motion.article>;
}

export function AnimatedPanel({ children, className, ...props }: HTMLMotionProps<'section'>) {
  return <motion.section className={className} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.25, ease }} {...props}>{children}</motion.section>;
}

export { AnimatePresence, motion };
