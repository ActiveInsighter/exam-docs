import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OTHER_MODULE, type SourceFolder, type SourceNode } from '@/lib/doc-sources';
import { getSourceTree } from '@/lib/doc-sources.server';
import { source } from '@/lib/source';
import { featuredQuestions } from './content';
import { extractQuestion, stripSourceTag, tidyCjkSpacing } from './question-source';
import { plainLength, renderBlocks, renderInline } from './rich-text.server';
import type { BankModule, ExamHomeData, TrialQuestion } from './types';

/*
 * Everything countable on the home page, derived at build time from the same
 * source tree the sidebar and the settings page use. The result is plain,
 * serialisable data: server components render it and client islands receive
 * only the slices they need.
 */

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Links keep the trailing slash the static export serves directly. */
export function withTrailingSlash(url: string): string {
  const [path, hash] = url.split('#');
  const slashed = path?.endsWith('/') ? path : `${path}/`;
  return hash ? `${slashed}#${hash}` : slashed;
}

function countPages(node: SourceNode): number {
  return node.kind === 'page' ? 1 : node.children.reduce((sum, child) => sum + countPages(child), 0);
}

function firstUrl(node: SourceNode): string | null {
  if (node.kind === 'page') return node.url;
  for (const child of node.children) {
    const url = firstUrl(child);
    if (url) return url;
  }
  return null;
}

function toModule(folder: SourceFolder): BankModule | null {
  const href = firstUrl(folder);
  if (!href) return null;
  const collections = folder.children
    // The module's own index page is the module link, not a collection.
    .filter((child) => !(child.kind === 'page' && child.url === href))
    .map((child) => ({
      name: child.name,
      href: withTrailingSlash(firstUrl(child) ?? href),
      questions: child.questions,
      pages: countPages(child),
    }));
  return {
    name: folder.name,
    href: withTrailingSlash(href),
    questions: folder.questions,
    pages: countPages(folder),
    collections,
  };
}

function loadTrialQuestions(): TrialQuestion[] {
  const pages = source.getPages();
  return featuredQuestions.flatMap((ref) => {
    const page = pages.find((candidate) => candidate.path === ref.file);
    let mdx = '';
    try {
      mdx = readFileSync(resolve(process.cwd(), 'content/docs', ref.file), 'utf8');
    } catch {
      /* reported below */
    }
    const question = mdx ? extractQuestion(mdx, ref.id) : null;
    const answer = question?.options.findIndex((option) => option.correct) ?? -1;
    if (!page || !question || question.options.length < 2 || answer < 0) {
      console.warn(`[home] Featured question ${ref.id} in ${ref.file} could not be read; it is left out.`);
      return [];
    }
    return [
      {
        id: ref.id,
        subject: ref.subject,
        source: ref.source,
        stemHtml: renderBlocks(tidyCjkSpacing(stripSourceTag(question.stem))),
        options: question.options.map((option, index) => ({
          label: OPTION_LABELS[index] ?? String(index + 1),
          html: renderInline(tidyCjkSpacing(option.text)),
        })),
        answer,
        compact: question.options.every((option) => plainLength(option.text) <= 8),
        takeawayHtml: renderInline(ref.takeaway),
        href: withTrailingSlash(`${page.url}#question-${ref.id}`),
      },
    ];
  });
}

let cached: ExamHomeData | undefined;

export function getExamHomeData(): ExamHomeData {
  if (cached) return cached;
  const modules = getSourceTree()
    .modules.filter((module) => module.name !== OTHER_MODULE)
    .map(toModule)
    .filter((module): module is BankModule => module !== null);
  cached = {
    modules,
    totals: {
      questions: modules.reduce((sum, module) => sum + module.questions, 0),
      pages: modules.reduce((sum, module) => sum + module.pages, 0),
      modules: modules.length,
    },
    questions: loadTrialQuestions(),
  };
  return cached;
}
