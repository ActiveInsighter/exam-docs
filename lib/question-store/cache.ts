import type { QuestionDatabase } from './database';
import { questionStorageError } from './errors';
import { questionKey, sameState, type AnswerState, type QuestionIdentity, type QuestionNamespace } from './types';

/*
 * Read-through, write-behind memory cache in front of IndexedDB for one
 * account namespace.
 *
 * Reads: a page's questions subscribe on mount; their document is loaded with
 * one indexed IndexedDB read and every later render reads memory
 * synchronously. Changes from sync or other tabs refresh only the keys they
 * name.
 *
 * Writes: memory changes and subscribers re-render immediately; the value is
 * then persisted in order. Consecutive drafts of one question collapse into
 * the newest one, submissions are never collapsed (each one becomes an
 * immutable attempt). While a write is queued or failed the memory value is
 * authoritative, so a slower external refresh can never roll back typing.
 */

export interface AnswerSnapshot {
  state: AnswerState;
  /** The stored value has been read (or there is nothing to read). */
  ready: boolean;
  /** Persisting the newest value failed; it is still held in memory. */
  error: string | null;
}

interface Write { state: AnswerState; submission: boolean }

interface Entry {
  identity: QuestionIdentity;
  snapshot: AnswerSnapshot;
  queue: Write[];
  flushing: boolean;
  failed: boolean;
  listeners: Set<() => void>;
}

const EMPTY: AnswerState = Object.freeze({ selected: [], values: [], submitted: false, attempt: 0 }) as AnswerState;
export const emptyAnswer = (): AnswerState => ({ selected: [], values: [], submitted: false, attempt: 0 });
export const PENDING_SNAPSHOT: AnswerSnapshot = Object.freeze({ state: EMPTY, ready: false, error: null });

export class QuestionAnswerCache {
  private readonly entries = new Map<string, Entry>();
  private readonly documents = new Map<string, Promise<void>>();
  private readonly unsubscribe: (() => void) | undefined;
  private disposed = false;

  constructor(private readonly database: QuestionDatabase | null, readonly namespace: QuestionNamespace) {
    this.unsubscribe = database?.subscribe((change) => {
      if (change.namespace !== namespace || this.disposed) return;
      if (change.keys) void this.refresh(change.keys);
      else for (const path of this.documents.keys()) void this.refreshDocument(path);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
  }

  private entry(identity: QuestionIdentity): Entry {
    const key = questionKey(identity);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        identity: { documentPath: identity.documentPath, questionId: identity.questionId, questionRevision: identity.questionRevision },
        snapshot: this.database ? PENDING_SNAPSHOT : { state: EMPTY, ready: true, error: null },
        queue: [], flushing: false, failed: false, listeners: new Set(),
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  private publish(entry: Entry, patch: Partial<AnswerSnapshot>): void {
    const next = { ...entry.snapshot, ...patch };
    if (next.ready === entry.snapshot.ready && next.error === entry.snapshot.error && sameState(next.state, entry.snapshot.state)) return;
    entry.snapshot = next;
    for (const listener of entry.listeners) listener();
  }

  /** A busy entry owns its value: a queued or failed write must not be replaced by a stale read. */
  private busy(entry: Entry): boolean {
    return entry.flushing || entry.failed || entry.queue.length > 0;
  }

  read(identity: QuestionIdentity): AnswerSnapshot {
    return this.entries.get(questionKey(identity))?.snapshot ?? (this.database ? PENDING_SNAPSHOT : { state: EMPTY, ready: true, error: null });
  }

  subscribe(identity: QuestionIdentity, listener: () => void): () => void {
    const entry = this.entry(identity);
    entry.listeners.add(listener);
    if (!entry.snapshot.ready) void this.loadDocument(identity.documentPath);
    return () => { entry.listeners.delete(listener); };
  }

  private loadDocument(documentPath: string): Promise<void> {
    let loading = this.documents.get(documentPath);
    if (!loading) {
      loading = this.refreshDocument(documentPath);
      this.documents.set(documentPath, loading);
      // A failed first read is retried by the next subscriber instead of being cached.
      loading.catch(() => { if (this.documents.get(documentPath) === loading) this.documents.delete(documentPath); });
    }
    return loading;
  }

  private async refreshDocument(documentPath: string): Promise<void> {
    if (!this.database) return;
    try {
      const records = await this.database.listDocument(this.namespace, documentPath);
      if (this.disposed) return;
      const saved = new Map(records.map((record) => [record.key, record.state]));
      for (const [key, entry] of this.entries) {
        if (entry.identity.documentPath !== documentPath || this.busy(entry)) continue;
        this.publish(entry, { state: saved.get(key) ?? EMPTY, ready: true, error: null });
      }
    } catch (error) {
      for (const entry of this.entries.values()) {
        if (entry.identity.documentPath === documentPath && !entry.snapshot.ready) {
          this.publish(entry, { error: '答案读取失败，请刷新页面后重试。' });
        }
      }
      throw error;
    }
  }

  private async refresh(keys: readonly string[]): Promise<void> {
    if (!this.database) return;
    const targets = keys.map((key) => [key, this.entries.get(key)] as const).filter(([, entry]) => entry && entry.snapshot.ready && !this.busy(entry));
    if (!targets.length) return;
    try {
      const records = await this.database.getMany(this.namespace, targets.map(([key]) => key));
      if (this.disposed) return;
      targets.forEach(([, entry], index) => {
        if (entry && !this.busy(entry)) this.publish(entry, { state: records[index]?.state ?? EMPTY });
      });
    } catch { /* The memory value stays; the next change or reload reads again. */ }
  }

  write(identity: QuestionIdentity, state: AnswerState, options: { submission?: boolean } = {}): void {
    const entry = this.entry(identity);
    const value = structuredClone(state);
    this.publish(entry, { state: value, ready: true });
    if (!this.database) return;
    const submission = options.submission === true;
    const last = entry.queue.at(-1);
    // Index 0 may already be in IndexedDB's hands; only later unsent drafts collapse.
    if (last && !last.submission && !submission && (entry.queue.length > 1 || !entry.flushing)) entry.queue[entry.queue.length - 1] = { state: value, submission };
    else entry.queue.push({ state: value, submission });
    // A new edit also retries a failed earlier write, which stays first in the queue.
    entry.failed = false;
    void this.flush(entry);
  }

  /** Persist again after a storage failure, keeping the memory value. */
  retry(identity: QuestionIdentity): void {
    const entry = this.entries.get(questionKey(identity));
    if (!entry) return;
    if (entry.failed) {
      entry.failed = false;
      void this.flush(entry);
    } else if (!this.busy(entry)) {
      this.publish(entry, { ready: false, error: null });
      void this.refreshDocument(entry.identity.documentPath).catch(() => undefined);
    }
  }

  /** True while any answer exists only in memory; the page warns before unloading. */
  hasUnsaved(): boolean {
    for (const entry of this.entries.values()) if (entry.failed) return true;
    return false;
  }

  private async flush(entry: Entry): Promise<void> {
    if (entry.flushing || !this.database) return;
    entry.flushing = true;
    try {
      while (entry.queue.length && !this.disposed) {
        const next = entry.queue[0];
        try {
          await this.database.save(this.namespace, entry.identity, next.state, { submission: next.submission });
        } catch (error) {
          entry.failed = true;
          this.publish(entry, { error: questionStorageError(error) });
          return;
        }
        entry.queue.shift();
        if (entry.snapshot.error) this.publish(entry, { error: null });
      }
    } finally {
      entry.flushing = false;
    }
  }
}
