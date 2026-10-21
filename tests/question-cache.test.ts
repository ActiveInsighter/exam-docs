import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  QuestionAnswerCache, QuestionDatabase, QuestionSyncEngine, namespaceForUser, questionKey,
  type AnswerState, type QuestionIdentity, type QuestionSyncTransport, type SyncRequest, type SyncResponse,
} from '../lib/question-store';

const ACCOUNT = namespaceForUser('11111111-1111-4111-8111-111111111111');
const page = '/docs/math';
const question = (questionId: string): QuestionIdentity => ({ documentPath: page, questionId, questionRevision: 'r1' });
const draft = (text: string): AnswerState => ({ selected: [], values: [text], submitted: false, attempt: 0 });
const submitted = (text: string, attempt = 1): AnswerState => ({ ...draft(text), submitted: true, attempt });
const cleanup: (() => void)[] = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function open(factory = new IDBFactory(), name = crypto.randomUUID()) {
  const db = await QuestionDatabase.open({ name, indexedDB: factory, broadcast: false });
  cleanup.push(() => db.close());
  return db;
}

function cacheFor(db: QuestionDatabase | null) {
  const cache = new QuestionAnswerCache(db, ACCOUNT);
  cleanup.push(() => cache.dispose());
  return cache;
}

async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await settle();
  expect(check()).toBe(true);
}

afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

describe('question answer memory cache', () => {
  it('fills every question of a page from one indexed read and then reads memory synchronously', async () => {
    const db = await open();
    await db.save(ACCOUNT, question('q1'), draft('one'));
    await db.save(ACCOUNT, question('q2'), submitted('two'), { submission: true });
    const reads = vi.spyOn(db, 'listDocument');
    const cache = cacheFor(db);
    const ids = ['q1', 'q2', 'q3'].map(question);
    for (const id of ids) cache.subscribe(id, () => {});
    expect(cache.read(ids[0]).ready).toBe(false);
    await until(() => ids.every((id) => cache.read(id).ready));
    expect(reads).toHaveBeenCalledOnce();
    expect(ids.map((id) => cache.read(id).state.values[0] ?? null)).toEqual(['one', 'two', null]);
    // Stable snapshots: useSyncExternalStore must not see a new object without a change.
    expect(cache.read(ids[0])).toBe(cache.read(ids[0]));
  });

  it('shows a write immediately, persists it, and collapses queued drafts without losing submissions', async () => {
    const db = await open();
    const save = vi.spyOn(db, 'save');
    const cache = cacheFor(db);
    const id = question('q1');
    cache.subscribe(id, () => {});
    await until(() => cache.read(id).ready);
    for (const text of ['a', 'ab', 'abc']) cache.write(id, draft(text));
    cache.write(id, submitted('abc'), { submission: true });
    cache.write(id, draft('x'));
    cache.write(id, draft('xy'));
    expect(cache.read(id).state.values).toEqual(['xy']);
    await until(() => save.mock.calls.length >= 4 && !cache.hasUnsaved());
    await settle();
    // "a" was already being written; "ab" collapsed into "abc"; "x" into "xy".
    expect(save.mock.calls.map(([, , state, options]) => `${state.values[0]}${options?.submission ? '!' : ''}`)).toEqual(['a', 'abc', 'abc!', 'xy']);
    expect((await db.get(ACCOUNT, id))?.state.values).toEqual(['xy']);
    expect(await db.listAttempts(ACCOUNT)).toHaveLength(1);
  });

  it('keeps an unsaved answer in memory after a storage failure and persists it on retry', async () => {
    const db = await open();
    const cache = cacheFor(db);
    const id = question('q1');
    cache.subscribe(id, () => {});
    await until(() => cache.read(id).ready);
    const failure = vi.spyOn(db, 'save').mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
    cache.write(id, draft('keep me'));
    await until(() => cache.read(id).error !== null);
    expect(cache.read(id).error).toContain('存储空间不足');
    expect(cache.read(id).state.values).toEqual(['keep me']);
    expect(cache.hasUnsaved()).toBe(true);
    failure.mockRestore();
    cache.retry(id);
    await until(() => cache.read(id).error === null && !cache.hasUnsaved());
    expect((await db.get(ACCOUNT, id))?.state.values).toEqual(['keep me']);
  });

  it('refreshes only keys named by a sync change and never overwrites an unsaved local edit', async () => {
    const db = await open();
    const cache = cacheFor(db);
    const [first, second] = [question('q1'), question('q2')];
    const notified = { q1: 0, q2: 0 };
    cache.subscribe(first, () => { notified.q1++; });
    cache.subscribe(second, () => { notified.q2++; });
    await until(() => cache.read(first).ready && cache.read(second).ready);
    const many = vi.spyOn(db, 'getMany');
    await db.apply(ACCOUNT, { receipts: [], attempts: [], cursor: '1', hasMore: false,
      changes: [{ ...first, state: draft('remote'), version: 1, updatedAt: new Date().toISOString() }] });
    await until(() => cache.read(first).state.values[0] === 'remote');
    expect(many).toHaveBeenCalledWith(ACCOUNT, [questionKey(first)]);
    expect(notified.q2).toBe(1); // only its initial load

    // A pull that lands while a local write is queued must not roll back typing.
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const save = db.save.bind(db);
    vi.spyOn(db, 'save').mockImplementationOnce(async (...args) => { await blocked; return save(...args); });
    cache.write(first, draft('typing'));
    await db.apply(ACCOUNT, { receipts: [], attempts: [], cursor: '2', hasMore: false,
      changes: [{ ...first, state: draft('stale'), version: 2, updatedAt: new Date().toISOString() }] });
    await settle();
    expect(cache.read(first).state.values).toEqual(['typing']);
    release();
    await until(() => !cache.hasUnsaved());
  });

  it('works without a browser database as a memory-only cache', () => {
    const cache = cacheFor(null);
    const id = question('q1');
    expect(cache.read(id).ready).toBe(true);
    cache.write(id, draft('memory'));
    expect(cache.read(id).state.values).toEqual(['memory']);
    expect(cache.hasUnsaved()).toBe(false);
  });
});

