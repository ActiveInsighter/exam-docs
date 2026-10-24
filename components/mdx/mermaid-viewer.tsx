'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Minus, Plus, Scan, X } from 'lucide-react';

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const STEP = 1.25;

interface View {
  x: number;
  y: number;
  k: number;
}

/** Full-window pan and zoom view of a rendered Mermaid SVG, in a modal `<dialog>`. */
export function MermaidViewer({ svg, title, onClose }: { svg: string; title: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [scale, setScale] = useState(1);
  const size = readSize(svg);

  const apply = useCallback((next: View) => {
    view.current = next;
    if (contentRef.current) {
      contentRef.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.k})`;
    }
    setScale(next.k);
  }, []);

  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const { width, height } = stage.getBoundingClientRect();
    const pad = Math.min(48, width * 0.06);
    const k = clamp(Math.min((width - pad * 2) / size.width, (height - pad * 2) / size.height, 2));
    apply({ k, x: (width - size.width * k) / 2, y: (height - size.height * k) / 2 });
  }, [apply, size.height, size.width]);

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const px = cx ?? rect.width / 2;
      const py = cy ?? rect.height / 2;
      const { x, y, k } = view.current;
      const next = clamp(k * factor);
      apply({ k: next, x: px - (px - x) * (next / k), y: py - (py - y) * (next / k) });
    },
    [apply],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    fit();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = overflow;
    };
    // Open once on mount; refitting on every render would undo the user's zoom.
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // React's wheel listener is passive; zooming must prevent page scrolling.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAt(Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0015)), event.clientX - rect.left, event.clientY - rect.top);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = pointers.current;
    const previous = active.get(event.pointerId);
    if (!previous) return;
    const before = [...active.values()];
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (active.size === 1) {
      const { x, y, k } = view.current;
      apply({ k, x: x + event.clientX - previous.x, y: y + event.clientY - previous.y });
      return;
    }
    if (active.size === 2) {
      // Pinch: scale by the change in finger distance around their midpoint.
      const after = [...active.values()];
      const rect = event.currentTarget.getBoundingClientRect();
      const mid = midpoint(after);
      const lastMid = midpoint(before);
      const { x, y, k } = view.current;
      const next = clamp(k * (distance(after) / Math.max(distance(before), 1)));
      const cx = mid.x - rect.left;
      const cy = mid.y - rect.top;
      apply({
        k: next,
        x: cx - (lastMid.x - rect.left - x) * (next / k),
        y: cy - (lastMid.y - rect.top - y) * (next / k),
      });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === '+' || event.key === '=') zoomAt(STEP);
    else if (event.key === '-' || event.key === '_') zoomAt(1 / STEP);
    else if (event.key === '0') fit();
    else return;
    event.preventDefault();
  };

  return (
    <dialog ref={dialogRef} className="mermaid-viewer" aria-label={`${title}（放大查看）`} onClose={onClose} onKeyDown={onKeyDown}>
      <div className="mermaid-viewer-bar">
        <span className="mermaid-viewer-title">{title}</span>
        <div className="mermaid-viewer-tools" role="toolbar" aria-label="缩放">
          <button type="button" className="mermaid-button" title="缩小 (-)" aria-label="缩小" onClick={() => zoomAt(1 / STEP)}>
            <Minus />
          </button>
          <output className="mermaid-viewer-scale" aria-live="polite">
            {Math.round(scale * 100)}%
          </output>
          <button type="button" className="mermaid-button" title="放大 (+)" aria-label="放大" onClick={() => zoomAt(STEP)}>
            <Plus />
          </button>
          <button type="button" className="mermaid-button" title="适应窗口 (0)" aria-label="适应窗口" onClick={fit}>
            <Scan />
          </button>
          <span className="mermaid-viewer-separator" aria-hidden="true" />
          <button
            type="button"
            className="mermaid-button"
            title="关闭 (Esc)"
            aria-label="关闭"
            onClick={() => dialogRef.current?.close()}
          >
            <X />
          </button>
        </div>
      </div>
      <div
        ref={stageRef}
        className="mermaid-viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          zoomAt(2, event.clientX - rect.left, event.clientY - rect.top);
        }}
      >
        <div
          ref={contentRef}
          className="mermaid-viewer-content"
          style={{ width: size.width, height: size.height }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <p className="mermaid-viewer-hint">滚轮或双指缩放 · 拖动平移 · 双击放大 · Esc 关闭</p>
    </dialog>
  );
}

function readSize(svg: string) {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1].trim().split(/[\s,]+/).map(Number);
  const width = viewBox?.[2];
  const height = viewBox?.[3];
  return width && height ? { width, height } : { width: 800, height: 600 };
}

function clamp(k: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));
}

function distance([a, b]: { x: number; y: number }[]) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint([a, b]: { x: number; y: number }[]) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
