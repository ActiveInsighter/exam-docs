import { staticClient } from 'fumadocs-core/search/client/orama-static';

export function createStaticSearchClient(from, limit) {
  return staticClient({ from, search: { limit } });
}
