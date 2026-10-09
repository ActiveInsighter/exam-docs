import { staticClient } from 'fumadocs-core/search/client/orama-static';

export function createStaticSearchClient(from: string, limit: number): ReturnType<typeof staticClient>;
