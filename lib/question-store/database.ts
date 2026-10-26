import {
  AnnotationStore, acknowledgeAnnotations, applyRemoteAnnotations, importGuestAnnotations, pendingAnnotations,
  type MarkRow, type TagRow,
} from './annotations';
import {
  AnswerStore, acknowledgeAnswers, applyRemoteAnswers, importGuestAnswers, pendingAnswers,
  type AnswerRow, type AttemptRow,
} from './answers';
import { byNamespace, request } from './idb';
import { DATABASE_NAME, SCHEMA_VERSION, STORES, upgrade, type StoreName } from './schema';
import type { DatabaseChange, QuestionNamespace, SyncChanges, SyncResponse } from './types';

export interface QuestionBackup {
  format: 'exam-docs-question-backup';
  version: 4;
  exportedAt: string;
  namespace: QuestionNamespace;
  answers: AnswerRow[];
  attempts: AttemptRow[];
  tags: TagRow[];
  marks: MarkRow[];
}

export interface QuestionDatabaseOptions {
  name?: string;
  indexedDB?: IDBFactory;
  /** Disable for deterministic tests or environments without BroadcastChannel. */
  broadcast?: boolean;
}

interface SyncMeta {
  namespace: QuestionNamespace;
  key: 'sync';
  cursor: string | null;
  lastSyncedAt: string | null;
}

/** What one committed exchange changed locally, for the caches and other tabs. */
export interface AppliedExchange {
  answers: string[];
  marks: string[];
}

/**
 * The browser database: one connection shared by the answer and annotation
 * stores, a reconnecting transaction helper and a change feed that also
 * reaches other tabs (BroadcastChannel).
 *
 * There is no memory fallback in here: when IndexedDB refuses a write, the
 * error reaches the cache, which keeps the value and tells the reader.
 */
export class QuestionDatabase {
  /** Identifies this tab's changes in the shared feed. */
  readonly tab = crypto.randomUUID();
  readonly answers = new AnswerStore(this);
  readonly annotations = new AnnotationStore(this);
  private readonly listeners = new Set<(change: DatabaseChange) => void>();
  private channel: BroadcastChannel | null = null;
  private closed = false;
  private disconnected = false;
  private reconnecting: Promise<void> | null = null;

