import {
  type AnswerState, type DatabaseChange, type OutboxOperation, type QuestionAttempt,
  type QuestionConflict, type QuestionIdentity, type QuestionNamespace, type QuestionRecord,
  type QuestionSummary, type RemoteQuestionRecord, type SyncMetadata, type SyncOperation, type SyncResponse,
  questionKey, sameState, validateRemote, validateState,
} from './types';

const STORES = ['records', 'operations', 'attempts', 'conflicts', 'metadata'] as const;
/** v2: per-document and per-question indexes; the server feed changed, so sync cursors restart. */
const SCHEMA_VERSION = 2;
const DEFAULT_METADATA: SyncMetadata = { cursor: null, lastSyncedAt: null, retryCount: 0, nextRetryAt: 0 };
const uuid = () => crypto.randomUUID();
const identityOf = (value: QuestionIdentity): QuestionIdentity => ({ documentPath: value.documentPath, questionId: value.questionId, questionRevision: value.questionRevision });
const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error ?? new Error('Browser database request failed'));
});
const byNamespace = <T>(store: IDBObjectStore, namespace: QuestionNamespace) => request(store.index('namespace').getAll(namespace)) as Promise<T[]>;
const byQuestion = <T>(store: IDBObjectStore, namespace: QuestionNamespace, key: string) => request(store.index('question').getAll([namespace, key])) as Promise<T[]>;
const answered = (state: AnswerState) => state.selected.length > 0 || state.values.some((value) => value.trim() !== '');

export interface QuestionBackup {
  format: 'exam-docs-question-backup';
  version: 2;
  exportedAt: string;
  namespace: QuestionNamespace;
  records: QuestionRecord[];
  attempts: QuestionAttempt[];
  conflicts: QuestionConflict[];
}

export interface QuestionDatabaseOptions {
  name?: string;
  indexedDB?: IDBFactory;
  /** Disable for deterministic tests or environments without BroadcastChannel. */
  broadcast?: boolean;
}

