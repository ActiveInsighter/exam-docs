import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHighlighter } from 'fumadocs-core/highlight';

const STATIC_CONTENT_ROOTS = ['content/docs', 'content/blog'] as const;
// Horizontal whitespace only: `\s` would cross the newline after a closing
// fence and mistake the next Markdown token (for example `##`) for a language.
const FENCE_LANGUAGE_PATTERN = /^(?:```|~~~)[ \t]*([A-Za-z0-9_+.#-]+)/gm;

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  'c#': 'csharp',
  'c++': 'cpp',
  cjs: 'javascript',
  js: 'javascript',
  mjs: 'javascript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  ts: 'typescript',
};

type HighlighterOptions = NonNullable<Parameters<typeof getHighlighter>[1]>;

export function extractCodeFenceLanguages(markdown: string): string[] {
  const languages = new Set<string>();

  for (const match of markdown.matchAll(FENCE_LANGUAGE_PATTERN)) {
    const raw = match[1]?.toLowerCase();
    if (!raw || raw === 'text' || raw === 'txt' || raw === 'plain') continue;
    languages.add(LANGUAGE_ALIASES[raw] ?? raw);
  }

  return [...languages].sort();
}

function collectMarkdownFiles(root: string): string[] {
  if (!existsSync(root)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(absolute));
      continue;
    }
    if (entry.isFile() && /\.mdx?$/i.test(entry.name)) files.push(absolute);
  }
  return files;
}

export function collectStaticCodeFenceLanguages(
  roots: readonly string[] = STATIC_CONTENT_ROOTS,
): string[] {
  const languages = new Set<string>();

  for (const root of roots) {
    for (const file of collectMarkdownFiles(root)) {
      for (const language of extractCodeFenceLanguages(readFileSync(file, 'utf8'))) {
        languages.add(language);
      }
    }
  }

  return [...languages].sort();
}

let preloadPromise: Promise<readonly string[]> | undefined;

/**
 * Fumadocs shares one Shiki instance while lazily loading grammars. During
 * parallel static rendering, two documents can otherwise race while the same
 * grammar is being initialized and produce different token boundaries. Prime
 * every language currently used by the static corpus before rehype-code runs.
 */
export function preloadStaticShiki(): Promise<readonly string[]> {
  if (preloadPromise) return preloadPromise;

  const languages = collectStaticCodeFenceLanguages();
  preloadPromise = getHighlighter('js', {
    // The scanner emits Shiki fence names at runtime. Fumadocs' highlighter
    // filters unknown names against its bundled-language registry before load;
    // keeping this boundary local avoids making Shiki a direct app dependency.
    langs: languages as HighlighterOptions['langs'],
    themes: ['github-light', 'github-dark'],
  }).then(() => {
    console.log(
      `[static-docs] Preloaded ${languages.length} Shiki language grammar(s): ${languages.join(', ') || '(none)'}.`,
    );
    return languages;
  });

  return preloadPromise;
}
