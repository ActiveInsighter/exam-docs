'use client';

import {
  Component,
  Suspense,
  use,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTheme } from 'next-themes';
import { Check, Code, Copy, Download, Maximize2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMermaidPreset, type MermaidPreset } from '@/lib/mermaid-presets';
import { describeMermaidChart } from '@/lib/mermaid-kinds';
import { MermaidViewer } from '@/components/mdx/mermaid-viewer';

export interface MermaidProps {
  /** Mermaid source. Literal `\n` sequences are read as line breaks. */
  chart: string;
  /** Colour preset; defaults to the site theme (`modern`). */
  preset?: MermaidPreset;
  /** Label in the figure header. Defaults to the diagram type. */
  title?: string;
  /** Caption below the diagram. */
  caption?: ReactNode;
  className?: string;
}

interface RenderResult {
  svg: string;
  bindFunctions?: (element: Element) => void;
}

const renders = new Map<string, Promise<RenderResult>>();
let mermaidModule: Promise<typeof import('mermaid')> | undefined;
// Mermaid's configuration is global. Keep initialization and asynchronous
// rendering together so adjacent diagrams with different presets cannot
// overwrite each other.
let renderQueue: Promise<unknown> = Promise.resolve();
let renderCount = 0;

function renderChart(chart: string, preset: MermaidPreset | undefined, dark: boolean) {
  const key = JSON.stringify([chart, preset, dark]);
  let rendering = renders.get(key);
  if (!rendering) {
    rendering = renderQueue.then(async () => {
      const { default: mermaid } = await (mermaidModule ??= import('mermaid'));
      await document.fonts.ready;
      const config = { ...getMermaidPreset(preset, dark), suppressErrorRendering: true };
      // An explicit layout turns mindmaps into a top-down tree; leave them on
      // Mermaid's radial default.
      if (describeMermaidChart(chart).id === 'mindmap') delete config.layout;
      mermaid.initialize(config);
      return mermaid.render(`mermaid-${++renderCount}`, chart);
    });
    // A malformed diagram must not stop the remaining render queue.
    renderQueue = rendering.catch(() => undefined);
    renders.set(key, rendering);
  }
  return rendering;
}

export function Mermaid({ chart, preset, title, caption, className }: MermaidProps) {
  const source = useMemo(() => chart.replaceAll('\\n', '\n'), [chart]);
  const kind = useMemo(() => describeMermaidChart(source), [source]);
  const label = title ?? kind.label;
  const KindIcon = kind.icon;

  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  // Deferred, so a theme switch keeps the current diagram until the new one is ready.
  const dark = useDeferredValue(resolvedTheme === 'dark');
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [result, setResult] = useState<RenderResult | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copySource = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
    } catch {
      // Clipboard access can be denied outside secure contexts.
    }
  }, [source]);

  const downloadSvg = useCallback(() => {
    if (!result) return;
    const canvas = bodyRef.current ? getComputedStyle(bodyRef.current).backgroundColor : '';
    // The page background does not travel with the file; paint it into the SVG.
    const svg = canvas
      ? result.svg.replace(/^<svg([^>]*?)style="/, `<svg$1style="background-color:${canvas};`)
      : result.svg;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${toFileName(label)}.svg`;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoking right away can cancel the download before the browser reads the blob.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [label, result]);

  return (
    <figure className={cn('mermaid-figure not-prose', className)} data-mermaid="" data-kind={kind.id}>
      <div className="mermaid-header">
        <span className="mermaid-label">
          <KindIcon aria-hidden="true" />
          <span>{label}</span>
        </span>
        <div className="mermaid-actions" role="toolbar" aria-label={`${label}工具`}>
          <ToolButton
            label={showSource ? '查看图表' : '查看源码'}
            pressed={showSource}
            onClick={() => setShowSource((value) => !value)}
          >
            <Code />
          </ToolButton>
          <ToolButton label={copied ? '已复制' : '复制源码'} onClick={copySource}>
            {copied ? <Check /> : <Copy />}
          </ToolButton>
          <ToolButton label="下载 SVG" disabled={!result} onClick={downloadSvg}>
            <Download />
          </ToolButton>
          <ToolButton label="放大查看" disabled={!result} onClick={() => setViewerOpen(true)}>
            <Maximize2 />
          </ToolButton>
        </div>
      </div>

      <div ref={bodyRef} className="mermaid-body">
        {showSource ? (
          <pre className="mermaid-source">
            <code>{source}</code>
          </pre>
        ) : null}
        <div hidden={showSource}>
          {mounted ? (
            <MermaidErrorBoundary key={`${source}\u0000${preset}\u0000${dark}`} source={source}>
              <Suspense fallback={<MermaidSkeleton />}>
                <MermaidSvg chart={source} preset={preset} dark={dark} onRender={setResult} />
              </Suspense>
            </MermaidErrorBoundary>
          ) : (
            <MermaidSkeleton />
          )}
        </div>
      </div>

      {caption ? <figcaption className="mermaid-caption">{caption}</figcaption> : null}

      {viewerOpen && result ? (
        <MermaidViewer svg={result.svg} title={label} onClose={() => setViewerOpen(false)} />
      ) : null}
    </figure>
  );
}

function MermaidSvg({
  chart,
  preset,
  dark,
  onRender,
}: {
  chart: string;
  preset?: MermaidPreset;
  dark: boolean;
  onRender: (result: RenderResult) => void;
}) {
  const result = use(renderChart(chart, preset, dark));

  useEffect(() => onRender(result), [onRender, result]);

  const bind = useCallback(
    (container: HTMLDivElement | null) => {
      if (!container) return;
      result.bindFunctions?.(container);
      // Lets CSS stop wide diagrams from shrinking past legibility; they scroll instead.
      const svg = container.querySelector('svg');
      const width = svg?.viewBox.baseVal?.width;
      if (svg && width) svg.style.setProperty('--mermaid-natural-width', `${width}px`);
    },
    [result],
  );

  return <div ref={bind} className="mermaid-svg" dangerouslySetInnerHTML={{ __html: result.svg }} />;
}

function MermaidSkeleton() {
  return (
    <div className="mermaid-skeleton" role="status">
      <span className="mermaid-skeleton-graph" aria-hidden="true">
        <i />
        <b />
        <i />
        <b />
        <i />
      </span>
      <span>正在绘制图表…</span>
    </div>
  );
}

class MermaidErrorBoundary extends Component<
  { source: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mermaid-error" role="alert">
        <p className="mermaid-error-title">
          <TriangleAlert aria-hidden="true" />
          图表无法渲染，请检查 Mermaid 语法
        </p>
        <pre className="mermaid-error-message">{error.message}</pre>
      </div>
    );
  }
}

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="mermaid-button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function toFileName(label: string) {
  return label.trim().replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60) || 'diagram';
}
