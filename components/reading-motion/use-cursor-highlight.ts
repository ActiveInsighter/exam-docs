'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { highlightFrame, measureLines } from './geometry';
import styles from './cursor-highlight.module.css';

export type HighlightMode = 'idle' | 'playing' | 'complete';

/** Only active evidence measures or animates. React never renders animation frames. */
export function useCursorHighlight(rootRef: RefObject<HTMLSpanElement | null>, {
  mode, playKey, scrollRoot, onComplete,
}: {
  mode: HighlightMode;
  playKey: string | number;
  scrollRoot: HTMLElement | null;
  onComplete?: () => void;
}) {
  const callback = useRef(onComplete);
  useEffect(() => { callback.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const overlay = root.querySelector<HTMLElement>('[data-motion-overlay]')!;
    const cursor = root.querySelector<HTMLElement>('[data-motion-cursor]')!;
    const glyph = cursor.querySelector('svg')!;
    const text = root.querySelector<HTMLElement>('[data-motion-text]')!;
    if (mode === 'idle') {
      overlay.replaceChildren(); cursor.style.opacity = '0'; root.dataset.state = 'idle';
      return;
    }

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false, finished = false, frame = 0, progress = mode === 'complete' ? 1 : 0;
    let lines = measureLines(text, overlay.getBoundingClientRect());
    let fills: HTMLElement[] = [];
    let rtl = getComputedStyle(root).direction === 'rtl';
    const draw = () => {
      const pose = highlightFrame(lines, progress, rtl);
      fills.forEach((line, index) => { line.style.transform = `scaleX(${pose.fills[index]})`; });
      cursor.style.transform = `translate3d(${pose.x - 4}px, ${pose.y - 4}px, 0)`;
      cursor.style.opacity = String(reduced.matches ? 0 : pose.opacity);
      glyph.style.transform = `rotate(${pose.rotation}deg) scale(${pose.scale})`;
      root.dataset.state = progress === 1 ? 'complete' : 'playing';
    };
    const measure = () => {
      if (disposed) return;
      rtl = getComputedStyle(root).direction === 'rtl';
      lines = measureLines(text, overlay.getBoundingClientRect());
      fills = lines.map(line => {
        const fill = document.createElement('span');
        fill.className = styles.line;
        fill.dataset.motionLine = '';
        Object.assign(fill.style, { left: `${line.x}px`, top: `${line.y}px`, width: `${line.width}px`, height: `${line.height}px`, transformOrigin: rtl ? 'right center' : 'left center' });
        return fill;
      });
      overlay.replaceChildren(...fills);
      draw();
    };
    const complete = () => {
      progress = 1; draw();
      if (mode === 'playing' && !finished && !disposed) { finished = true; callback.current?.(); }
    };
    const motionChange = () => { if (reduced.matches) { cancelAnimationFrame(frame); complete(); } };
    const resize = new ResizeObserver(measure);
    resize.observe(text);
    if (root.parentElement) resize.observe(root.parentElement);
    reduced.addEventListener('change', motionChange);
    document.fonts?.ready.then(measure);
    document.fonts?.addEventListener('loadingdone', measure);
    measure();

    if (mode === 'playing') {
      const bounds = scrollRoot?.getBoundingClientRect();
      const rect = root.getBoundingClientRect();
      // Desktop scrolls only the article pane. Mobile brings the sentence into view.
      if (scrollRoot && bounds && scrollRoot.scrollHeight > scrollRoot.clientHeight + 1) {
        if (rect.top < bounds.top + 24 || rect.bottom > bounds.bottom - 24) {
          scrollRoot.scrollTo({ top: scrollRoot.scrollTop + rect.top - bounds.top - (scrollRoot.clientHeight - rect.height) / 2, behavior: reduced.matches ? 'instant' : 'smooth' });
        }
      } else if (rect.top < 80 || rect.bottom > innerHeight - 40) root.scrollIntoView({ block: 'center', behavior: reduced.matches ? 'instant' : 'smooth' });

    }
    if (mode === 'complete' || reduced.matches) complete();
    else {
      let started: number | null = null;
      const requested = performance.now();
      let stableSince = requested, lastTop = root.getBoundingClientRect().top;
      const tick = (time: number) => {
        if (disposed) return;
        const top = root.getBoundingClientRect().top;
        if (Math.abs(top - lastTop) > 0.5) stableSince = time;
        lastTop = top;
        if (started === null && (time - stableSince >= 120 || time - requested >= 2500)) { measure(); started = time; }
        if (started !== null) {
          progress = Math.min(1, (time - started) / 1600);
          draw();
        }
        if (progress < 1) frame = requestAnimationFrame(tick);
        else complete();
      };
      frame = requestAnimationFrame(tick);
    }
    return () => {
      disposed = true; cancelAnimationFrame(frame); resize.disconnect();
      reduced.removeEventListener('change', motionChange);
      document.fonts?.removeEventListener('loadingdone', measure);
      overlay.replaceChildren(); cursor.style.opacity = '0';
    };
  }, [mode, playKey, rootRef, scrollRoot]);
}
