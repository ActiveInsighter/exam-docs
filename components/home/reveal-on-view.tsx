'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/*
 * Marks its container once for a single reveal animation. Server HTML is
 * rendered in the final state (`data-reveal="static"`), so the content is
 * complete without JavaScript, for reduced-motion readers, and when the block
 * is already on screen at load. Only a block that starts below the fold is
 * "armed" (reset by CSS) and then "shown" when it scrolls into view.
 */
export function RevealOnView({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'static' | 'armed' | 'shown'>('static');

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (node.getBoundingClientRect().top < window.innerHeight) return;
    setState('armed');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState('shown');
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} data-reveal={state}>
      {children}
    </div>
  );
}
