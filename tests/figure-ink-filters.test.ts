import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FigureInkFilters } from '@/components/question/figure-ink-filters';

describe('figure ink filters', () => {
  it('defines the light and dark filters question.css points figures at', () => {
    const markup = renderToStaticMarkup(createElement(FigureInkFilters));
    const css = readFileSync('styles/question.css', 'utf8');

    for (const id of ['exam-figure-ink', 'exam-figure-ink-dark']) {
      expect(markup).toContain(`id="${id}"`);
      expect(css).toContain(`url('#${id}')`);
    }
  });

  // The static build swaps scripts/static-root-layout.tsx in for app/layout.tsx.
  it('is mounted by both root layouts', () => {
    for (const layout of ['app/layout.tsx', 'scripts/static-root-layout.tsx']) {
      expect(readFileSync(layout, 'utf8'), layout).toContain('<FigureInkFilters />');
    }
  });
});