  private constructor(private database: IDBDatabase, private readonly factory: IDBFactory, broadcast: boolean) {
    this.watchConnection(database);
    if (broadcast && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`${database.name}:changes`);
      this.channel.onmessage = (event: MessageEvent<DatabaseChange>) => {
        if (event.data?.namespace && event.data.tab !== this.tab) this.notify(event.data);
      };
    }
  }

  static async open(options: QuestionDatabaseOptions = {}): Promise<QuestionDatabase> {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) throw new Error('此浏览器无法使用 IndexedDB，答题记录无法持久保存。');
    const db = await this.openConnection(factory, options.name ?? DATABASE_NAME);
    return new QuestionDatabase(db, factory, options.broadcast !== false);
  }

  private static openConnection(factory: IDBFactory, name: string): Promise<IDBDatabase> {
    const opening = factory.open(name, SCHEMA_VERSION);
    opening.onupgradeneeded = (event) => upgrade(opening.result, opening.transaction!, event.oldVersion);
    return new Promise<IDBDatabase>((resolve, reject) => {
      let blocked = false;
      opening.onsuccess = () => {
        if (blocked) opening.result.close();
        else resolve(opening.result);
      };
      opening.onerror = () => reject(opening.error ?? new Error('Cannot open browser database'));
      opening.onblocked = () => {
        blocked = true;
        reject(new Error('数据库升级被其他标签页阻止，请关闭旧标签页后重试。'));
      };
    });
  }

  private watchConnection(db: IDBDatabase): void {
    db.onclose = () => { if (this.database === db) this.disconnected = true; };
    db.onversionchange = () => {
      db.close();
      if (this.database === db) this.disconnected = true;
    };
  }

  private reconnect(): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Browser database is closed'));
    return this.reconnecting ??= (async () => {
      this.database.close();
      const db = await QuestionDatabase.openConnection(this.factory, this.database.name);
      if (this.closed) { db.close(); throw new Error('Browser database is closed'); }
      this.database = db;
      this.disconnected = false;
      this.watchConnection(db);
    })().finally(() => { this.reconnecting = null; });
  }

  /** @internal Shared by the stores; one connection, one retry policy. */
  async transaction<T>(stores: readonly StoreName[], mode: IDBTransactionMode,
    run: (tx: IDBTransaction) => Promise<T>, retry = true): Promise<T> {
    if (this.closed) throw new Error('Browser database is closed');
    if (this.disconnected || this.reconnecting) await this.reconnect();
    let tx: IDBTransaction;
    try {
      tx = this.database.transaction([...stores], mode);
    } catch (error) {
      // No transaction started, so reconnecting cannot duplicate a write.
      if (!retry || !(error instanceof DOMException) || error.name !== 'InvalidStateError') throw error;
      this.disconnected = true;
      await this.reconnect();
      return this.transaction(stores, mode, run, false);
    }
    const completed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Browser database transaction aborted'));
      tx.onerror = () => { /* onabort reports the final transaction failure */ };
    });
    try {
      const result = await run(tx);
      await completed;
      return result;
    } catch (error) {
      try { tx.abort(); } catch { /* already complete */ }
      await completed.catch(() => undefined);
      // Only replay a rolled-back transaction after a connection interruption.
      if (retry && !this.closed && this.disconnected) {
        await this.reconnect();
        return this.transaction(stores, mode, run, false);
      }
      throw error;
    }
  }

  private notify(change: DatabaseChange): void {
    for (const listener of this.listeners) listener(change);
  }

  /** @internal Announces a committed change here and in other tabs. */
  emit(change: Omit<DatabaseChange, 'tab'>): void {
    const full = { ...change, tab: this.tab };
    this.notify(full);
    this.channel?.postMessage(full);
  }

  subscribe(listener: (change: DatabaseChange) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  close(): void {
    this.closed = true;
    this.channel?.close();
    this.channel = null;
    this.listeners.clear();
    this.database.close();
  }

  /* ------------------------------- sync ------------------------------- */

  /** Everything this account still has to upload, read through the sparse outbox indexes. */
  pending(namespace: QuestionNamespace): Promise<SyncChanges> {
    return this.transaction(['answers', 'attempts', 'tags', 'marks'], 'readonly', async (tx) => ({
      ...await pendingAnswers(tx, namespace),
      ...await pendingAnnotations(tx, namespace),
    }));
  }

  async syncState(namespace: QuestionNamespace): Promise<{ cursor: string | null; lastSyncedAt: string | null }> {
    const saved = await this.transaction(['meta'], 'readonly', (tx) =>
      request<SyncMeta | undefined>(tx.objectStore('meta').get([namespace, 'sync'])));
    return { cursor: saved?.cursor ?? null, lastSyncedAt: saved?.lastSyncedAt ?? null };
  }

  /** Commits one exchange atomically: acknowledgements, the cloud's rows and the new cursor. */
  async commitExchange(namespace: QuestionNamespace, sent: SyncChanges, response: SyncResponse): Promise<AppliedExchange> {
    const applied = await this.transaction(['answers', 'attempts', 'tags', 'marks', 'meta'], 'readwrite', async (tx) => {
      await acknowledgeAnswers(tx, namespace, sent.answers, sent.attempts);
      await acknowledgeAnnotations(tx, namespace, sent.tags, sent.marks);
      const answers = await applyRemoteAnswers(tx, namespace, response.answers, response.attempts);
      const marks = await applyRemoteAnnotations(tx, namespace, response);
      await request(tx.objectStore('meta').put({
        namespace, key: 'sync', cursor: response.cursor, lastSyncedAt: new Date().toISOString(),
      } satisfies SyncMeta));
      return { answers, marks };
    });
    if (applied.answers.length || response.attempts.length) this.emit({ namespace, scope: 'answers', keys: applied.answers, origin: 'sync' });
    if (applied.marks.length || response.tags.length || response.merged.length) this.emit({ namespace, scope: 'annotations', origin: 'sync' });
    return applied;
  }

  /* ------------------------------ account ----------------------------- */

  /** Explicit copy; guest data stays intact and repeated imports never duplicate attempts. */
  async importGuest(namespace: QuestionNamespace): Promise<{ records: number; attempts: number; marks: number }> {
    if (namespace === 'guest') throw new Error('Choose an account before importing');
    const result = await this.transaction(['answers', 'attempts', 'tags', 'marks'], 'readwrite', async (tx) => ({
      ...await importGuestAnswers(tx, namespace),
      marks: await importGuestAnnotations(tx, namespace),
    }));
    this.emit({ namespace, scope: 'answers', keys: result.keys, origin: 'import' });
    this.emit({ namespace, scope: 'annotations', origin: 'import' });
    return { records: result.records, attempts: result.attempts, marks: result.marks };
  }

  /** A readable JSON snapshot of one identity's local data. */
  exportBackup(namespace: QuestionNamespace): Promise<QuestionBackup> {
    return this.transaction(STORES, 'readonly', async (tx) => ({
      format: 'exam-docs-question-backup', version: 4, exportedAt: new Date().toISOString(), namespace,
      answers: (await request(tx.objectStore('answers').getAll(IDBKeyRange.bound([namespace], [namespace, []])))) as AnswerRow[],
      attempts: (await byNamespace<AttemptRow>(tx.objectStore('attempts'), namespace)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      tags: await byNamespace<TagRow>(tx.objectStore('tags'), namespace),
      marks: await byNamespace<MarkRow>(tx.objectStore('marks'), namespace),
    }));
  }
}
