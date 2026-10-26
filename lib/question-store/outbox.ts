import {
  compareTime, markKey, questionKey,
  type QuestionMark, type RemoteAnswer, type RemoteAttempt, type SyncChanges, type UserTag,
} from './types';

/** What the caches need from the sync engine: hand over committed changes, never wait for them. */
export interface Outbox {
  /** Queues committed changes for upload; independent of whether IndexedDB accepted them. */
  put(changes: Partial<SyncChanges>): void;
  /** True while a committed answer of this question awaits the cloud's acknowledgement. */
  holds(answerKey: string): boolean;
}

/** Per request; the server accepts 200 of each kind and 1 MiB in total. */
export const SYNC_BATCH = { answers: 100, attempts: 100, tags: 200, marks: 100, bytes: 512 * 1024 } as const;

const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * The upload queue in memory: one entry per answer, tag and mark (the newest
 * write wins) and every submission. IndexedDB keeps a durable copy for the
 * next visit; this queue is what the engine sends, so a full or broken
 * browser database never keeps a committed answer from the cloud.
 */
export class OutboxQueue {
  private readonly answers = new Map<string, RemoteAnswer>();
  private readonly attempts = new Map<string, RemoteAttempt>();
  private readonly tags = new Map<string, UserTag>();
  private readonly marks = new Map<string, QuestionMark>();

  get size(): number {
    return this.answers.size + this.attempts.size + this.tags.size + this.marks.size;
  }

  /** Changes as the reader counts them: a submission's answer and its attempt are one. */
  get count(): number {
    let attempts = 0;
    for (const attempt of this.attempts.values()) if (!this.answers.has(questionKey(attempt))) attempts++;
    return this.answers.size + attempts + this.tags.size + this.marks.size;
  }

  holds(answerKey: string): boolean {
    return this.answers.has(answerKey);
  }

  /** Adds changes, keeping the newer of two writes of the same row. Returns whether anything was added. */
  merge(changes: Partial<SyncChanges>): boolean {
    const before = this.size;
    let replaced = false;
    const keep = <T extends { updatedAt: string }>(map: Map<string, T>, key: string, value: T) => {
      const current = map.get(key);
      if (current && compareTime(current.updatedAt, value.updatedAt) >= 0) return;
      replaced ||= Boolean(current);
      map.set(key, value);
    };
    for (const answer of changes.answers ?? []) keep(this.answers, questionKey(answer), answer);
    for (const attempt of changes.attempts ?? []) if (!this.attempts.has(attempt.attemptId)) this.attempts.set(attempt.attemptId, attempt);
    for (const tag of changes.tags ?? []) keep(this.tags, tag.tagId, tag);
    for (const mark of changes.marks ?? []) keep(this.marks, markKey(mark), mark);
    return replaced || this.size !== before;
  }

  /** The oldest entries that fit one request. Tags travel before the marks that use them. */
  take(): SyncChanges {
    let budget = SYNC_BATCH.bytes;
    const pick = <T>(values: Iterable<T>, limit: number, order?: (a: T, b: T) => number): T[] => {
      const sorted = order ? [...values].sort(order) : [...values];
      const picked: T[] = [];
      for (const value of sorted) {
        const bytes = size(value);
        if (picked.length >= limit || bytes > budget) break;
        picked.push(value);
        budget -= bytes;
      }
      return picked;
    };
    const byTime = (a: { updatedAt: string }, b: { updatedAt: string }) => compareTime(a.updatedAt, b.updatedAt);
    return {
      tags: pick(this.tags.values(), SYNC_BATCH.tags, byTime),
      attempts: pick(this.attempts.values(), SYNC_BATCH.attempts, (a, b) => compareTime(a.createdAt, b.createdAt)),
      answers: pick(this.answers.values(), SYNC_BATCH.answers, byTime),
      marks: pick(this.marks.values(), SYNC_BATCH.marks, byTime),
    };
  }

  /** Drops what the cloud acknowledged, unless the row was written again while the request was in flight. */
  settle(sent: SyncChanges): void {
    const drop = <T>(map: Map<string, T>, key: string, value: T) => { if (map.get(key) === value) map.delete(key); };
    for (const answer of sent.answers) drop(this.answers, questionKey(answer), answer);
    for (const attempt of sent.attempts) this.attempts.delete(attempt.attemptId);
    for (const tag of sent.tags) drop(this.tags, tag.tagId, tag);
    for (const mark of sent.marks) drop(this.marks, markKey(mark), mark);
  }
}
