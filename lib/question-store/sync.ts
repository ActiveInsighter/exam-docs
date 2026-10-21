import { QuestionDatabase } from './database';
import type { QuestionNamespace, QuestionSyncStatus, QuestionSyncTransport } from './types';

export interface QuestionSyncOptions {
  /** Quiet period after a draft edit before it is uploaded. */
  debounceMs?: number;
  /** Submissions and explicit choices are uploaded after this short batching delay. */
  urgentMs?: number;
  staleMs?: number;
  online?: () => boolean;
}

/**
 * A single bounded exchange loop. It wakes on edits, on realtime pokes from
 * the account's other devices, and on browser lifecycle events; there is no
 * idle polling. Realtime is only a hint: every wake pulls through the cursor
 * protocol, so a missed poke delays an update but never loses it.
 */
export class QuestionSyncEngine {
  private readonly owner = crypto.randomUUID();
  private readonly listeners = new Set<(status: QuestionSyncStatus) => void>();
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: (() => void) | undefined;
  private started = false;
  private stopped = false;
  private rescheduleAfterRun = false;
  private current: QuestionSyncStatus;

  constructor(
    private readonly database: QuestionDatabase,
    readonly namespace: QuestionNamespace,
    private readonly transport?: QuestionSyncTransport,
    private readonly options: QuestionSyncOptions = {},
  ) {
    this.current = { phase: transport && namespace !== 'guest' ? 'idle' : 'local', pending: 0, conflicts: 0, lastSyncedAt: null, error: null, live: false };
  }

  get status(): QuestionSyncStatus { return this.current; }

