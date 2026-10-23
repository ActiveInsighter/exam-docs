import { createStaticSearchClient } from './static-search.mjs';
import type { SortedResult } from 'fumadocs-core/search';

export type SearchWorkerRequest = { urls: string[]; query: string; limit: number };
export type SearchWorkerResponse = { groups: SortedResult[][] } | { error: string };

// One short-lived worker per search tier. Index parsing/querying stays off the
// UI thread; processing shards sequentially avoids parallel JSON/DB peaks.
// The owner terminates us on completion, dialog close, hiding or a new query,
// releasing all parsed indexes even when the browser delays garbage collection.
self.onmessage = async ({ data }: MessageEvent<SearchWorkerRequest>) => {
  try {
    const groups: SortedResult[][] = [];
    for (const url of data.urls) {
      groups.push(await createStaticSearchClient(url, data.limit).search(data.query));
    }
    self.postMessage({ groups } satisfies SearchWorkerResponse);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) } satisfies SearchWorkerResponse);
  }
};
