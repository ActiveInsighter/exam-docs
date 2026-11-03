/*
 * Where a reader's answer came from.
 *
 * Every saved answer already carries the path of the page it was given on
 * (`documentPath`). The sidebar tree turns that path into a readable source:
 * the module (the sidebar tab, e.g. 数学 / 408), the folders below it and the
 * page title. Titles are therefore never copied into the reader's records:
 * renaming a page or folder relabels old answers too, and the sync protocol
 * stays unchanged.
 *
 * The tree is plain data so it can be built on the server (with question
 * counts) and passed to a client component, or built in the browser from the
 * Fumadocs tree context (without counts).
 */

export interface SourcePage {
  kind: 'page';
  name: string;
  /** Normalised page path: decoded, no trailing slash. */
  url: string;
  /** Questions on the page, when known (server build); 0 otherwise. */
  questions: number;
}

export interface SourceFolder {
  kind: 'folder';
  name: string;
  children: SourceNode[];
  /** Sum of the questions of every page below. */
  questions: number;
}

export type SourceNode = SourcePage | SourceFolder;

/** The sidebar as sources: one folder per module (sidebar tab); loose pages go under "其他". */
export interface SourceTree {
  modules: SourceFolder[];
}

export interface ResolvedSource {
  /** The module (sidebar tab) name, e.g. "数学". */
  module: string;
  /** Folders between the module and the page, outermost first. */
  folders: string[];
  page: string;
  url: string;
  /** False when the page is no longer in the sidebar (moved or deleted). */
  known: boolean;
}

export const OTHER_MODULE = '其他';

/** Path form shared by stored answers and sidebar URLs: decoded, without trailing slash. */
export function normalizeDocPath(path: string): string {
  let decoded = path;
  try { decoded = decodeURI(path); } catch { /* keep the raw path */ }
  const bare = decoded.split(/[?#]/u)[0] ?? decoded;
  return bare.replace(/\/+$/u, '') || '/';
}

/* ------------------------------------------------------------------------
 * Building the tree from Fumadocs' page tree.
 * ---------------------------------------------------------------------- */

/** The subset of Fumadocs' PageTree this module reads (structurally typed, server or client). */
export interface PageTreeLike {
  type?: string;
  name?: unknown;
  url?: string;
  external?: boolean;
  root?: boolean;
  index?: { name?: unknown; url: string } | null;
  children?: PageTreeLike[];
}

function textOf(name: unknown, fallback: string): string {
  if (typeof name === 'string' && name.trim()) return name.trim();
  if (typeof name === 'number') return String(name);
  return fallback;
}

function lastSegment(url: string) {
  return normalizeDocPath(url).split('/').filter(Boolean).at(-1) ?? url;
}

function folderOf(node: PageTreeLike, count: (url: string) => number): SourceFolder {
  const children: SourceNode[] = [];
  if (node.index?.url) {
    const url = normalizeDocPath(node.index.url);
    children.push({ kind: 'page', name: textOf(node.index.name, lastSegment(url)), url, questions: count(url) });
  }
  for (const child of node.children ?? []) {
    const converted = convert(child, count);
    if (converted) children.push(converted);
  }
  return {
    kind: 'folder',
    name: textOf(node.name, '未命名目录'),
    children,
    questions: children.reduce((sum, child) => sum + child.questions, 0),
  };
}

function convert(node: PageTreeLike, count: (url: string) => number): SourceNode | null {
  if (node.type === 'folder') return folderOf(node, count);
  if (node.type === 'page' && node.url && !node.external) {
    const url = normalizeDocPath(node.url);
    return { kind: 'page', name: textOf(node.name, lastSegment(url)), url, questions: count(url) };
  }
  return null;
}

/**
 * Top-level folders become modules; top-level loose pages are collected into
 * one "其他" module so every record has a module.
 */
export function buildSourceTree(root: PageTreeLike, count: (url: string) => number = () => 0): SourceTree {
  const modules: SourceFolder[] = [];
  const loose: SourceNode[] = [];
  for (const child of root.children ?? []) {
    const converted = convert(child, count);
    if (!converted) continue;
    if (converted.kind === 'folder') modules.push(converted);
    else loose.push(converted);
  }
  if (loose.length) {
    modules.push({ kind: 'folder', name: OTHER_MODULE, children: loose, questions: loose.reduce((sum, page) => sum + page.questions, 0) });
  }
  return { modules };
}

/* ------------------------------------------------------------------------
 * Resolving stored paths.
 * ---------------------------------------------------------------------- */

export type SourceIndex = Map<string, ResolvedSource>;

export function indexSources(tree: SourceTree): SourceIndex {
  const index: SourceIndex = new Map();
  const walk = (node: SourceNode, module: string, folders: string[]) => {
    if (node.kind === 'page') {
      if (!index.has(node.url)) index.set(node.url, { module, folders, page: node.name, url: node.url, known: true });
      return;
    }
    for (const child of node.children) walk(child, module, [...folders, node.name]);
  };
  for (const module of tree.modules) {
    for (const child of module.children) walk(child, module.name, []);
  }
  return index;
}

/** A path the sidebar no longer lists still gets a readable label from its segments. */
export function resolveSource(index: SourceIndex | null, documentPath: string): ResolvedSource {
  const url = normalizeDocPath(documentPath);
  const found = index?.get(url);
  if (found) return found;
  const parts = url.split('/').filter((part) => part && part !== 'docs');
  return {
    module: OTHER_MODULE,
    folders: parts.slice(0, -1),
    page: parts.at(-1) ?? url,
    url,
    known: false,
  };
}

/** "数学 › 数学真题 › 2020" without the page itself. */
export function sourceTrail(source: ResolvedSource, separator = ' › '): string {
  return [source.module, ...source.folders].join(separator);
}

/* ------------------------------------------------------------------------
 * Question counts from MDX source (server side).
 * ---------------------------------------------------------------------- */

const QUESTION_OPEN_TAG = /^[ \t]*<Question\b[^>]*?\bid=/gmu;
const FENCE = /^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[^\n]*$/gmu;

/** Interactive questions in one MDX file; example code blocks are not counted. */
export function countQuestionsInMdx(source: string): number {
  return source.replace(FENCE, '').match(QUESTION_OPEN_TAG)?.length ?? 0;
}
