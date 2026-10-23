import { create, load, search } from 'zbsearch';
import { createSearchTokenizer } from './search-tokenizer.mjs';

export function createStaticSearchClient(from, limit) {
  // Fumadocs' staticClient keeps a module-global, unbounded DB cache. Own the
  // database here so evicting a shard actually releases its parsed index.
  let loading;
  function database() {
    return loading ??= (async () => {
      const response = await fetch(from, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Failed to load search index: HTTP ${response.status}`);
      const data = await response.json();
      // Both core and body shards are emitted by exportSimpleIndex.
      if (data.type !== 'simple') throw new Error('Unsupported search index format.');
      const db = create({ schema: { _: 'string' }, components: { tokenizer: createSearchTokenizer() } });
      load(db, data);
      return db;
    })().catch((error) => { loading = undefined; throw error; });
  }
  return {
    async search(query) {
      // Edit distance 1 makes unrelated single Han characters match each other.
      const chinese = /\p{Script=Han}/u.test(query);
      const result = await search(await database(), {
        term: query, limit, tolerance: chinese ? 0 : 1,
        ...(chinese ? { threshold: 0 } : {}), boost: { title: 2 },
      });
      return result.hits.map(({ document }) => ({
        type: 'page', content: document.title, breadcrumbs: document.breadcrumbs,
        id: document.url, url: document.url,
      }));
    },
  };
}