describe('browser schema upgrade', () => {
  it('upgrades a v1 database in place, keeping answers and outbox while restarting the sync cursor', async () => {
    const factory = new IDBFactory();
    const name = crypto.randomUUID();
    await new Promise<void>((resolve, reject) => {
      const opening = factory.open(name, 1);
      opening.onupgradeneeded = () => {
        const db = opening.result;
        const records = db.createObjectStore('records', { keyPath: ['namespace', 'key'] });
        const operations = db.createObjectStore('operations', { keyPath: 'operationId' });
        const attempts = db.createObjectStore('attempts', { keyPath: ['namespace', 'attemptId'] });
        const conflicts = db.createObjectStore('conflicts', { keyPath: ['namespace', 'conflictId'] });
        const metadata = db.createObjectStore('metadata', { keyPath: ['namespace', 'key'] });
        for (const store of [records, operations, attempts, conflicts]) store.createIndex('namespace', 'namespace');
        operations.createIndex('question', ['namespace', 'key']);
        const id = question('q1');
        records.put({ ...id, namespace: ACCOUNT, key: questionKey(id), state: draft('v1 answer'), generation: 1, remoteVersion: 3, updatedAt: new Date().toISOString(), dirty: true });
        operations.put({ ...id, namespace: ACCOUNT, key: questionKey(id), operationId: crypto.randomUUID(), state: draft('v1 answer'), generation: 1, baseVersion: 3, createdAt: new Date().toISOString(), inFlight: false });
        metadata.put({ namespace: ACCOUNT, key: 'sync', value: { cursor: '17', lastSyncedAt: null, retryCount: 0, nextRetryAt: 0 } });
      };
      opening.onsuccess = () => { opening.result.close(); resolve(); };
      opening.onerror = () => reject(opening.error);
    });
    const db = await open(factory, name);
    expect((await db.metadata(ACCOUNT)).cursor).toBeNull();
    expect((await db.listDocument(ACCOUNT, page)).map((record) => record.state.values[0])).toEqual(['v1 answer']);
    expect(await db.stats(ACCOUNT)).toEqual({ pending: 1, conflicts: 0 });
    expect((await db.batch(ACCOUNT, false))[0].baseVersion).toBe(3);
  });
});

describe('realtime-driven sync engine', () => {
  function server() {
    let cursor = 0;
    const requests: SyncRequest[] = [];
    const transport: QuestionSyncTransport = {
      async sync(input) {
        requests.push(input);
        const receipts = input.operations.map((operation) => {
          cursor++;
          return { operationId: operation.operationId, status: 'applied' as const,
            record: { ...operation, state: operation.state, version: operation.baseVersion + 1, updatedAt: new Date().toISOString() } };
        });
        return { receipts, changes: [], attempts: [], cursor: String(cursor), hasMore: false } satisfies SyncResponse;
      },
    };
    return { transport, requests, advance: () => String(++cursor) };
  }

  it('pulls on a poke only when this device is behind and reports realtime state', async () => {
    const db = await open();
    const remote = server();
    const sync = new QuestionSyncEngine(db, ACCOUNT, remote.transport, { online: () => true });
    cleanup.push(() => sync.stop());
    sync.start();
    await until(() => remote.requests.length === 1 && sync.status.phase === 'idle');
    sync.poke('0');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(remote.requests).toHaveLength(1);
    sync.poke(remote.advance());
    await until(() => remote.requests.length === 2);
    sync.setLive(true);
    expect(sync.status.live).toBe(true);
  });

  it('uploads a submission without waiting for the draft debounce', async () => {
    const db = await open();
    const remote = server();
    const sync = new QuestionSyncEngine(db, ACCOUNT, remote.transport, { online: () => true, debounceMs: 60_000, urgentMs: 0 });
    cleanup.push(() => sync.stop());
    sync.start();
    await until(() => remote.requests.length === 1 && sync.status.phase === 'idle');
    await db.save(ACCOUNT, question('q1'), draft('typing'));
    await db.save(ACCOUNT, question('q1'), submitted('typing'), { submission: true });
    await until(() => remote.requests.length === 2);
    expect(remote.requests[1].operations.map((operation) => Boolean(operation.attempt))).toEqual([true]);
  });

  it('treats a CAS miss whose cloud row already equals the sent answer as a confirmation', async () => {
    const db = await open();
    const id = question('q1');
    await db.save(ACCOUNT, id, draft('same'));
    const [operation] = await db.batch(ACCOUNT);
    await db.apply(ACCOUNT, { receipts: [{ operationId: operation.operationId, status: 'conflict',
      record: { ...id, state: draft('same'), version: 4, updatedAt: new Date().toISOString() } }],
    changes: [], attempts: [], cursor: '4', hasMore: false }, [operation]);
    expect(await db.listConflicts(ACCOUNT)).toEqual([]);
    expect(await db.get(ACCOUNT, id)).toMatchObject({ remoteVersion: 4, dirty: false });
  });
});
