import type { AnswerWrite } from './answers';
import type { QuestionDatabase } from './database';
import { questionStorageError } from './errors';
import type { Outbox } from './outbox';
import {
  compareTime, nextTimestamp, questionKey, sameState,
  type AnswerState, type QuestionIdentity, type QuestionNamespace, type RemoteAnswer, type RemoteAttempt, type SyncChanges,
} from './types';

export { emptyAnswer } from './types';

/*
 * Read-through, write-behind memory cache of answers for one account namespace.
 *
 * Reads: a page's questions subscribe on mount; their document is loaded with
 * one indexed IndexedDB read and every later render reads memory
 * synchronously. Other tabs' changes refresh only the keys they name; cloud
 * rows arrive straight from the sync engine (mergeRemote), so they show even
 * when IndexedDB cannot store them.
 *
 * Writes: memory changes and subscribers re-render immediately.
 *   - draft  (picking options before grading, typing a blank): persisted
 *            locally after input pauses; never uploaded.
 *   - submit / reset: committed. Persisted locally right away, then handed to
 *            the sync outbox (in memory): also when the local save fails.
 * Each write carries its time; last writer wins against the cloud and other tabs.
 *
 * Saved entries are released when their last subscriber leaves; entries with
 * a queued or failed write stay until it is persisted.
 */

/** draft: local only · submit: committed with an attempt record · reset, regrade: committed, no new attempt. */
export type WriteKind = 'draft' | 'submit' | 'reset' | 'regrade';

export interface AnswerSnapshot {
  state: AnswerState;
  /** The stored value has been read (or there is nothing to read). */
  ready: boolean;
  /** Persisting the newest value failed; it is still held in memory. */
  error: string | null;
}

/** A queued write; a commit also carries what the outbox receives once the local save settles. */
interface QueuedWrite extends AnswerWrite {
  upload?: Partial<SyncChanges>;
  uploaded?: boolean;
}

interface Entry {
  identity: QuestionIdentity;
  key: string;
  snapshot: AnswerSnapshot;
  /** Write time of the shown value; '' while nothing has been read or written. */
  updatedAt: string;
  queue: QueuedWrite[];
  /** A draft is waiting for input to pause before it is persisted. */
  timer: ReturnType<typeof setTimeout> | undefined;
  flushing: boolean;
  /** The write IndexedDB refused; retried on the next write or retry(). */
  failed: QueuedWrite | null;
  listeners: Set<() => void>;
}

const EMPTY: AnswerState = Object.freeze({ selected: [], values: [], submitted: false, attempt: 0 }) as AnswerState;
export const PENDING_SNAPSHOT: AnswerSnapshot = Object.freeze({ state: EMPTY, ready: false, error: null });
const EMPTY_SNAPSHOT: AnswerSnapshot = Object.freeze({ state: EMPTY, ready: true, error: null });

/** Quiet period after the last draft edit before it is written to IndexedDB. */
export const DRAFT_PERSIST_MS = 400;
/** A commit reaches the outbox after its local save, or after this long if the save is still stuck. */
const UPLOAD_FALLBACK_MS = 2_000;

export interface QuestionAnswerCacheOptions {
  /** Delay before persisting a draft; 0 writes every change immediately. */
  draftDelayMs?: number;
  /** Receives committed answers and submissions of an account. */
  outbox?: Outbox | null;
  /** Called when a page is read, so the sync engine can refresh a stale local copy. */
  onRead?: () => void;
}

const identityOf = (value: QuestionIdentity): QuestionIdentity =>
  ({ documentPath: value.documentPath, questionId: value.questionId, questionRevision: value.questionRevision });

export class QuestionAnswerCache {
  private readonly entries = new Map<string, Entry>();
  private readonly documents = new Map<string, Promise<void>>();
  private readonly unsubscribe: (() => void) | undefined;
  private readonly draftDelayMs: number;
  private readonly outbox: Outbox | null;
  private disposed = false;
  private pruneQueued = false;

