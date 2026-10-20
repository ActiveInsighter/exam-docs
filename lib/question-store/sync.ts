import { QuestionDatabase } from './database';
import type { QuestionNamespace, QuestionSyncStatus, QuestionSyncTransport } from './types';

export interface QuestionSyncOptions {
  debounceMs?: number;
  staleMs?: number;
  online?: () => boolean;
}

/** A single bounded exchange loop, woken by edits and browser lifecycle events. No idle polling. */
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
    this.current = { phase: transport && namespace !== 'guest' ? 'idle' : 'local', pending: 0, conflicts: 0, lastSyncedAt: null, error: null };
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

  private schedule(delay: number): void {
    if (this.stopped || !this.started || !this.transport || this.namespace === 'guest') return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.run(false); }, Math.max(0, delay));
  }

  private readonly onOnline = () => { this.schedule(0); };
  private readonly onOffline = () => {
    clearTimeout(this.timer);
    this.update({ phase: 'offline' });
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
        this.schedule(this.options.debounceMs ?? 1500);
      }
    });
    if (this.transport && this.namespace !== 'guest' && typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
      window.addEventListener('focus', this.onFocus);
      document.addEventListener('visibilitychange', this.onFocus);
    }
    void this.refresh().catch((error: unknown) => this.update({ phase: 'error', error: String(error) }));
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
      window.removeEventListener('focus', this.onFocus);
      document.removeEventListener('visibilitychange', this.onFocus);
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
        this.schedule(this.options.debounceMs ?? 1500);
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
        const response = await this.transport.sync({ operations, cursor: metadata.cursor, limit: 100 });
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
