import katex from 'katex';

/*
 * Renders the small amount of Markdown that question stems and options use on
 * the home page: `$…$` and `$$…$$` formulas (KaTeX, at build time) and
 * `**bold**`. Everything else is escaped text. The browser receives finished
 * HTML, so the home page ships no Markdown or KaTeX JavaScript.
 */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (character) => ESCAPES[character] ?? character);
}

function formula(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex.trim(), { displayMode, throwOnError: false, strict: 'ignore' });
}

/** One line of text: inline formulas and bold, no block structure. */
export function renderInline(source: string): string {
  return source
    .split(/(\$[^$\n]+\$)/gu)
    .map((part) => {
      if (part.length > 2 && part.startsWith('$') && part.endsWith('$')) return formula(part.slice(1, -1), false);
      return escapeHtml(part).replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>');
    })
    .join('');
}

/** Paragraphs separated by blank lines; a paragraph that is only `$$…$$` becomes display math. */
export function renderBlocks(source: string): string {
  return source
    .trim()
    .split(/\n\s*\n/u)
    .map((block) => {
      const display = /^\$\$([\s\S]+)\$\$$/u.exec(block.trim());
      if (display) return `<div data-display-math="">${formula(display[1] ?? '', true)}</div>`;
      return `<p>${renderInline(block.replace(/\s*\n\s*/gu, ' ').trim())}</p>`;
    })
    .join('');
}

/** Visible length of a source string, used to choose a compact option layout. */
export function plainLength(source: string): number {
  return source.replace(/\$[^$]+\$/gu, 'xxxx').replace(/\*\*/gu, '').trim().length;
}
