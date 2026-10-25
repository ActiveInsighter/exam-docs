import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guard the shared question / solution-card visual contract. These styles
 * intentionally live in CSS (not inline React code), so SSR alone cannot
 * detect an accidental token or cascade regression.
 */
const tokens = readFileSync(new URL('../styles/tokens/components.css', import.meta.url), 'utf8');
const question = readFileSync(new URL('../styles/question.css', import.meta.url), 'utf8');
const reveal = readFileSync(new URL('../styles/reveal.css', import.meta.url), 'utf8');

function values(name: string) {
  const pattern = new RegExp(`--${name}:\\s*([^;]+);`, 'g');
  return [...tokens.matchAll(pattern)].map((match) => match[1].trim());
}

describe('question solution card palette', () => {
  it('keeps both light and dark question panes strictly neutral', () => {
    const backgrounds = values('exam-solution-aside');
    expect(backgrounds).toHaveLength(2);
    for (const color of backgrounds) {
      expect(color).toMatch(/^oklch\([\d.]+ 0 0\)$/);
    }
    expect(values('exam-solution-aside-muted')).toHaveLength(2);
    for (const color of values('exam-solution-aside-muted')) {
      expect(color).toMatch(/^oklch\([\d.]+ 0 0\)$/);
    }
    expect(question).toContain('--modal-pane-muted: var(--exam-solution-aside)');
  });
});

describe('choice radial reveal', () => {
  it('has a distinct, visible selected fill in both themes', () => {
    const fills = values('exam-choice-active');
    expect(fills).toHaveLength(2);
    for (const fill of fills) {
      const proportion = fill.match(/var\(--foreground\) ([\d.]+)%/);
      expect(proportion).not.toBeNull();
      expect(Number(proportion![1])).toBeGreaterThanOrEqual(12);
    }
    expect(question).toMatch(/\[data-exam-choice-option\]\[data-feedback='selected'\][\s\S]*?--reveal-color: var\(--exam-choice-active\)/);
  });

  it('retains clearly visible graded states and continuous circle expansion', () => {
    for (const state of ['correct', 'incorrect', 'missed', 'answer']) {
      const fills = values(`exam-${state}-tint`);
      expect(fills).toHaveLength(2);
      for (const fill of fills) {
        const percent = fill.match(/\) ([\d.]+)%/);
        expect(percent).not.toBeNull();
        expect(Number(percent![1])).toBeGreaterThanOrEqual(12);
      }
    }
    expect(reveal).toContain('calc(var(--reveal-r, 150%) * var(--reveal-on))');
    expect(reveal).not.toContain('300% * max(0, var(--reveal-on)');
    expect(reveal).toContain('@media (prefers-reduced-motion: reduce)');
    expect(reveal).toContain('at var(--reveal-x, 50%) var(--reveal-y, 50%)');
  });
});
