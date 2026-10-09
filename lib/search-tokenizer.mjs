/**
 * Use the same tokens in Node and browsers, regardless of ICU dictionary versions.
 * Han unigrams support single-character queries; bigrams preserve phrase order.
 * Source: https://www.zbsearch.dev/docs/zbsearch/internals/components
 */
export function createSearchTokenizer() {
  return {
    language: 'multilingual',
    normalizationCache: new Map(),
    tokenize(raw) {
      const tokens = [];
      for (const part of raw.normalize('NFKC').toLowerCase().split(/(\p{Script=Han}+)/u)) {
        if (/^\p{Script=Han}+$/u.test(part)) {
          const chars = Array.from(part);
          for (let index = 0; index < chars.length; index += 1) {
            tokens.push(chars[index]);
            if (index + 1 < chars.length) tokens.push(chars[index] + chars[index + 1]);
          }
        } else {
          tokens.push(...(part.match(/[\p{L}\p{N}]+/gu) ?? []));
        }
      }
      return [...new Set(tokens)];
    },
  };
}
