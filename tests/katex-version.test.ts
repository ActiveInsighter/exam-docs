import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const fromRoot = createRequire(join(process.cwd(), 'package.json'));

/** The KaTeX a package loads, resolved from inside that package. */
function katexUsedBy(pkg: string) {
  const entry = join(process.cwd(), 'node_modules', pkg, 'package.json');
  return createRequire(entry).resolve('katex');
}

/**
 * The layout imports `katex/dist/katex.css` from the root `katex`. KaTeX 0.18
 * renamed its internal classes (`.base` → `.katex-base`, `.sizing` →
 * `.katex-sizing`, …), so formulas rendered by any other KaTeX lose their
 * sizing and vertical layout. `overrides` in package.json pins it.
 */
describe('KaTeX version', () => {
  it('renders formulas with the KaTeX whose stylesheet the site loads', () => {
    expect(katexUsedBy('rehype-katex')).toBe(fromRoot.resolve('katex'));
  });
});
