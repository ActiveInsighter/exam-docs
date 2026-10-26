import type { QuestionDatabase } from './database';
import { OutboxQueue, type Outbox } from './outbox';
import type { QuestionNamespace, QuestionSyncStatus, QuestionSyncTransport, SyncChanges, SyncResponse } from './types';

export interface QuestionSyncOptions {
  /** Committed changes are uploaded after this short batching delay. */
  urgentMs?: number;
  /** Reading a page, focusing or showing the tab pulls when the last sync is older than this. */
  staleMs?: number;
  /** Upper bound for one network exchange; a hung request must not block later syncs. */
  requestTimeoutMs?: number;
  /** Feed rows per page. */
  pageSize?: number;
  online?: () => boolean;
}

/** Receives every cloud response before it is stored, so the page shows it even if IndexedDB fails. */
export type RemoteListener = (response: SyncResponse) => void;

const REQUEST_TIMEOUT_MS = 30_000;
/** A manual sync waits this long for another tab's exchange to finish. */
const LOCK_WAIT_MS = 15_000;
/** Pages per wake; a longer backlog continues right after. */
const MAX_PAGES = 10;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('云同步超时，稍后自动重试。')), ms);
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

/** Web Locks are released by the browser when the holding tab closes, crashes or is discarded. */
function webLocks(): LockManager | undefined {
  return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function' &&
    typeof AbortSignal.timeout === 'function' ? navigator.locks : undefined;
}

const backoff = (retries: number) => Math.min(60_000, 1000 * 2 ** Math.min(retries - 1, 6)) * (0.75 + Math.random() * 0.5);

/**
 * Keeps one account's local data and the cloud in step.
 *
 * Pull: on connect, when a page is read, on focus, on becoming visible and on
 * coming back online (each at most once per `staleMs` unless something is
 * waiting), and after every upload. There is no idle polling and no socket.
 *
 * Push: committed changes (submissions, resets, tags, favourites, notes) are
 * handed over in memory the moment they are made and sent after a short
 * batching delay. Drafts are never uploaded. IndexedDB holds a durable copy of
 * the queue for the next visit; the queue itself never depends on it.
 *
 * Every exchange is one RPC: the queued changes go up, the cloud's current
 * rows for them and one page of the account's feed come back. Last writer
 * wins everywhere, so a retried or overlapping exchange is harmless.
 */
export class QuestionSyncEngine implements Outbox {
  private readonly queue = new OutboxQueue();
  private readonly statusListeners = new Set<(status: QuestionSyncStatus) => void>();
  private readonly remoteListeners = new Set<RemoteListener>();
  private transport: QuestionSyncTransport | null = null;
  private current: QuestionSyncStatus = { phase: 'local', pending: 0, lastSyncedAt: null, error: null };
  private running: Promise<void> | null = null;
  private runAgain = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dueAt = Infinity;
  private retries = 0;
  private retryAt = 0;
  /** The feed position, kept here too in case IndexedDB cannot store it. */
  private cursor: string | null = null;
  private cursorVolatile = false;
  private started = false;
  private stopped = false;

  constructor(
    private readonly database: QuestionDatabase | null,
    readonly namespace: QuestionNamespace,
    private readonly options: QuestionSyncOptions = {},
  ) {
    if (namespace === 'guest') throw new Error('Guests have nothing to sync');
  }

  get status(): QuestionSyncStatus { return this.current; }

  subscribe(listener: (status: QuestionSyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.current);
    return () => { this.statusListeners.delete(listener); };
  }

  onRemote(listener: RemoteListener): () => void {
    this.remoteListeners.add(listener);
    return () => { this.remoteListeners.delete(listener); };
  }

  private update(patch: Partial<QuestionSyncStatus>): void {
    const next = { ...this.current, ...patch, pending: this.queue.count };
    if (next.phase === this.current.phase && next.pending === this.current.pending && next.error === this.current.error &&
      next.lastSyncedAt === this.current.lastSyncedAt) return;
    this.current = next;
    for (const listener of this.statusListeners) listener(next);
  }

  private online(): boolean {
    return this.options.online?.() ?? (typeof navigator === 'undefined' || navigator.onLine !== false);
  }

  private idlePhase() {
    return !this.transport ? 'local' as const : this.online() ? 'idle' as const : 'offline' as const;
  }

  /* ------------------------------ outbox ------------------------------ */

  put(changes: Partial<SyncChanges>): void {
    if (this.stopped || !this.queue.merge(changes)) return;
    this.update({});
    this.schedule(this.options.urgentMs ?? 300);
  }

  holds(answerKey: string): boolean {
    return this.queue.holds(answerKey);
  }

  /** Picks up what an earlier visit (or another tab) left waiting in IndexedDB. */
  private async reloadPending(): Promise<void> {
    if (!this.database) return;
    try {
      this.queue.merge(await this.database.pending(this.namespace));
      this.update({});
    } catch { /* The memory queue still holds this visit's changes. */ }
  }

  /* ----------------------------- lifecycle ---------------------------- */

  start(): void {
    if (this.started) return;
    this.started = true;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
      window.addEventListener('focus', this.onFocus);
      window.addEventListener('pagehide', this.onHide);
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    void this.reloadPending();
    void this.database?.syncState(this.namespace).then(({ cursor, lastSyncedAt }) => {
      this.cursor ??= cursor;
      if (!this.current.lastSyncedAt) this.update({ lastSyncedAt });
    }, () => undefined);
  }

  /** Signed in with a verified session: start exchanging. */
  connect(transport: QuestionSyncTransport): void {
    if (this.stopped) return;
    this.transport = transport;
    this.update({ phase: this.idlePhase(), error: null });
    this.schedule(0);
  }

