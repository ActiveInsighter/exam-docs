import { normalizeDocPath, resolveSource, type SourceFolder, type SourceIndex, type SourceNode, type SourceTree } from './doc-sources';
import { compareTime, isAnswered, type AnswerState } from './question-store/types';

/*
 * The reader's answer history, grouped by where it was given.
 *
 * Input rows are the saved answers and submissions of one reader. A question
 * whose text was revised has one row per revision; it counts once, with its
 * most recent row.
 */

export interface AnswerLike {
  documentPath: string;
  questionId: string;
  state: AnswerState;
  updatedAt: string;
}

export interface AttemptLike {
  documentPath: string;
  questionId: string;
  createdAt: string;
}

export interface QuestionRecord {
  documentPath: string;
  questionId: string;
  /** The current answer is not empty (a draft or a submission). */
  answered: boolean;
  submitted: boolean;
  /** Graded submissions over all revisions. */
  attempts: number;
  /** Latest change: an answer edit or a submission. */
  lastAt: string;
}

export interface RecordTotals {
  answered: number;
  submitted: number;
  attempts: number;
  /** Pages with at least one answered question. */
  pages: number;
  lastAt: string | null;
}

const latest = (left: string | null, right: string) => (!left || compareTime(right, left) > 0 ? right : left);

const recordKey = (documentPath: string, questionId: string) => `${normalizeDocPath(documentPath)}\u0000${questionId}`;

/** One record per question (across revisions); questions never answered or submitted are left out. */
export function collectRecords(answers: readonly AnswerLike[], attempts: readonly AttemptLike[]): QuestionRecord[] {
  const records = new Map<string, QuestionRecord & { answerAt: string | null }>();
  const recordOf = (documentPath: string, questionId: string) => {
    const key = recordKey(documentPath, questionId);
    let record = records.get(key);
    if (!record) {
      record = { documentPath: normalizeDocPath(documentPath), questionId, answered: false, submitted: false, attempts: 0, lastAt: '', answerAt: null };
      records.set(key, record);
    }
    return record;
  };
  for (const row of answers) {
    const record = recordOf(row.documentPath, row.questionId);
    // The newest revision's answer is the one the reader sees.
    if (record.answerAt && compareTime(row.updatedAt, record.answerAt) <= 0) continue;
    record.answerAt = row.updatedAt;
    record.answered = isAnswered(row.state);
    record.submitted = row.state.submitted;
  }
  for (const attempt of attempts) recordOf(attempt.documentPath, attempt.questionId).attempts++;
  const lastByKey = new Map<string, string>();
  for (const row of answers) {
    if (!isAnswered(row.state) && !row.state.submitted) continue;
    const key = recordKey(row.documentPath, row.questionId);
    lastByKey.set(key, latest(lastByKey.get(key) ?? null, row.updatedAt));
  }
  for (const attempt of attempts) {
    const key = recordKey(attempt.documentPath, attempt.questionId);
    lastByKey.set(key, latest(lastByKey.get(key) ?? null, attempt.createdAt));
  }
  const result: QuestionRecord[] = [];
  for (const [key, { answerAt: _answerAt, ...record }] of records) {
    const lastAt = lastByKey.get(key);
    if (!lastAt || (!record.answered && record.attempts === 0)) continue;
    result.push({ ...record, lastAt });
  }
  return result.sort((left, right) => compareTime(right.lastAt, left.lastAt));
}

export function totalsOf(records: readonly QuestionRecord[]): RecordTotals {
  const pages = new Set<string>();
  let lastAt: string | null = null;
  let answered = 0;
  let submitted = 0;
  let attempts = 0;
  for (const record of records) {
    if (record.answered) { answered++; pages.add(record.documentPath); }
    if (record.submitted) submitted++;
    attempts += record.attempts;
    lastAt = latest(lastAt, record.lastAt);
  }
  return { answered, submitted, attempts, pages: pages.size, lastAt };
}

/* ------------------------------------------------------------------------
 * Coverage: the sidebar tree annotated with the reader's records.
 * ---------------------------------------------------------------------- */

export interface CoveragePage {
  kind: 'page';
  name: string;
  url: string;
  /** Questions on the page per the source; at least the answered count. */
  questions: number;
  totals: RecordTotals;
}

export interface CoverageFolder {
  kind: 'folder';
  name: string;
  /** Stable within one tree: the folder names from the module down. */
  id: string;
  questions: number;
  totals: RecordTotals;
  children: CoverageNode[];
}

