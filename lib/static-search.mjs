import { staticClient } from 'fumadocs-core/search/client/orama-static';
import { create } from 'zbsearch';
import { createSearchTokenizer } from './search-tokenizer.mjs';

export function createStaticSearchClient(from, limit) {
  // initDB is Fumadocs' supported hook for loading a custom-tokenized export.
  const options = {
    from,
    initDB: () => create({ schema: { _: 'string' }, components: { tokenizer: createSearchTokenizer() } }),
  };
  const latinClient = staticClient({ ...options, search: { limit } });
  const chineseClient = staticClient({ ...options, search: { limit, tolerance: 0, threshold: 0 } });
  return {
    search(query) {
      // Edit distance 1 makes unrelated single Han characters match each other.
      return (/\p{Script=Han}/u.test(query) ? chineseClient : latinClient).search(query);
    },
  };
}
