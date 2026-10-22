/**
 * Typed maths with typographic symbols, for places that show an answer as
 * plain text (footers, the solution sheet's copy of a question).
 */
export function prettyMath(text: string): string {
  return text
    .replace(/\bsqrt\b/gu, '√')
    .replace(/\bcbrt\b/gu, '∛')
    .replace(/\bpi\b/gu, 'π')
    .replace(/\*/gu, '×')
    .replace(/\^2(?![\d.])/gu, '²')
    .replace(/\^3(?![\d.])/gu, '³')
    .replace(/(?<=[\w)\]π²³ ])-(?=[\w(√π ])/gu, '−')
    .replace(/^-/u, '−');
}
