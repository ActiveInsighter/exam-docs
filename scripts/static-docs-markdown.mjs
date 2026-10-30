import { exportQuestionMarkdown } from './question-markdown.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getShortDocSlugPath } from '../lib/doc-paths.mjs';

/**
 * Static markdown generation for the CDN documentation package.
 *
 * Replaces the dynamic `app/llms.mdx/docs/[[...slug]]` route handler during
 * static export: source files under `content/docs` are converted directly
 * into plain markdown documents published next to the HTML pages.
 */

function normalizeSourcePath(relativePath) {
  return relativePath.replaceAll('\\', '/');
}

/**
 * Map a source path (relative to `content/docs`) to the page URL
 * following Fumadocs conventions (`index` files collapse to the folder).
 */
export function getStaticDocsPageUrl(relativePath) {
  const slug = getShortDocSlugPath(relativePath);

  return `/docs${slug ? `/${slug}` : ''}`;
}

/**
 * Map a source path (relative to `content/docs`) to the static markdown
 * output path (relative to the export root), e.g. `math/index.mdx` ->
 * `docs/math.md`.
 */
export function getStaticMarkdownOutputPath(relativePath) {
  const slug = getShortDocSlugPath(relativePath);

  return `docs${slug ? `/${slug}` : ''}.md`;
}

export function splitFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { frontmatter: '', body: content };

  return { frontmatter: match[1], body: content.slice(match[0].length) };
}