  /** The session ended; changes keep queueing for the next sign-in. */
  disconnect(): void {
    this.transport = null;
    this.clearTimer();
    this.update({ phase: 'local', error: null });
  }

  stop(): void {
    this.stopped = true;
    this.transport = null;
    this.clearTimer();
    this.statusListeners.clear();
    this.remoteListeners.clear();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
      window.removeEventListener('focus', this.onFocus);
      window.removeEventListener('pagehide', this.onHide);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }

  private stale(): boolean {
    const last = this.current.lastSyncedAt ? Date.parse(this.current.lastSyncedAt) : 0;
    return Date.now() - last >= (this.options.staleMs ?? 60_000);
  }

  /** Reading a page: make sure the local copy is recent, without a request per page view. */
  refreshIfStale(): void {
    if (this.stale() || this.queue.size) this.schedule(0);
  }

  private readonly onOnline = () => { this.schedule(0); };
  private readonly onOffline = () => {
    this.clearTimer();
    if (this.transport) this.update({ phase: 'offline' });
  };
  private readonly onFocus = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') this.refreshIfStale();
  };
  /** Leaving or hiding the page sends what is waiting now instead of after the batching delay. */
  private readonly onHide = () => { if (this.queue.size) this.schedule(0); };
  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') this.onHide();
    else this.refreshIfStale();
  };

  /* ----------------------------- exchange ----------------------------- */

  private clearTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.dueAt = Infinity;
  }

  /** Keeps the earliest requested wake. */
  private schedule(delay: number): void {
    if (this.stopped || !this.transport) return;
    const due = Date.now() + Math.max(0, delay);
    if (due >= this.dueAt) return;
    clearTimeout(this.timer);
    this.dueAt = due;
    this.timer = setTimeout(() => {
      this.dueAt = Infinity;
      void this.run(false);
    }, Math.max(0, delay));
  }

  /** Manual sync: skips the retry delay and waits briefly for another tab's turn. */
  sync(): Promise<void> { return this.run(true); }

  private run(force: boolean): Promise<void> {
    if (this.running) {
      this.runAgain = true;
      return this.running;
    }
    const work = this.exchange(force).finally(() => {
      this.running = null;
      if (this.runAgain) {
        this.runAgain = false;
        this.schedule(this.options.urgentMs ?? 300);
      }
    });
    this.running = work;
    return work;
  }

  private async exchange(force: boolean): Promise<void> {
    if (this.stopped || !this.transport) return;
    if (!this.online()) {
      this.update({ phase: 'offline' });
      return;
    }
    if (!force && this.retryAt > Date.now()) {
      this.schedule(this.retryAt - Date.now());
      return;
    }
    try {
      const ran = await this.exclusive(force, () => this.exchangeLoop());
      if (!ran) {
        // Another tab is exchanging for this account; come back shortly.
        this.schedule(2_000);
        if (force) this.update({ phase: 'error', error: '另一个标签页正在同步，请稍后再试。' });
      }
    } catch (error) {
      if (this.stopped) return;
      this.retries++;
      this.retryAt = Date.now() + backoff(this.retries);
      this.update({ phase: this.online() ? 'error' : 'offline', error: error instanceof Error ? error.message : String(error) });
      this.schedule(this.retryAt - Date.now());
    }
  }

  /**
   * One account syncs in one tab at a time. Web Locks are released by the
   * browser if the holding tab dies; without them the tabs simply overlap,
   * which last-writer-wins makes harmless.
   */
  private async exclusive(force: boolean, work: () => Promise<void>): Promise<boolean> {
    const locks = webLocks();
    if (!locks) {
      await work();
      return true;
    }
    const options: LockOptions = force ? { signal: AbortSignal.timeout(LOCK_WAIT_MS) } : { ifAvailable: true };
    try {
      return await locks.request(`exam-docs-question-sync:${this.namespace}`, options, async (lock) => {
        if (!lock) return false;
        await work();
        return true;
      });
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) return false;
      throw error;
    }
  }

  private async readCursor(): Promise<string | null> {
    if (this.database && !this.cursorVolatile) {
      try { return (await this.database.syncState(this.namespace)).cursor; } catch { /* fall back to memory */ }
    }
    return this.cursor;
  }

  private async exchangeLoop(): Promise<void> {
    this.update({ phase: 'syncing', error: null });
    await this.reloadPending();
    for (let page = 0; page < MAX_PAGES; page++) {
      const transport = this.transport;
      if (this.stopped || !transport || !this.online()) break;
      const sent = this.queue.take();
      const cursor = await this.readCursor();
      const response = await withTimeout(transport.sync({ changes: sent, cursor, limit: this.options.pageSize ?? 200 }),
        this.options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS);
      // The response belongs to this account even if the reader switched meanwhile:
      // storing it is still correct, showing it is not.
      if (!this.stopped) {
        this.queue.settle(sent);
        for (const listener of this.remoteListeners) listener(response);
      }
      this.cursor = response.cursor;
      try {
        await this.database?.commitExchange(this.namespace, sent, response);
        this.cursorVolatile = false;
      } catch {
        // Storage is full or broken: the page already shows the rows, and the cursor stays in memory.
        this.cursorVolatile = true;
      }
      if (this.stopped) return;
      this.retries = 0;
      this.retryAt = 0;
      this.update({ lastSyncedAt: new Date().toISOString() });
      const sentNothing = !sent.answers.length && !sent.attempts.length && !sent.tags.length && !sent.marks.length;
      // A queued row that can never fit a request must not keep the loop spinning.
      if (!response.hasMore && (!this.queue.size || sentNothing)) {
        this.update({ phase: this.idlePhase(), error: null });
        return;
      }
    }
    this.runAgain = true;
    this.update({ phase: this.idlePhase() });
  }
}
