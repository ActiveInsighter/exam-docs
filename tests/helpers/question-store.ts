// IDBKeyRange and friends as browser globals; each test still opens its own IDBFactory.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { expect } from 'vitest';
import {
  QuestionDatabase, markKey, namespaceForUser, questionKey,
  type AnswerState, type QuestionIdentity, type QuestionMark, type QuestionSyncTransport,
  type RemoteAnswer, type RemoteAttempt, type SyncRequest, type SyncResponse, type UserTag,
} from '../../lib/question-store';

export const ACCOUNT = namespaceForUser('11111111-1111-4111-8111-111111111111');
export const OTHER = namespaceForUser('22222222-2222-4222-8222-222222222222');
export const page = '/docs/math';
export const question = (questionId = 'q1', documentPath = page): QuestionIdentity => ({ documentPath, questionId, questionRevision: 'r1' });
export const draft = (text: string): AnswerState => ({ selected: [], values: [text], submitted: false, attempt: 0 });
export const submitted = (text: string, attempt = 1): AnswerState => ({ ...draft(text), submitted: true, attempt });
export const choice = (letter: string, attempt = 1): AnswerState => ({ selected: [letter], values: [], submitted: true, attempt });

export const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Polls until `check` holds, for at most `ms` of wall time. */
export async function until(check: () => boolean | Promise<boolean>, ms = 5_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && !(await check())) await tick();
  expect(await check()).toBe(true);
}

const cleanup: (() => void)[] = [];
export const onCleanup = (close: () => void) => { cleanup.push(close); };
export function runCleanup() {
  for (const close of cleanup.splice(0).reverse()) {
    try { close(); } catch { /* already closed */ }
  }
}

export async function openDatabase(factory = new IDBFactory(), name: string = crypto.randomUUID(), broadcast = false) {
  const db = await QuestionDatabase.open({ name, indexedDB: factory, broadcast });
  onCleanup(() => db.close());
  return db;
}

export const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

/**
 * An in-memory model of public.exam_sync: last writer wins per answer, tag
 * and mark, attempts are idempotent by id, one compacted feed by seq.
 * Independent of the browser code it tests.
 */
export class FakeServer implements QuestionSyncTransport {
  private head = 0;
  answers = new Map<string, { row: RemoteAnswer; seq: number }>();
  attempts = new Map<string, { row: RemoteAttempt; seq: number }>();
  tags = new Map<string, { row: UserTag; seq: number }>();
  marks = new Map<string, { row: QuestionMark; seq: number }>();
  requests: SyncRequest[] = [];
  pageSize = Infinity;
  /** Throws before applying anything. */
  failNext: Error | null = null;
  /** Applies the request, then loses the response. */
  loseNext = false;
  /** Never answers. */
  hang = false;

  async sync(input: SyncRequest): Promise<SyncResponse> {
    this.requests.push(structuredClone(input));
    if (this.hang) return new Promise(() => {});
    if (this.failNext) { const error = this.failNext; this.failNext = null; throw error; }
    const newer = (current: { updatedAt: string } | undefined, next: { updatedAt: string }) =>
      !current || Date.parse(next.updatedAt) > Date.parse(current.updatedAt);
    const touchedAnswers = new Set<string>();
    const touchedTags = new Set<string>();
    const touchedMarks = new Set<string>();
    for (const attempt of input.changes.attempts) {
      if (!this.attempts.has(attempt.attemptId)) this.attempts.set(attempt.attemptId, { row: structuredClone(attempt), seq: ++this.head });
    }
    for (const answer of input.changes.answers) {
      const key = questionKey(answer);
      touchedAnswers.add(key);
      if (newer(this.answers.get(key)?.row, answer)) this.answers.set(key, { row: structuredClone(answer), seq: ++this.head });
    }
    for (const tag of input.changes.tags) {
      touchedTags.add(tag.tagId);
      if (newer(this.tags.get(tag.tagId)?.row, tag)) this.tags.set(tag.tagId, { row: structuredClone(tag), seq: ++this.head });
      if (tag.deleted) {
        for (const entry of this.marks.values()) {
          if (!entry.row.tagIds.includes(tag.tagId)) continue;
          entry.row = { ...entry.row, tagIds: entry.row.tagIds.filter((id) => id !== tag.tagId) };
          entry.seq = ++this.head;
        }
      }
    }
    for (const mark of input.changes.marks) {
      const key = markKey(mark);
      touchedMarks.add(key);
      const live = mark.tagIds.filter((id) => this.tags.get(id) && !this.tags.get(id)!.row.deleted);
      if (newer(this.marks.get(key)?.row, mark)) this.marks.set(key, { row: { ...structuredClone(mark), tagIds: live }, seq: ++this.head });
    }
    const cursor = Number(input.cursor ?? 0);
    const reset = cursor > this.head;
    const from = reset ? 0 : cursor;
    const seqs = [...this.answers.values(), ...this.attempts.values(), ...this.tags.values(), ...this.marks.values()]
      .map((entry) => entry.seq).filter((seq) => seq > from).sort((a, b) => a - b);
    const limit = Math.min(input.limit, this.pageSize);
    const hasMore = seqs.length > limit;
    const end = hasMore ? seqs[limit - 1] : this.head;
    const pick = <T>(map: Map<string, { row: T; seq: number }>, touched?: Set<string>) =>
      [...map.entries()].filter(([key, entry]) => (entry.seq > from && entry.seq <= end) || touched?.has(key))
        .sort((a, b) => a[1].seq - b[1].seq).map(([, entry]) => structuredClone(entry.row));
    const response: SyncResponse = {
      answers: pick(this.answers, touchedAnswers), attempts: pick(this.attempts), tags: pick(this.tags, touchedTags),
      marks: pick(this.marks, touchedMarks), merged: [], cursor: String(end), hasMore, reset,
    };
    if (this.loseNext) { this.loseNext = false; throw new Error('Connection lost after server commit'); }
    return response;
  }

  /** Another device commits an answer. */
  edit(state: AnswerState, identity = question(), updatedAt = new Date(Date.now() + 1000).toISOString()): RemoteAnswer {
    const row = { ...identity, state, updatedAt };
    this.answers.set(questionKey(identity), { row, seq: ++this.head });
    return row;
  }
}
