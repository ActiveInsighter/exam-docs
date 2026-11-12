// @vitest-environment happy-dom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CheckIcon } from '@/components/animate-ui/icons/check';
import { CircleCheckIcon } from '@/components/animate-ui/icons/circle-check';

describe('feedback icon first paint', () => {
  for (const Icon of [CheckIcon, CircleCheckIcon]) {
    it(`starts ${Icon.name} undrawn before effects when playing a fresh verdict`, () => {
      const html = renderToStaticMarkup(createElement(Icon, { animate: 'path' }));
      const host = document.createElement('div');
      host.innerHTML = html;
      const path = host.querySelector('path')!;
      expect(path.style.opacity).toBe('0');
      expect(path.getAttribute('stroke-dasharray')).toBe('0 1');
    });

    it(`keeps restored ${Icon.name} fully visible without waiting for effects`, () => {
      const host = document.createElement('div');
      host.innerHTML = renderToStaticMarkup(createElement(Icon, { animate: false }));
      const path = host.querySelector('path')!;
      expect(path.style.opacity).toBe('1');
      expect(path.getAttribute('stroke-dasharray')).toBe('1 1');
    });
  }
});