export function parseFrontmatterTitle(frontmatter) {
  const match = /^title:\s*(.+)$/m.exec(frontmatter);
  if (!match) return null;

  return match[1].trim().replace(/^["']|["']$/g, '').trim();
}

function countUnbalancedDelimiters(text) {
  let depth = 0;
  for (const character of text) {
    if (character === '{' || character === '(' || character === '[') depth += 1;
    if (character === '}' || character === ')' || character === ']') depth -= 1;
  }
  return depth;
}

const JSX_OPEN_TAG = /^<([A-Z][\w.-]*)((?:\s[^<>]*)?)\/?>/;
const JSX_CLOSE_TAG = /^<\/[A-Z][\w.-]*>/;
const JSX_TRAILING_CLOSE_TAGS = /(?:\s*<\/[A-Z][\w.-]*>)+\s*$/;
const JSX_COMMENT_LINE = /^\{\/\*.*\*\/\}$/;
// Labels keep question structure readable once the wrapper tags are gone.
const JSX_LABELS = new Map([
  ['ExamAnswer', '答案：'],
  ['ExamExplanation', '解析：'],
]);

function isJsxComponentLine(trimmedLine) {
  return /^<\/?[A-Z][\w.-]*(\s|>|\/>)/.test(trimmedLine);
}

/**
 * Scan JSX tag text for the `>` that closes the opening tag, skipping quoted
 * strings and `{...}` attribute expressions. Returns the scanner state so a
 * tag whose attributes span several lines can be followed line by line.
 */
function scanJsxTag(text, state = { depth: 0, quote: null }) {
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (state.quote) {
      if (character === state.quote) state.quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') state.quote = character;
    else if (character === '{') state.depth += 1;
    else if (character === '}') state.depth -= 1;
    else if (character === '>' && state.depth === 0) return { ...state, closed: true };
  }
  return { ...state, closed: false };
}

function getJsxAttribute(attributes, name) {
  const match = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`).exec(attributes);
  return match ? (match[1] ?? match[2]) : undefined;
}

/**
 * Turn a line that starts with a JSX component tag into plain markdown.
 * Wrapper tags are dropped but the text between them is kept, so
 * `<ExamOption>A. foo</ExamOption>` becomes `A. foo`.
 */
function unwrapJsxComponentLine(trimmedLine) {
  let rest = trimmedLine;
  let label;

  for (;;) {
    const close = JSX_CLOSE_TAG.exec(rest);
    if (close) {
      rest = rest.slice(close[0].length).trimStart();
      continue;
    }

    const open = JSX_OPEN_TAG.exec(rest);
    if (!open) break;

    const [tag, name, attributes] = open;
    if (!tag.endsWith('/>')) {
      label ??=
        JSX_LABELS.get(name) ??
        getJsxAttribute(attributes, 'title') ??
        (name === 'Tab' ? getJsxAttribute(attributes, 'value') : undefined);
    }
    rest = rest.slice(tag.length).trimStart();
  }

  // A tag we cannot parse on one line (for example attributes spread over
  // several lines) is dropped, matching the previous behaviour.
  if (/^<\/?[A-Z]/.test(rest)) return [];

  const text = rest.replace(JSX_TRAILING_CLOSE_TAGS, '').trim();
  if (label) return [text ? `**${label}** ${text}` : `**${label}**`];
  return text ? [text] : [];
}

/**
 * Remove MDX module syntax (import/export statements), JSX comments and
 * component wrapper tags while preserving markdown content, math delimiters,
 * text nested inside components, and fenced code blocks untouched.
 */
export function stripMdxRuntimeSyntax(body) {
  const lines = exportQuestionMarkdown(body).split(/\r?\n/);
  const kept = [];
  let codeFence = null;
  let statementDepth = 0;
  // Scanner state while inside an opening tag whose attributes span lines.
  let openTag = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (openTag) {
      const state = scanJsxTag(line, openTag);
      openTag = state.closed ? null : state;
      continue;
    }

    const fence = /^ {0,3}(`{3,}|~{3,})(.*)/.exec(line);
    if (codeFence) {
      if (fence && fence[1][0] === codeFence[0] && fence[1].length >= codeFence.length && !fence[2].trim()) codeFence = null;
      kept.push(line);
      continue;
    }
    if (fence) {
      codeFence = fence[1];
      kept.push(line);
      continue;
    }
    // Component expansion adds paragraph boundaries; avoid excessive blank lines.
    if (!trimmed && kept.at(-1)?.trim() === '') continue;

    if (statementDepth > 0) {
      statementDepth += countUnbalancedDelimiters(line);
      if (statementDepth <= 0) statementDepth = 0;
      continue;
    }

    if (/^(import|export)[\s{(]/.test(trimmed)) {
      statementDepth = countUnbalancedDelimiters(line);
      continue;
    }

    if (JSX_COMMENT_LINE.test(trimmed)) continue;

    // `<MathPlot2D` followed by attributes on later lines: drop the whole tag.
    if (/^<[A-Z][\w.-]*(\s|$)/.test(trimmed)) {
      const state = scanJsxTag(trimmed.slice(1));
      if (!state.closed) {
        openTag = state;
        continue;
      }
    }

    if (isJsxComponentLine(trimmed)) {
      kept.push(...unwrapJsxComponentLine(trimmed));
      continue;
    }

    // Multi-line components close at the end of their last text line.
    kept.push(trimmed.endsWith('>') ? line.replace(JSX_TRAILING_CLOSE_TAGS, '') : line);
  }

  return kept.join('\n');
}

/**
 * Render a source document as standalone Markdown, shared by static downloads
 * and the LLM route through `lib/get-llm-text.ts`.
 */
export async function renderStaticMarkdown(content, { title, url }) {
  const { body } = splitFrontmatter(content);
  const cleanedBody = stripMdxRuntimeSyntax(body).trim();

  return `# ${title} (${url})\n\n${cleanedBody}\n`;
}

/**
 * Read a source document and produce both its static output path and its
 * rendered markdown content.
 */
export async function buildStaticMarkdownDocument(sourcePath, relativePath) {
  const content = await readFile(sourcePath, 'utf8');
  const { frontmatter } = splitFrontmatter(content);
  const slug = getShortDocSlugPath(relativePath);
  const fallbackTitle = slug.split('/').pop() || 'Untitled';
  const title = parseFrontmatterTitle(frontmatter) ?? fallbackTitle;

  return {
    outputPath: getStaticMarkdownOutputPath(relativePath),
    markdown: await renderStaticMarkdown(content, {
      title,
      url: getStaticDocsPageUrl(relativePath),
    }),
  };
}

export function isStaticDocSourceFile(filePath) {
  return /\.(md|mdx)$/i.test(path.basename(filePath));
}