/** No memory fallback: failed persistence must remain visible to the reader. */
export class QuestionDatabase {
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
        if (event.data && (event.data.kind === 'local' || event.data.kind === 'sync')) this.emit(event.data, false);
      };
    }
  }

  static async open(options: QuestionDatabaseOptions = {}): Promise<QuestionDatabase> {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) throw new Error('此浏览器无法使用 IndexedDB，答题记录无法持久保存。');
    const db = await this.openConnection(factory, options.name ?? 'exam-docs-questions');
    return new QuestionDatabase(db, factory, options.broadcast !== false);
  }

  private static openConnection(factory: IDBFactory, name: string): Promise<IDBDatabase> {
    const opening = factory.open(name, SCHEMA_VERSION);
    opening.onupgradeneeded = (event) => {
      const db = opening.result;
      const tx = opening.transaction!;
      if (event.oldVersion < 1) {
        const records = db.createObjectStore('records', { keyPath: ['namespace', 'key'] });
        const operations = db.createObjectStore('operations', { keyPath: 'operationId' });
        const attempts = db.createObjectStore('attempts', { keyPath: ['namespace', 'attemptId'] });
        const conflicts = db.createObjectStore('conflicts', { keyPath: ['namespace', 'conflictId'] });
        db.createObjectStore('metadata', { keyPath: ['namespace', 'key'] });
        for (const store of [records, operations, attempts, conflicts]) store.createIndex('namespace', 'namespace');
        operations.createIndex('question', ['namespace', 'key']);
      }
      if (event.oldVersion < 2) {
        tx.objectStore('records').createIndex('document', ['namespace', 'documentPath']);
        tx.objectStore('conflicts').createIndex('question', ['namespace', 'key']);
        // Feed positions from the v1 event log mean nothing to the compacted v2 feed.
        // Answers, versions and the outbox stay; only the next pull starts from zero.
        const metadata = tx.objectStore('metadata');
        const cursor = metadata.openCursor();
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) return;
          const value = entry.value as { key: string; value?: SyncMetadata };
          if (value.key === 'sync' && value.value) entry.update({ ...value, value: { ...value.value, cursor: null } });
          entry.continue();
        };
      }
    };
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

  private async transaction<T>(stores: readonly typeof STORES[number][], mode: IDBTransactionMode,
    run: (tx: IDBTransaction) => Promise<T>, retry = true): Promise<T> {
    if (this.closed) throw new Error('Browser database is closed');
    if (this.disconnected || this.reconnecting) await this.reconnect();
    let tx: IDBTransaction;
    try {
      tx = this.database.transaction([...stores], mode);
    } catch (error) {
      // No transaction started, so reconnecting cannot duplicate a submission.
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

  private emit(change: DatabaseChange, broadcast = true): void {
    for (const listener of this.listeners) listener(change);
    if (broadcast) this.channel?.postMessage(change);
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

  async get(namespace: QuestionNamespace, identity: QuestionIdentity): Promise<QuestionRecord | undefined> {
    const key = questionKey(identity);
    return this.transaction(['records'], 'readonly', (tx) => request(tx.objectStore('records').get([namespace, key])));
  }

  async list(namespace: QuestionNamespace): Promise<QuestionRecord[]> {
    return this.transaction(['records'], 'readonly', (tx) => byNamespace(tx.objectStore('records'), namespace));
  }

  /** Every saved answer of one page in a single indexed read; the page cache is filled from this. */
  async listDocument(namespace: QuestionNamespace, documentPath: string): Promise<QuestionRecord[]> {
    return this.transaction(['records'], 'readonly', (tx) =>
      request(tx.objectStore('records').index('document').getAll([namespace, documentPath])) as Promise<QuestionRecord[]>);
  }

  async getMany(namespace: QuestionNamespace, keys: readonly string[]): Promise<(QuestionRecord | undefined)[]> {
    if (!keys.length) return [];
    return this.transaction(['records'], 'readonly', (tx) => {
      const store = tx.objectStore('records');
      return Promise.all(keys.map((key) => request<QuestionRecord | undefined>(store.get([namespace, key]))));
    });
  }

  async summary(namespace: QuestionNamespace): Promise<QuestionSummary> {
    return this.transaction(['records', 'attempts'], 'readonly', async (tx) => {
      const records = await byNamespace<QuestionRecord>(tx.objectStore('records'), namespace);
      const attempts = await request(tx.objectStore('attempts').index('namespace').count(namespace));
      return {
        answered: records.filter((record) => answered(record.state)).length,
        submitted: records.filter((record) => record.state.submitted).length,
        attempts,
      };
    });
  }

  /** A readable JSON snapshot of one identity's local data, including resolved conflicts. */
  async exportBackup(namespace: QuestionNamespace): Promise<QuestionBackup> {
    return this.transaction(['records', 'attempts', 'conflicts'], 'readonly', async (tx) => ({
      format: 'exam-docs-question-backup', version: 2, exportedAt: new Date().toISOString(), namespace,
      records: await byNamespace<QuestionRecord>(tx.objectStore('records'), namespace),
      attempts: (await byNamespace<QuestionAttempt>(tx.objectStore('attempts'), namespace)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      conflicts: await byNamespace<QuestionConflict>(tx.objectStore('conflicts'), namespace),
    }));
  }

  async listAttempts(namespace: QuestionNamespace, identity?: QuestionIdentity): Promise<QuestionAttempt[]> {
    const key = identity ? questionKey(identity) : undefined;
    return this.transaction(['attempts'], 'readonly', async (tx) =>
      (await byNamespace<QuestionAttempt>(tx.objectStore('attempts'), namespace))
        .filter((entry) => !key || questionKey(entry) === key).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async listConflicts(namespace: QuestionNamespace, includeResolved = false): Promise<QuestionConflict[]> {
    return this.transaction(['conflicts'], 'readonly', async (tx) =>
      (await byNamespace<QuestionConflict>(tx.objectStore('conflicts'), namespace)).filter((conflict) => includeResolved || !conflict.resolvedAt));
  }

  async save(namespace: QuestionNamespace, identity: QuestionIdentity, state: AnswerState,
    options: { submission?: boolean } = {}): Promise<QuestionRecord> {
    const key = questionKey(identity);
    // Reserve space for PostgreSQL JSONB rendering whitespace inside its 16 KiB limit.
    validateState(state, 15 * 1024);
    if (options.submission && (!state.submitted || state.attempt < 1)) throw new Error('A submission must contain a submitted answer and a positive attempt');
    const record = await this.transaction(['records', 'operations', 'attempts', 'conflicts'], 'readwrite', async (tx) => {
      const records = tx.objectStore('records');
      const previous = await request<QuestionRecord | undefined>(records.get([namespace, key]));
      if (previous && sameState(previous.state, state) && !options.submission) return previous;
      const updatedAt = new Date().toISOString();
      const next: QuestionRecord = {
        ...identityOf(identity), namespace, key, state: structuredClone(state),
        generation: (previous?.generation ?? 0) + 1, remoteVersion: previous?.remoteVersion ?? 0,
        updatedAt, dirty: namespace !== 'guest',
      };
      await request(records.put(next));
      const conflicts = tx.objectStore('conflicts');
      for (const conflict of await byQuestion<QuestionConflict>(conflicts, namespace, key)) {
        if (!conflict.resolvedAt) await request(conflicts.put({ ...conflict, localState: next.state }));
      }
      let attempt: QuestionAttempt | undefined;
      if (options.submission) {
        attempt = { ...identityOf(identity), namespace, attemptId: uuid(), state: structuredClone(state), createdAt: updatedAt };
        await request(tx.objectStore('attempts').add(attempt));
      }
      if (namespace !== 'guest') {
        const operations = tx.objectStore('operations');
        const pending = await byQuestion<OutboxOperation>(operations, namespace, key);
        // Only unsent drafts can be replaced. Attempts and uncertain in-flight writes retain their IDs.
        for (const operation of pending) if (!operation.inFlight && !operation.attempt) await request(operations.delete(operation.operationId));
        const operation: OutboxOperation = {
          ...identityOf(identity), namespace, key, operationId: uuid(), state: structuredClone(state),
          generation: next.generation, baseVersion: next.remoteVersion, createdAt: updatedAt, inFlight: false,
          ...(attempt ? { attempt: { attemptId: attempt.attemptId, state: attempt.state, createdAt: attempt.createdAt } } : {}),
        };
        await request(operations.add(operation));
      }
      return next;
    });
    this.emit({ namespace, kind: 'local', keys: [key], urgent: options.submission === true });
    return record;
  }

  /** Explicit copy; guest records remain intact and repeated imports never duplicate attempts. */
  async importGuest(namespace: QuestionNamespace): Promise<{ records: number; attempts: number }> {
    if (namespace === 'guest') throw new Error('Choose an account before importing');
    const changed = new Set<string>();
    const result = await this.transaction(STORES, 'readwrite', async (tx) => {
      changed.clear();
      const records = tx.objectStore('records');
      const attempts = tx.objectStore('attempts');
      const operations = tx.objectStore('operations');
      const guests = await byNamespace<QuestionRecord>(records, 'guest');
      const guestAttempts = await byNamespace<QuestionAttempt>(attempts, 'guest');
      const existingAttempts = await byNamespace<QuestionAttempt>(attempts, namespace);
      const imported = new Set(existingAttempts.map((attempt) => attempt.sourceAttemptId));
      let recordCount = 0;
      let attemptCount = 0;
      for (const guest of guests) {
        const previous = await request<QuestionRecord | undefined>(records.get([namespace, guest.key]));
        // Existing account answers take precedence; importing must never silently overwrite them.
        if (!previous) {
          const next = { ...guest, namespace, generation: 1, remoteVersion: 0, dirty: true };
          await request(records.put(next));
          await request(operations.add({ ...identityOf(guest), namespace, key: guest.key, operationId: uuid(), state: guest.state, generation: 1, baseVersion: 0, createdAt: new Date().toISOString(), inFlight: false } satisfies OutboxOperation));
          changed.add(guest.key);
          recordCount++;
        }
      }
      for (const guest of guestAttempts) {
        if (imported.has(guest.attemptId)) continue;
        const attempt: QuestionAttempt = { ...guest, namespace, attemptId: uuid(), sourceAttemptId: guest.attemptId };
        await request(attempts.add(attempt));
        const key = questionKey(guest);
        const current = await request<QuestionRecord | undefined>(records.get([namespace, key]));
        if (current) {
          await request(operations.add({ ...identityOf(guest), namespace, key, operationId: uuid(), state: current.state, generation: current.generation, baseVersion: current.remoteVersion, createdAt: new Date().toISOString(), inFlight: false, attempt: { attemptId: attempt.attemptId, state: attempt.state, createdAt: attempt.createdAt } } satisfies OutboxOperation));
        }
        attemptCount++;
      }
      return { records: recordCount, attempts: attemptCount };
    });
    this.emit({ namespace, kind: 'local', keys: [...changed], urgent: true });
    return result;
  }

  async resolveConflict(namespace: QuestionNamespace, conflictId: string, resolution: 'local' | 'remote'): Promise<void> {
    const key = await this.transaction(['records', 'operations', 'conflicts'], 'readwrite', async (tx) => {
      const conflicts = tx.objectStore('conflicts');
      const conflict = await request<QuestionConflict | undefined>(conflicts.get([namespace, conflictId]));
      if (!conflict || conflict.resolvedAt) return undefined;
      const records = tx.objectStore('records');
      const current = await request<QuestionRecord | undefined>(records.get([namespace, conflict.key]));
      if (!current) throw new Error('Missing local answer for conflict');
      const state = resolution === 'local' ? current.state : conflict.remote.state;
      // The server may explicitly report version zero for a missing record.
      // Resolve against the displayed server snapshot, even if an imported local base was higher.
      const remoteVersion = conflict.remote.version;
      const generation = current.generation + 1;
      const now = new Date().toISOString();
      const operations = tx.objectStore('operations');
      const pending = await byQuestion<OutboxOperation>(operations, namespace, conflict.key);
      // Preserve every unsent historical submission, even when choosing the remote current answer.
      for (const operation of pending) {
        await request(operations.delete(operation.operationId));
        if (operation.attempt) await request(operations.add({ ...operation, operationId: uuid(), state, generation, baseVersion: remoteVersion, inFlight: false }));
      }
      const needsPush = resolution === 'local' || pending.some((operation) => operation.attempt);
      if (resolution === 'local') await request(operations.add({ ...identityOf(current), namespace, key: current.key, operationId: uuid(), state, generation, baseVersion: remoteVersion, createdAt: now, inFlight: false } satisfies OutboxOperation));
      await request(records.put({ ...current, state, generation, remoteVersion, updatedAt: now, dirty: needsPush }));
      for (const entry of await byQuestion<QuestionConflict>(conflicts, namespace, conflict.key)) {
        if (!entry.resolvedAt) await request(conflicts.put({ ...entry, resolvedAt: now, resolution }));
      }
      return conflict.key;
    });
    if (key) this.emit({ namespace, kind: 'local', keys: [key], urgent: true });
  }

  async metadata(namespace: QuestionNamespace): Promise<SyncMetadata> {
    return this.transaction(['metadata'], 'readonly', async (tx) => {
      const value = await request<{ value: SyncMetadata } | undefined>(tx.objectStore('metadata').get([namespace, 'sync']));
      return value?.value ?? { ...DEFAULT_METADATA };
    });
  }

  async stats(namespace: QuestionNamespace): Promise<{ pending: number; conflicts: number }> {
    return this.transaction(['operations', 'conflicts'], 'readonly', async (tx) => ({
      pending: await request(tx.objectStore('operations').index('namespace').count(namespace)),
      conflicts: (await byNamespace<QuestionConflict>(tx.objectStore('conflicts'), namespace)).filter((value) => !value.resolvedAt).length,
    }));
  }

  async acquireLease(namespace: QuestionNamespace, owner: string): Promise<boolean> {
    return this.transaction(['metadata'], 'readwrite', async (tx) => {
      const store = tx.objectStore('metadata');
      const lease = await request<{ owner: string; expiresAt: number } | undefined>(store.get([namespace, 'lease']));
      if (lease && lease.owner !== owner && lease.expiresAt > Date.now()) return false;
      await request(store.put({ namespace, key: 'lease', owner, expiresAt: Date.now() + 120_000 }));
      return true;
    });
  }

  async releaseLease(namespace: QuestionNamespace, owner: string): Promise<void> {
    await this.transaction(['metadata'], 'readwrite', async (tx) => {
      const store = tx.objectStore('metadata');
      const lease = await request<{ owner: string } | undefined>(store.get([namespace, 'lease']));
      if (lease?.owner === owner) await request(store.delete([namespace, 'lease']));
    });
  }

  async batch(namespace: QuestionNamespace, markInFlight = true): Promise<SyncOperation[]> {
    return this.transaction(['operations', 'conflicts'], 'readwrite', async (tx) => {
      const blocked = new Set((await byNamespace<QuestionConflict>(tx.objectStore('conflicts'), namespace)).filter((entry) => !entry.resolvedAt).map((entry) => entry.key));
      const store = tx.objectStore('operations');
      const pending = (await byNamespace<OutboxOperation>(store, namespace)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.generation - b.generation || a.operationId.localeCompare(b.operationId));
      const keys = new Set<string>();
      const result: SyncOperation[] = [];
      let bytes = 0;
      for (const operation of pending) {
        if (blocked.has(operation.key) || keys.has(operation.key)) continue;
        const wire: SyncOperation = { ...identityOf(operation), operationId: operation.operationId, state: operation.state, baseVersion: operation.baseVersion, ...(operation.attempt ? { attempt: operation.attempt } : {}) };
        const size = new TextEncoder().encode(JSON.stringify(wire)).length;
        if (result.length >= 50 || bytes + size > 240 * 1024) break;
        keys.add(operation.key);
        result.push(wire);
        bytes += size;
        if (markInFlight) await request(store.put({ ...operation, inFlight: true }));
      }
      return result;
    });
  }

  async fail(namespace: QuestionNamespace): Promise<number> {
    return this.transaction(['metadata'], 'readwrite', async (tx) => {
      const store = tx.objectStore('metadata');
      const saved = await request<{ value: SyncMetadata } | undefined>(store.get([namespace, 'sync']));
      const meta = saved?.value ?? { ...DEFAULT_METADATA };
      const retryCount = meta.retryCount + 1;
      const delay = Math.min(60_000, 1000 * 2 ** Math.min(retryCount - 1, 6)) * (0.75 + Math.random() * 0.5);
      const nextRetryAt = Date.now() + delay;
      await request(store.put({ namespace, key: 'sync', value: { ...meta, retryCount, nextRetryAt } }));
      return nextRetryAt;
    });
  }

  /** Apply receipts, pulled progress, history and cursor in one durable transaction. */
  async apply(namespace: QuestionNamespace, response: SyncResponse, sent: SyncOperation[] = []): Promise<void> {
    if (!response || !Array.isArray(response.receipts) || !Array.isArray(response.changes) || !Array.isArray(response.attempts) ||
      typeof response.cursor !== 'string' || !/^\d+$/.test(response.cursor) || typeof response.hasMore !== 'boolean') throw new Error('Invalid sync response');
    const receiptIds = new Set(response.receipts.map((receipt) => receipt.operationId));
    if (sent.some((operation) => !receiptIds.has(operation.operationId))) throw new Error('Sync response is missing write receipts');
    for (const receipt of response.receipts) {
      if (receipt.status !== 'applied' && receipt.status !== 'conflict') throw new Error('Invalid sync receipt');
      validateRemote(receipt.record);
      const operation = sent.find((entry) => entry.operationId === receipt.operationId);
      if (operation && questionKey(operation) !== questionKey(receipt.record)) throw new Error('Sync receipt identity mismatch');
    }
    for (const record of response.changes) validateRemote(record);
    for (const attempt of response.attempts) {
      questionKey(attempt); validateState(attempt.state);
      if (typeof attempt.attemptId !== 'string' || !attempt.attemptId || !attempt.state.submitted || attempt.state.attempt < 1 ||
        !Number.isFinite(Date.parse(attempt.createdAt))) throw new Error('Invalid remote attempt');
    }
    const changed = new Set<string>();
    await this.transaction(STORES, 'readwrite', async (tx) => {
      changed.clear();
      const records = tx.objectStore('records');
      const operations = tx.objectStore('operations');
      const conflicts = tx.objectStore('conflicts');
      const metadata = tx.objectStore('metadata');
      const existingMeta = await request<{ value: SyncMetadata } | undefined>(metadata.get([namespace, 'sync']));
      const previousMeta = existingMeta?.value ?? { ...DEFAULT_METADATA };
      if (!response.reset && previousMeta.cursor && BigInt(response.cursor) < BigInt(previousMeta.cursor)) throw new Error('Sync cursor moved backwards');
      const openConflict = async (key: string) =>
        (await byQuestion<QuestionConflict>(conflicts, namespace, key)).find((entry) => !entry.resolvedAt);
      const recordConflict = async (current: QuestionRecord, remote: RemoteQuestionRecord) => {
        const existing = await openConflict(current.key);
        const conflict: QuestionConflict = existing
          ? { ...existing, localState: current.state, remote: remote.version >= existing.remote.version ? remote : existing.remote }
          : { ...identityOf(current), namespace, key: current.key, conflictId: uuid(), localState: current.state, remote, createdAt: new Date().toISOString() };
        await request(conflicts.put(conflict));
        await request(records.put({ ...current, remoteVersion: Math.max(current.remoteVersion, remote.version), dirty: true }));
        changed.add(current.key);
      };
      const rebase = async (key: string, version: number) => {
        const pending = await byQuestion<OutboxOperation>(operations, namespace, key);
        for (const operation of pending) if (!operation.inFlight) await request(operations.put({ ...operation, baseVersion: version }));
        return pending;
      };
      const accept = async (current: QuestionRecord, operation: OutboxOperation, remote: RemoteQuestionRecord) => {
        const version = Math.max(current.remoteVersion, remote.version);
        const pending = await rebase(operation.key, version);
        const adopt = current.generation === operation.generation && remote.version >= current.remoteVersion;
        await request(records.put({ ...current, remoteVersion: version,
          ...(adopt ? { state: remote.state, updatedAt: remote.updatedAt } : {}),
          dirty: pending.length > 0,
        }));
        if (adopt && !sameState(current.state, remote.state)) changed.add(current.key);
      };
      for (const receipt of response.receipts) {
        const operation = await request<OutboxOperation | undefined>(operations.get(receipt.operationId));
        if (!operation || operation.namespace !== namespace) continue; // duplicate response is harmless
        const current = await request<QuestionRecord | undefined>(records.get([namespace, operation.key]));
        await request(operations.delete(operation.operationId));
        if (!current) continue;
        // A CAS miss whose server row already holds exactly this answer (an
        // expired receipt for our own earlier write, or the same choice made on
        // another device) is a confirmation, not a choice the reader must make.
        if (receipt.status === 'conflict' && !sameState(receipt.record.state, operation.state)) {
          await recordConflict(current, receipt.record);
        } else {
          await accept(current, operation, receipt.record);
        }
      }
      for (const remote of response.changes) {
        const key = questionKey(remote);
        const current = await request<QuestionRecord | undefined>(records.get([namespace, key]));
        if (current && remote.version <= current.remoteVersion) continue;
        const pending = await byQuestion<OutboxOperation>(operations, namespace, key);
        const unresolved = Boolean(await openConflict(key));
        if (current && (pending.length || unresolved) && !sameState(current.state, remote.state)) {
          await recordConflict(current, remote);
        } else {
          if (pending.length) await rebase(key, remote.version);
          await request(records.put({ ...identityOf(remote), namespace, key, state: remote.state,
            generation: current?.generation ?? 0, remoteVersion: remote.version, updatedAt: remote.updatedAt, dirty: pending.length > 0 } satisfies QuestionRecord));
          if (!current || !sameState(current.state, remote.state)) changed.add(key);
        }
      }
      for (const attempt of response.attempts) {
        const store = tx.objectStore('attempts');
        const existing = await request<QuestionAttempt | undefined>(store.get([namespace, attempt.attemptId]));
        if (!existing) await request(store.add({ ...attempt, namespace }));
      }
      await request(metadata.put({ namespace, key: 'sync', value: { cursor: response.cursor, lastSyncedAt: new Date().toISOString(), retryCount: 0, nextRetryAt: 0 } satisfies SyncMetadata }));
    });
    this.emit({ namespace, kind: 'sync', keys: [...changed] });
  }
}
