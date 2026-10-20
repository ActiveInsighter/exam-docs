import type { StructuredData } from 'fumadocs-core/mdx-plugins';
import type { Index } from 'fumadocs-core/search/server';

export const SEARCH_MANIFEST_VERSION: 2;
export const SEARCH_MANIFEST_MODE: 'routed-core-body-shards';
export const ZBSEARCH_WARNING_BYTES: 15000000;
export const ZBSEARCH_SOFT_MAX_BYTES: 10000000;
export const ZBSEARCH_MAX_BYTES: 25000000;
export const ZBSEARCH_SOURCE_TARGET_CHARS: 650000;
export const ZBSEARCH_CORE_SOURCE_TARGET_CHARS: 300000;
export const ZBSEARCH_MAX_SECTION_CHARS: 6000;
export const ZBSEARCH_CORE_HEADING_CHARS: 600;

export interface SearchScope {
  category: string;
  group: string;
}

export interface ZBSearchSourceIndex extends SearchScope {
  id: string;
  relativePath: string;
  title: string;
  description?: string;
  url: string;
  structuredData: StructuredData;
}

export interface CompressionSizes {
  bytes: number;
  gzipBytes: number;
  brotliBytes: number;
}

export interface BloomRoute {
  bits: number;
  hashes: number;
  tokens: number;
  data: string;
}

export interface RoutedSearchShard extends SearchScope, CompressionSizes {
  url: string;
  records: number;
  route: BloomRoute;
}

export interface SearchCategory {
  id: string;
  groups: string[];
  route: BloomRoute;
}

export interface ZBSearchIndexReport extends CompressionSizes {
  pages: number;
  records: number;
  categories: SearchCategory[];
  coreShards: RoutedSearchShard[];
  bodyShards: RoutedSearchShard[];
  core: CompressionSizes;
  body: CompressionSizes;
  manifest: CompressionSizes;
  outputFile: string;
}

export function sanitizeSearchText(value: unknown): string;
export function buildSearchRoutingTokens(value: unknown): string[];
export function getSearchScope(relativePath: string): SearchScope;
export function buildStructuredSearchData(content: string): StructuredData;
export function buildZBSearchSourceIndex(relativePath: string, content: string): ZBSearchSourceIndex;
export function buildZBSearchSectionIndexes(page: ZBSearchSourceIndex): Index[];
export function buildZBSearchCoreIndex(page: ZBSearchSourceIndex): Index;
export function collectZBSearchSourceIndexes(contentRoot?: string): Promise<ZBSearchSourceIndex[]>;
export function exportSimpleIndex(records: Index[]): Promise<string>;
export function buildZBSearchIndex(options: { contentRoot?: string; outputFile: string }): Promise<ZBSearchIndexReport>;