  constructor(private readonly database: QuestionDatabase | null, readonly namespace: QuestionNamespace,
    private readonly options: QuestionAnswerCacheOptions = {}) {
    this.draftDelayMs = options.draftDelayMs ?? DRAFT_PERSIST_MS;
    this.outbox = namespace === 'guest' ? null : options.outbox ?? null;
    this.unsubscribe = database?.subscribe((change) => {
      // This tab's own writes and cloud rows are already in memory.
      if (change.namespace !== namespace || change.scope !== 'answers' || this.disposed ||
        (change.tab === database.tab && change.origin !== 'import')) return;
      if (change.keys) void this.refresh(change.keys);
      else for (const path of new Set([...this.entries.values()].map((entry) => entry.identity.documentPath))) {
        void this.loadDocument(path).catch(() => undefined);
      }
    });
    if (database && typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.persistNow);
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  dispose(): void {
    // Waiting drafts still belong to this namespace; write them before letting go.
    this.persistNow();
    this.disposed = true;
    this.unsubscribe?.();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.persistNow);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }

  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') this.persistNow();
  };

  /** Writes every draft that is waiting for input to pause. */
  readonly persistNow = (): void => {
    for (const entry of this.entries.values()) {
      if (entry.timer === undefined) continue;
      clearTimeout(entry.timer);
      entry.timer = undefined;
      void this.flush(entry);
    }
  };

  private entry(identity: QuestionIdentity): Entry {
    const key = questionKey(identity);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        identity: identityOf(identity), key,
        snapshot: this.database ? PENDING_SNAPSHOT : EMPTY_SNAPSHOT, updatedAt: '',
        queue: [], timer: undefined, flushing: false, failed: null, listeners: new Set(),
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
    return entry.flushing || entry.failed !== null || entry.queue.length > 0;
  }

  /** Takes a stored or cloud value unless the shown one is newer. */
  private adopt(entry: Entry, state: AnswerState, updatedAt: string): void {
    if (entry.snapshot.ready && entry.updatedAt && compareTime(entry.updatedAt, updatedAt) > 0) return;
    entry.updatedAt = updatedAt;
    this.publish(entry, { state, ready: true });
  }

  /** IndexedDB owns saved answers; visited pages must not accumulate in memory. */
  private prune(): void {
    if (!this.database || this.pruneQueued) return;
    this.pruneQueued = true;
    queueMicrotask(() => {
      this.pruneQueued = false;
      for (const [key, entry] of this.entries) {
        if (!entry.listeners.size && !this.busy(entry) && entry.timer === undefined) this.entries.delete(key);
      }
    });
  }

  read(identity: QuestionIdentity): AnswerSnapshot {
    return this.entries.get(questionKey(identity))?.snapshot ?? (this.database ? PENDING_SNAPSHOT : EMPTY_SNAPSHOT);
  }

  subscribe(identity: QuestionIdentity, listener: () => void): () => void {
    const entry = this.entry(identity);
    entry.listeners.add(listener);
    if (!entry.snapshot.ready) void this.loadDocument(identity.documentPath).catch(() => undefined);
    return () => { entry.listeners.delete(listener); this.prune(); };
  }

  private loadDocument(documentPath: string): Promise<void> {
    let loading = this.documents.get(documentPath);
    if (!loading) {
      this.options.onRead?.();
      loading = this.readDocument(documentPath);
      this.documents.set(documentPath, loading);
      // Deduplicate only in-flight reads. A later subscriber may introduce a new
      // question on this document (or return after its saved entry was evicted).
      const finished = () => {
        if (this.documents.get(documentPath) === loading) this.documents.delete(documentPath);
        this.prune();
      };
      void loading.then(finished, finished);
    }
    return loading;
  }

  private async readDocument(documentPath: string): Promise<void> {
    if (!this.database) return;
    try {
      const rows = await this.database.answers.listDocument(this.namespace, documentPath);
      if (this.disposed) return;
      const saved = new Map(rows.map((row) => [row.key, row]));
      for (const entry of this.entries.values()) {
        if (entry.identity.documentPath !== documentPath || this.busy(entry)) continue;
        const row = saved.get(entry.key);
        if (row) this.adopt(entry, row.state, row.updatedAt);
        else if (!entry.snapshot.ready) this.publish(entry, { state: EMPTY, ready: true, error: null });
      }
    } catch (error) {
      for (const entry of this.entries.values()) {
        if (entry.identity.documentPath === documentPath && !entry.snapshot.ready) {
          // Nothing could be read: start empty but say so, rather than block the question.
          this.publish(entry, { state: EMPTY, ready: true, error: '本机答题记录读取失败，新作答仍会保留在本页。' });
        }
      }
      throw error;
    }
  }

  private async refresh(keys: readonly string[]): Promise<void> {
    if (!this.database) return;
    const targets = keys.flatMap((key) => {
      const entry = this.entries.get(key);
      return entry && entry.snapshot.ready && !this.busy(entry) ? [entry] : [];
    });
    if (!targets.length) return;
    try {
      const rows = await this.database.answers.getMany(this.namespace, targets.map((entry) => entry.key));
      if (this.disposed) return;
      targets.forEach((entry, index) => {
        const row = rows[index];
        if (row && !this.busy(entry)) this.adopt(entry, row.state, row.updatedAt);
      });
    } catch { /* The memory value stays; the next change or reload reads again. */ }
  }

  /** Cloud rows, straight from the sync engine; last writer wins against what is shown. */
  mergeRemote(answers: readonly RemoteAnswer[]): void {
    if (this.disposed) return;
    for (const remote of answers) {
      const entry = this.entries.get(questionKey(remote));
      if (entry) this.adopt(entry, remote.state, remote.updatedAt);
    }
  }

  write(identity: QuestionIdentity, state: AnswerState, kind: WriteKind = 'draft'): void {
    const entry = this.entry(identity);
    const value = structuredClone(state);
    const updatedAt = nextTimestamp(entry.updatedAt || undefined);
    const committed = kind !== 'draft';
    const attempt: RemoteAttempt | undefined = kind === 'submit'
      ? { ...entry.identity, attemptId: crypto.randomUUID(), state: value, createdAt: updatedAt }
      : undefined;
    entry.updatedAt = updatedAt;
    this.publish(entry, { state: value, ready: true });
    const upload = committed && this.outbox
      ? { answers: [{ ...entry.identity, state: value, updatedAt }], attempts: attempt ? [attempt] : [] }
      : undefined;
    if (!this.database) {
      if (upload) this.outbox!.put(upload);
      return;
    }
    // Written locally first, then uploaded: the cloud's acknowledgement can never
    // overtake the local outbox row. A failed or stuck local save still uploads.
    const write: QueuedWrite = { state: value, updatedAt, committed, ...(attempt ? { attempt } : {}), ...(upload ? { upload } : {}) };
    if (upload) setTimeout(() => this.handOver(write), UPLOAD_FALLBACK_MS);
    const last = entry.queue.at(-1);
    // Index 0 may already be in IndexedDB's hands; only later unsent drafts collapse.
    if (last && !last.committed && !committed && (entry.queue.length > 1 || !entry.flushing)) entry.queue[entry.queue.length - 1] = write;
    else entry.queue.push(write);
    clearTimeout(entry.timer);
    entry.timer = undefined;
    if (committed || this.draftDelayMs <= 0 || entry.failed) {
      void this.flush(entry);
      return;
    }
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      void this.flush(entry);
    }, this.draftDelayMs);
  }

  /** Persist again after a storage failure, keeping the memory value. */
  retry(identity: QuestionIdentity): void {
    const entry = this.entries.get(questionKey(identity));
    if (!entry) return;
    if (entry.failed) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
      void this.flush(entry);
    } else if (!this.busy(entry)) {
      this.publish(entry, { error: null });
      void this.readDocument(entry.identity.documentPath).catch(() => undefined);
    }
  }

  /** True while an answer exists only on this page (neither stored here nor queued for the cloud). */
  hasUnsaved(): boolean {
    for (const entry of this.entries.values()) {
      if (!entry.failed) continue;
      // A failed commit of an account is safe once the cloud acknowledged it.
      if (!(entry.failed.committed && this.outbox) || this.outbox.holds(entry.key)) return true;
    }
    return false;
  }

  /** Gives a commit to the outbox exactly once. */
  private handOver(write: QueuedWrite): void {
    if (!write.upload || write.uploaded) return;
    write.uploaded = true;
    this.outbox?.put(write.upload);
  }

  private async flush(entry: Entry): Promise<void> {
    if (entry.flushing || !this.database) return;
    entry.flushing = true;
    try {
      // Queued writes finish even after dispose: they target this cache's namespace.
      while (entry.queue.length) {
        const next = entry.queue[0];
        try {
          await this.database.answers.save(this.namespace, entry.identity, next);
        } catch (error) {
          this.handOver(next);
          entry.failed = next;
          if (!this.disposed) this.publish(entry, { error: questionStorageError(error, Boolean(next.committed && this.outbox)) });
          return;
        }
        entry.queue.shift();
        this.handOver(next);
        entry.failed = null;
        if (entry.snapshot.error) this.publish(entry, { error: null });
      }
    } finally {
      entry.flushing = false;
      this.prune();
    }
  }
}