  subscribe(listener: (status: QuestionSyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => { this.listeners.delete(listener); };
  }

  private update(patch: Partial<QuestionSyncStatus>): void {
    this.current = { ...this.current, ...patch };
    for (const listener of this.listeners) listener(this.current);
  }

  private online(): boolean {
    return this.options.online?.() ?? (typeof navigator === 'undefined' || navigator.onLine !== false);
  }

  private async refresh(): Promise<void> {
    const [stats, metadata] = await Promise.all([this.database.stats(this.namespace), this.database.metadata(this.namespace)]);
    if (!this.stopped) this.update({ ...stats, lastSyncedAt: metadata.lastSyncedAt });
  }

  private dueAt = Infinity;
  private dueIsDebounce = false;

  /**
   * Keeps the earliest requested wake. A draft debounce restarts only another
   * debounce, so continued typing never postpones an urgent upload or a pull.
   */
  private schedule(delay: number, debounce = false): void {
    if (this.stopped || !this.started || !this.transport || this.namespace === 'guest') return;
    const due = Date.now() + Math.max(0, delay);
    if (due >= this.dueAt && !(debounce && this.dueIsDebounce)) return;
    clearTimeout(this.timer);
    this.dueAt = due;
    this.dueIsDebounce = debounce;
    this.timer = setTimeout(() => { this.dueAt = Infinity; void this.run(false); }, Math.max(0, delay));
  }

  /** Realtime said the account feed reached `cursor`; pull if this device is behind. */
  poke(cursor: string): void {
    if (!/^\d+$/.test(cursor)) return;
    void this.database.metadata(this.namespace).then((meta) => {
      if (!meta.cursor || BigInt(cursor) > BigInt(meta.cursor)) {
        if (this.running) this.rescheduleAfterRun = true;
        else this.schedule(0);
      }
    }).catch(() => this.schedule(0));
  }

  /** The realtime channel (re)connected: catch up on anything sent while it was down. */
  setLive(live: boolean): void {
    if (live === this.current.live) return;
    this.update({ live });
    if (live && !this.running) {
      const last = this.current.lastSyncedAt ? Date.parse(this.current.lastSyncedAt) : 0;
      if (Date.now() - last > 3000) this.schedule(0);
    }
  }

  private readonly onOnline = () => { this.schedule(0); };
  private readonly onOffline = () => {
    clearTimeout(this.timer);
    this.dueAt = Infinity;
    this.update({ phase: 'offline' });
  };
  /** Leaving or hiding the page uploads waiting drafts now instead of after the debounce. */
  private readonly onHide = () => {
    if (document.visibilityState === 'hidden' && this.current.pending > 0) this.schedule(0);
  };
  private readonly onFocus = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const last = this.current.lastSyncedAt ? Date.parse(this.current.lastSyncedAt) : 0;
    if (Date.now() - last >= (this.options.staleMs ?? 60_000) || this.current.pending > 0) this.schedule(0);
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    this.unsubscribe = this.database.subscribe((change) => {
      if (change.namespace !== this.namespace) return;
      void this.refresh().catch((error: unknown) => this.update({ phase: 'error', error: String(error) }));
      if (change.kind === 'local') {
        if (this.running) this.rescheduleAfterRun = true;
        if (change.urgent) this.schedule(this.options.urgentMs ?? 150);
        else this.schedule(this.options.debounceMs ?? 800, true);
      }
    });
    if (this.transport && this.namespace !== 'guest' && typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
      window.addEventListener('focus', this.onFocus);
      window.addEventListener('pagehide', this.onHide);
      document.addEventListener('visibilitychange', this.onFocus);
      document.addEventListener('visibilitychange', this.onHide);
    }
    void this.refresh().catch((error: unknown) => this.update({ phase: 'error', error: String(error) }));
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    clearTimeout(this.timer);
    this.dueAt = Infinity;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
      window.removeEventListener('focus', this.onFocus);
      window.removeEventListener('pagehide', this.onHide);
      document.removeEventListener('visibilitychange', this.onFocus);
      document.removeEventListener('visibilitychange', this.onHide);
    }
  }

  /** Explicit manual sync bypasses retry delay. Failures are reflected in status and remain durable. */
  sync(): Promise<void> { return this.run(true); }

  private run(force: boolean): Promise<void> {
    if (this.running) return this.running;
    const work = this.exchange(force);
    this.running = work;
    void work.then(() => {
      this.running = null;
      if (this.rescheduleAfterRun) {
        this.rescheduleAfterRun = false;
        this.schedule(this.options.urgentMs ?? 150);
      }
    }, () => { this.running = null; });
    return work;
  }

  private async exchange(force: boolean): Promise<void> {
    if (this.stopped) return;
    if (!this.transport || this.namespace === 'guest') {
      await this.refresh();
      this.update({ phase: 'local' });
      return;
    }
    if (!this.online()) {
      this.update({ phase: 'offline' });
      await this.refresh();
      return;
    }
    let leased = false;
    try {
      const meta = await this.database.metadata(this.namespace);
      if (!force && meta.nextRetryAt > Date.now()) {
        this.schedule(meta.nextRetryAt - Date.now());
        return;
      }
      leased = await this.database.acquireLease(this.namespace, this.owner);
      if (!leased) {
        // The other tab broadcasts committed results. A delayed wake also recovers a crashed tab.
        this.schedule(120_500);
        await this.refresh();
        return;
      }
      this.update({ phase: 'syncing', error: null });
      // Bound one wake to 20 exchanges; very large backlogs continue in a later task.
      for (let count = 0; count < 20; count++) {
        if (this.stopped || !this.online()) break;
        await this.database.acquireLease(this.namespace, this.owner);
        const metadata = await this.database.metadata(this.namespace);
        const operations = await this.database.batch(this.namespace);
        const response = await this.transport.sync({ operations, cursor: metadata.cursor, limit: 200 });
        // A completed old-account request may safely commit only to its original namespace.
        await this.database.apply(this.namespace, response, operations);
        await this.refresh();
        if (this.stopped) break;
        if (!response.hasMore) {
          const remaining = await this.database.batch(this.namespace, false);
          if (!remaining.length) break;
        }
        if (count === 19) this.rescheduleAfterRun = true;
      }
      if (!this.stopped) this.update({ phase: this.online() ? 'idle' : 'offline', error: null });
    } catch (error) {
      if (!this.stopped) {
        this.update({ phase: this.online() ? 'error' : 'offline', error: error instanceof Error ? error.message : String(error) });
        try {
          const nextRetryAt = await this.database.fail(this.namespace);
          this.schedule(nextRetryAt - Date.now());
          await this.refresh();
        } catch (storageError) {
          this.update({ phase: 'error', error: storageError instanceof Error ? storageError.message : String(storageError) });
        }
      }
    } finally {
      if (leased) await this.database.releaseLease(this.namespace, this.owner).catch(() => undefined);
    }
  }
}