export type CoverageNode = CoveragePage | CoverageFolder;

const EMPTY_TOTALS: RecordTotals = { answered: 0, submitted: 0, attempts: 0, pages: 0, lastAt: null };

function mergeTotals(items: readonly RecordTotals[]): RecordTotals {
  let lastAt: string | null = null;
  const sum = { answered: 0, submitted: 0, attempts: 0, pages: 0 };
  for (const item of items) {
    sum.answered += item.answered;
    sum.submitted += item.submitted;
    sum.attempts += item.attempts;
    sum.pages += item.pages;
    if (item.lastAt) lastAt = latest(lastAt, item.lastAt);
  }
  return { ...sum, lastAt };
}

/**
 * Annotates the source tree with the reader's records. Pages and folders
 * without questions and without records are dropped; records on pages the
 * sidebar no longer lists are collected in a trailing "其他" module.
 */
export function buildCoverage(tree: SourceTree, records: readonly QuestionRecord[], index: SourceIndex): CoverageFolder[] {
  const byPage = new Map<string, QuestionRecord[]>();
  for (const record of records) {
    const list = byPage.get(record.documentPath) ?? [];
    list.push(record);
    byPage.set(record.documentPath, list);
  }
  const seen = new Set<string>();

  const page = (name: string, url: string, questions: number): CoveragePage | null => {
    seen.add(url);
    const totals = byPage.has(url) ? totalsOf(byPage.get(url)!) : EMPTY_TOTALS;
    if (!questions && !totals.answered && !totals.attempts) return null;
    return { kind: 'page', name, url, questions: Math.max(questions, totals.answered), totals };
  };
  const folder = (node: SourceFolder, path: string[]): CoverageFolder | null => {
    const id = [...path, node.name].join('/');
    const children = node.children
      .map((child: SourceNode) => (child.kind === 'page' ? page(child.name, child.url, child.questions) : folder(child, [...path, node.name])))
      .filter((child): child is CoverageNode => child !== null);
    if (!children.length) return null;
    return {
      kind: 'folder', name: node.name, id, children,
      questions: children.reduce((sum, child) => sum + child.questions, 0),
      totals: mergeTotals(children.map((child) => child.totals)),
    };
  };

  const modules = tree.modules.map((module) => folder(module, [])).filter((module): module is CoverageFolder => module !== null);

  const orphans = [...byPage.keys()].filter((url) => !seen.has(url));
  if (orphans.length) {
    const pages = orphans.map((url) => {
      const source = resolveSource(index, url);
      return page([...source.folders, source.page].join(' / '), url, 0);
    }).filter((item): item is CoveragePage => item !== null);
    if (pages.length) {
      const id = '\u0000unlisted';
      const existing = modules.find((module) => module.name === '其他');
      const node: CoverageFolder = {
        kind: 'folder', name: '已移除的页面', id, children: pages, questions: pages.reduce((sum, item) => sum + item.questions, 0),
        totals: mergeTotals(pages.map((item) => item.totals)),
      };
      if (existing) {
        existing.children.push(node);
        existing.questions += node.questions;
        existing.totals = mergeTotals([existing.totals, node.totals]);
      } else {
        modules.push({ ...node, name: '其他', id: '其他', children: [node] });
      }
    }
  }
  return modules;
}

/** Pages of a folder in sidebar order, for the module's coverage strip. */
export function pagesOf(node: CoverageNode): CoveragePage[] {
  return node.kind === 'page' ? [node] : node.children.flatMap(pagesOf);
}

export interface RecordSession {
  /** The bucket the session belongs to (e.g. its day); sessions never span two. */
  group: string;
  documentPath: string;
  /** Newest first. */
  records: QuestionRecord[];
  lastAt: string;
}

/**
 * Runs of consecutive records (newest first) on the same page and in the
 * same bucket. Twenty questions done on one chapter read as one entry.
 */
export function groupSessions(records: readonly QuestionRecord[], bucket: (record: QuestionRecord) => string): RecordSession[] {
  const sessions: RecordSession[] = [];
  for (const record of records) {
    const group = bucket(record);
    const last = sessions.at(-1);
    if (last && last.group === group && last.documentPath === record.documentPath) last.records.push(record);
    else sessions.push({ group, documentPath: record.documentPath, records: [record], lastAt: record.lastAt });
  }
  return sessions;
}

export function questionHref(documentPath: string, questionId: string): string {
  return `${documentPath}#question-${encodeURIComponent(questionId)}`;
}
