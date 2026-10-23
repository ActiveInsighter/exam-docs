'use client';

import { use, useEffect, useId, useState } from 'react';
import { useTheme } from 'next-themes';
import { getMermaidPreset, type MermaidPreset } from '@/lib/mermaid-presets';

export function Mermaid({ chart, preset }: { chart: string; preset?: MermaidPreset }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <MermaidContent chart={chart} preset={preset} />;
}

const cache = new Map<string, Promise<unknown>>();
// Mermaid's configuration is global. Keep initialization and asynchronous
// rendering together so adjacent theme specimens cannot overwrite each other.
let renderQueue: Promise<unknown> = Promise.resolve();

function cachePromise<T>(key: string, setPromise: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

function MermaidContent({ chart, preset }: { chart: string; preset?: MermaidPreset }) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const { default: mermaid } = use(
    cachePromise('mermaid', () => import('mermaid')),
  );

  const config = preset ? getMermaidPreset(preset, resolvedTheme === 'dark') : {
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    themeCSS: 'margin: 1.5rem auto 0;',
    theme: resolvedTheme === 'dark' ? 'dark' : 'default',
    // Mermaid 12 defaults to ELK/neo; keep existing documentation diagrams stable.
    layout: 'dagre',
    look: 'classic',
  } as const;

  const { svg, bindFunctions } = use(
    cachePromise(JSON.stringify([chart, resolvedTheme, preset]), () => {
      const rendering = renderQueue.then(async () => {
        await document.fonts.ready;
        mermaid.initialize(config);
        return mermaid.render(id, chart.replaceAll('\\n', '\n'));
      });
      // A malformed diagram must not stop the remaining render queue.
      renderQueue = rendering.catch(() => undefined);
      return rendering;
    }),
  );

  return (
    <div
      className="not-prose my-4 overflow-x-auto"
      ref={(container) => {
        if (container) bindFunctions?.(container);
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
