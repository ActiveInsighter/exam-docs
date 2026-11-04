import katex from 'katex';

/*
 * Text blanks whose key is written in LaTeX ("\frac{\sqrt3}{3}",
 * "C_1 e^x + C_2 e^{3x}") are typeset once, at compile time, so the answer
 * key shows the formula instead of its source. The browser receives finished
 * KaTeX HTML (the page already loads KaTeX's stylesheet and fonts) and no
 * KaTeX runtime.
 *
 * Grading is unchanged: it still compares what the reader types against the
 * source text and its aliases.
 */

/** Calculator-style input ("2^(n-1)*n!", "sqrt(2)/2"), which LaTeX would misread. */
const CALCULATOR = /\^\(|\*|\b(?:sqrt|cbrt|abs)\(/u;

/** CJK text (and full-width punctuation) that has to leave math mode to keep its spaces. */
const CJK_RUN = /[\s]*[　-〿㐀-鿿＀-￯]+(?:[\s]+[　-〿㐀-鿿＀-￯]+)*[\s]*/gu;

/** True when the key reads as LaTeX rather than as plain words or a calculator expression. */
export function isTexAnswer(text: string): boolean {
  if (/\\[A-Za-z\\,;!{}]/u.test(text)) return true;
  if (CALCULATOR.test(text)) return false;
  return /[A-Za-z0-9)}]_(?:\{|[A-Za-z0-9])|\^\{/u.test(text);
}

/** Puts runs of CJK text into \text{…} unless the author already did. */
function wrapCjk(text: string): string {
  if (/\\(?:text|mbox|mathrm)\b/u.test(text)) return text;
  return text.replace(CJK_RUN, (run) => `\\text{${run}}`);
}

/**
 * KaTeX HTML for a LaTeX key, or null when the key is not LaTeX or does not
 * typeset (the key is then shown as written).
 */
export function renderTexAnswer(text: string): string | null {
  const source = text.trim();
  if (!source || !isTexAnswer(source)) return null;
  try {
    return katex.renderToString(wrapCjk(source), {
      displayMode: false,
      output: 'html',
      throwOnError: true,
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return null;
  }
}
