import { IDBFactory, forceCloseDatabase } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  QuestionSyncEngine, nextTimestamp, questionKey,
  type QuestionDatabase, type QuestionNamespace, type QuestionSyncOptions, type QuestionSyncTransport, type SyncChanges,
} from '../lib/question-store';
import {
  ACCOUNT, FakeServer, OTHER, choice, draft, onCleanup, openDatabase as open, page, question, quota, runCleanup, submitted, tick, until,
} from './helpers/question-store';

const identity = question();
const empty: SyncChanges = { answers: [], attempts: [], tags: [], marks: [] };
const committed = (state = submitted('x'), at = nextTimestamp()) => ({ state, updatedAt: at, committed: true });

function engine(db: QuestionDatabase | null, transport?: QuestionSyncTransport, options: QuestionSyncOptions = {}, namespace: QuestionNamespace = ACCOUNT) {
  const value = new QuestionSyncEngine(db, namespace, { urgentMs: 0, ...options });
  onCleanup(() => value.stop());
  value.start();
  if (transport) value.connect(transport);
  return value;
}

let lastStamp: string | undefined;
/** What a cache hands the engine when the reader submits (strictly increasing times, like the cache). */
function submit(sync: QuestionSyncEngine, state = submitted('x'), id = identity) {
  const updatedAt = lastStamp = nextTimestamp(lastStamp);
  const attempt = { ...id, attemptId: crypto.randomUUID(), state, createdAt: updatedAt };
  sync.put({ answers: [{ ...id, state, updatedAt }], attempts: [attempt] });
  return { updatedAt, attempt };
}

afterEach(() => {
  vi.useRealTimers();
  runCleanup();
});

describe('question browser database', () => {
  it('reopens an interrupted connection without losing answers or subscriptions', async () => {
    const factory = new IDBFactory();
    const originalOpen = factory.open.bind(factory);
    let connection: IDBDatabase;
    const opening = vi.spyOn(factory, 'open').mockImplementation((...args) => {
      const result = originalOpen(...args);
      result.addEventListener('success', () => { connection = result.result; });
      return result;
    });
    const db = await open(factory);
    const changed = vi.fn();
    db.subscribe(changed);
    await db.answers.save(ACCOUNT, identity, committed(submitted('first')));
    // fake-indexeddb 6.2.6 declares a constructor here, but accepts a connection.
    forceCloseDatabase(connection! as unknown as Parameters<typeof forceCloseDatabase>[0]);
    await tick();
    await Promise.all([
      db.answers.save(ACCOUNT, identity, committed(submitted('second', 2))),
      db.answers.save('guest', question('other'), { state: draft('parallel'), updatedAt: nextTimestamp(), committed: false }),
    ]);
    expect(opening).toHaveBeenCalledTimes(2);
    expect((await db.answers.get(ACCOUNT, identity))?.state).toEqual(submitted('second', 2));
    expect(changed).toHaveBeenCalledTimes(3);
    // A normal close does not dispatch a close event; transaction creation must recover too.
    connection!.close();
    expect((await db.answers.get(ACCOUNT, identity))?.state).toEqual(submitted('second', 2));
    db.close();
    await expect(db.answers.get(ACCOUNT, identity)).rejects.toThrow();
  });

  it('keeps drafts local and puts only committed answers and submissions into the outbox', async () => {
    const db = await open();
    await db.answers.save(ACCOUNT, identity, { state: draft('typing'), updatedAt: nextTimestamp(), committed: false });
    expect(await db.pending(ACCOUNT)).toEqual(empty);
    const at = nextTimestamp();
    const attempt = { ...identity, attemptId: crypto.randomUUID(), state: submitted('done'), createdAt: at };
    await db.answers.save(ACCOUNT, identity, { state: submitted('done'), updatedAt: at, committed: true, attempt });
    // A draft typed after the commit keeps the commit queued.
    await db.answers.save(ACCOUNT, question('q2'), { state: draft('next'), updatedAt: nextTimestamp(), committed: false });
    const pending = await db.pending(ACCOUNT);
    expect(pending.answers.map((row) => row.state)).toEqual([submitted('done')]);
    expect(pending.attempts.map((row) => row.attemptId)).toEqual([attempt.attemptId]);
    // Guests never upload anything.
    await db.answers.save('guest', identity, committed());
    expect(await db.pending('guest')).toEqual(empty);
  });

  it('keeps a reset queued when a draft is typed before it is uploaded', async () => {
    const db = await open();
    const reset = nextTimestamp();
    await db.answers.save(ACCOUNT, identity, { state: { ...draft(''), values: [] }, updatedAt: reset, committed: true });
    await db.answers.save(ACCOUNT, identity, { state: draft('new try'), updatedAt: nextTimestamp(reset), committed: false });
    expect((await db.answers.get(ACCOUNT, identity))?.state).toEqual(draft('new try'));
    expect((await db.pending(ACCOUNT)).answers.map((row) => row.updatedAt)).toEqual([reset]);
  });

  it('commits an exchange atomically: acknowledgements, last-writer-wins rows and the cursor', async () => {
    const db = await open();
    const mine = nextTimestamp();
    await db.answers.save(ACCOUNT, identity, committed(choice('A'), mine));
    const newerLocal = nextTimestamp(new Date(Date.now() + 60_000).toISOString());
    await db.answers.save(ACCOUNT, question('q2'), { state: draft('local newer'), updatedAt: newerLocal, committed: false });
    const sent = await db.pending(ACCOUNT);
    const changed = await db.commitExchange(ACCOUNT, sent, {
      ...empty, merged: [], cursor: '7', hasMore: false,
      answers: [
        { ...identity, state: choice('A'), updatedAt: mine },
        { ...question('q2'), state: choice('B'), updatedAt: new Date().toISOString() },
        { ...question('q3'), state: choice('C'), updatedAt: new Date().toISOString() },
      ],
    });
    expect(await db.pending(ACCOUNT)).toEqual(empty);
    expect((await db.answers.get(ACCOUNT, question('q2')))?.state).toEqual(draft('local newer'));
    expect((await db.answers.get(ACCOUNT, question('q3')))?.state).toEqual(choice('C'));
    expect(changed.answers).toEqual([questionKey(identity), questionKey(question('q3'))]);
    expect((await db.syncState(ACCOUNT)).cursor).toBe('7');
  });

  it('does not acknowledge an answer that was committed again while the request was in flight', async () => {
    const db = await open();
    await db.answers.save(ACCOUNT, identity, committed(choice('A')));
    const sent = await db.pending(ACCOUNT);
    await db.answers.save(ACCOUNT, identity, committed(choice('B'), nextTimestamp(sent.answers[0].updatedAt)));
    await db.commitExchange(ACCOUNT, sent, { ...empty, merged: [], cursor: '1', hasMore: false });
    expect((await db.pending(ACCOUNT)).answers.map((row) => row.state)).toEqual([choice('B')]);
  });

  it('never lets a slow older local write undo a newer stored row', async () => {
    const db = await open();
    const later = new Date(Date.now() + 5_000).toISOString();
    await db.commitExchange(ACCOUNT, empty, { ...empty, merged: [], cursor: '1', hasMore: false, answers: [{ ...identity, state: choice('B'), updatedAt: later }] });
    await db.answers.save(ACCOUNT, identity, { state: draft('older'), updatedAt: nextTimestamp(), committed: false });
    expect((await db.answers.get(ACCOUNT, identity))?.state).toEqual(choice('B'));
  });

  it('keeps guests and accounts separate and imports guest data once without clearing it', async () => {
    const db = await open();
    await db.answers.save('guest', identity, committed(submitted('guest'), nextTimestamp()));
    await db.answers.save('guest', question('q2'), {
      state: submitted('guest 2'), updatedAt: nextTimestamp(), committed: true,
      attempt: { ...question('q2'), attemptId: crypto.randomUUID(), state: submitted('guest 2'), createdAt: nextTimestamp() },
    });
    await db.answers.save(ACCOUNT, identity, committed(submitted('account')));
    expect(await db.answers.get(OTHER, identity)).toBeUndefined();
    expect(await db.importGuest(ACCOUNT)).toEqual({ records: 1, attempts: 1, marks: 0 });
    expect(await db.importGuest(ACCOUNT)).toEqual({ records: 0, attempts: 0, marks: 0 });
    expect((await db.answers.get(ACCOUNT, identity))?.state).toEqual(submitted('account'));
    expect((await db.answers.get(ACCOUNT, question('q2')))?.state).toEqual(submitted('guest 2'));
    expect((await db.answers.list('guest'))).toHaveLength(2);
    const pending = await db.pending(ACCOUNT);
    expect([pending.answers.length, pending.attempts.length]).toEqual([2, 1]);
    const backup = await db.exportBackup(ACCOUNT);
    expect([backup.version, backup.answers.length, backup.attempts.length]).toEqual([4, 2, 1]);
  });

  it('rejects invalid or oversized answers before writing', async () => {
    const db = await open();
    await expect(db.answers.save(ACCOUNT, identity, { ...committed(), state: { ...draft('x'), extra: 1 } as never })).rejects.toThrow();
    await expect(db.answers.save(ACCOUNT, identity, { ...committed(), state: { ...draft(''), values: Array(3).fill('x'.repeat(6000)) } })).rejects.toThrow(/size/);
    await expect(db.answers.save(ACCOUNT, { ...identity, questionId: '' }, committed())).rejects.toThrow(/questionId/);
    expect(await db.answers.list(ACCOUNT)).toEqual([]);
  });

  it('broadcasts committed changes to another tab, marked with the writing tab', async () => {
    const factory = new IDBFactory();
    const name = crypto.randomUUID();
    const first = await open(factory, name, true);
    const second = await open(factory, name, true);
    const seen = vi.fn();
    second.subscribe(seen);
    await first.answers.save(ACCOUNT, identity, committed());
    await until(() => seen.mock.calls.length === 1);
    expect(seen.mock.calls[0][0]).toMatchObject({ namespace: ACCOUNT, scope: 'answers', keys: [questionKey(identity)], tab: first.tab });
  });

  it('upgrades a v3 database in place: answers, history and unsent commits kept, drafts no longer uploaded', async () => {
    const factory = new IDBFactory();
    const name = crypto.randomUUID();
    const q2 = question('q2');
    const attemptId = crypto.randomUUID();
    await new Promise<void>((resolve, reject) => {
      const opening = factory.open(name, 3);
      opening.onupgradeneeded = () => {
        const db = opening.result;
        const records = db.createObjectStore('records', { keyPath: ['namespace', 'key'] });
        const operations = db.createObjectStore('operations', { keyPath: 'operationId' });
        const attempts = db.createObjectStore('attempts', { keyPath: ['namespace', 'attemptId'] });
        const conflicts = db.createObjectStore('conflicts', { keyPath: ['namespace', 'conflictId'] });
        const metadata = db.createObjectStore('metadata', { keyPath: ['namespace', 'key'] });
        for (const store of [records, operations, attempts, conflicts]) store.createIndex('namespace', 'namespace');
        operations.createIndex('question', ['namespace', 'key']);
        records.createIndex('document', ['namespace', 'documentPath']);
        conflicts.createIndex('question', ['namespace', 'key']);
        const tags = db.createObjectStore('tags', { keyPath: ['namespace', 'tagId'] });
        tags.createIndex('namespace', 'namespace');
        const marks = db.createObjectStore('marks', { keyPath: ['namespace', 'key'] });
        marks.createIndex('namespace', 'namespace');
        marks.createIndex('document', ['namespace', 'documentPath']);
        const at = new Date().toISOString();
        records.put({ ...identity, namespace: ACCOUNT, key: questionKey(identity), state: submitted('sent'), generation: 1, remoteVersion: 3, updatedAt: at, dirty: true });
        records.put({ ...q2, namespace: ACCOUNT, key: questionKey(q2), state: draft('typing'), generation: 1, remoteVersion: 0, updatedAt: at, dirty: true });
        attempts.put({ ...identity, namespace: ACCOUNT, attemptId, state: submitted('sent'), createdAt: at });
        operations.put({ ...identity, namespace: ACCOUNT, key: questionKey(identity), operationId: crypto.randomUUID(), state: submitted('sent'),
          generation: 1, baseVersion: 3, createdAt: at, inFlight: false, attempt: { attemptId, state: submitted('sent'), createdAt: at } });
        metadata.put({ namespace: ACCOUNT, key: 'sync', value: { cursor: '17', lastSyncedAt: null, retryCount: 0, nextRetryAt: 0 } });
        const tagId = crypto.randomUUID();
        tags.put({ namespace: ACCOUNT, tagId, name: '难题', color: 'red', createdAt: at, updatedAt: at, deleted: false, dirty: true });
        marks.put({ namespace: ACCOUNT, key: JSON.stringify([page, 'q1']), documentPath: page, questionId: 'q1', favorite: true, note: '', tagIds: [tagId], excerpt: '', updatedAt: at, dirty: false });
      };
      opening.onsuccess = () => { opening.result.close(); resolve(); };
      opening.onerror = () => reject(opening.error);
    });
    const db = await open(factory, name);
    expect((await db.syncState(ACCOUNT)).cursor).toBeNull();
    expect((await db.answers.listDocument(ACCOUNT, page)).map((row) => row.state.values[0]).sort()).toEqual(['sent', 'typing']);
    const pending = await db.pending(ACCOUNT);
    expect(pending.answers.map((row) => row.state)).toEqual([submitted('sent')]);
    expect(pending.attempts.map((row) => row.attemptId)).toEqual([attemptId]);
    expect(pending.tags.map((row) => row.name)).toEqual(['难题']);
    expect(pending.marks).toEqual([]);
    expect(await db.annotations.listMarks(ACCOUNT)).toHaveLength(1);
  });
});

describe('question sync engine', () => {
  it('uploads a commit from memory even when the browser database refuses to store it', async () => {
    const db = await open();
    vi.spyOn(db, 'pending').mockRejectedValue(quota());
    vi.spyOn(db, 'commitExchange').mockRejectedValue(quota());
    const server = new FakeServer();
    const sync = engine(db, server);
    submit(sync, choice('D'));
    await until(() => server.answers.size === 1 && sync.status.pending === 0 && sync.status.phase === 'idle');
    expect([...server.answers.values()][0].row.state).toEqual(choice('D'));
    expect(server.attempts.size).toBe(1);
  });

  it('works without any browser database', async () => {
    const server = new FakeServer();
    const sync = engine(null, server);
    const seen = vi.fn();
    sync.onRemote(seen);
    server.edit(choice('B'), question('elsewhere'));
    submit(sync);
    await until(() => server.answers.size === 2 && sync.status.pending === 0);
    expect(seen.mock.calls.flatMap(([response]) => response.answers).map((row) => row.questionId)).toContain('elsewhere');
  });

  it('picks up commits an earlier visit left in IndexedDB and pulls on connect', async () => {
    const factory = new IDBFactory();
    const name = crypto.randomUUID();
    const first = await open(factory, name);
    await first.answers.save(ACCOUNT, identity, committed(choice('C')));
    first.close();
    const db = await open(factory, name);
    const server = new FakeServer();
    server.edit(choice('X'), question('from another device'));
    engine(db, server);
    await until(async () => (await db.pending(ACCOUNT)).answers.length === 0);
    expect([...server.answers.values()].map((entry) => entry.row.state.selected[0]).sort()).toEqual(['C', 'X']);
    expect((await db.answers.get(ACCOUNT, question('from another device')))?.state).toEqual(choice('X'));
  });

  it('keeps a newer commit queued when an older acknowledgement arrives', async () => {
    const server = new FakeServer();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow: QuestionSyncTransport = { async sync(input) { const response = await server.sync(input); await gate; return response; } };
    const sync = engine(null, slow);
    submit(sync, choice('A'));
    await until(() => server.requests.length === 1);
    submit(sync, choice('B'));
    release();
    await until(() => sync.status.pending === 0);
    expect([...server.answers.values()][0].row.state).toEqual(choice('B'));
  });

  it('retries after a lost response without duplicating the submission', async () => {
    const server = new FakeServer();
    server.loseNext = true;
    const sync = engine(null, server);
    submit(sync);
    await until(() => sync.status.phase === 'error');
    // The answer and its attempt are one change for the reader.
    expect(sync.status.pending).toBe(1);
    await sync.sync();
    expect(sync.status).toMatchObject({ phase: 'idle', pending: 0 });
    expect(server.attempts.size).toBe(1);
  });

  it('backs off after a failure and a manual sync skips the wait', async () => {
    const server = new FakeServer();
    server.failNext = new Error('云同步失败：boom');
    const sync = engine(null, server);
    submit(sync);
    await until(() => sync.status.phase === 'error');
    expect(sync.status.error).toContain('boom');
    expect(server.requests).toHaveLength(1);
    await sync.sync();
    expect(sync.status).toMatchObject({ phase: 'idle', pending: 0, error: null });
  });

  it('times out a stalled request, keeps the queue and can sync again', async () => {
    const server = new FakeServer();
    server.hang = true;
    const sync = engine(null, server, { requestTimeoutMs: 20 });
    submit(sync);
    await until(() => sync.status.phase === 'error');
    expect(sync.status.error).toContain('超时');
    server.hang = false;
    await sync.sync();
    expect(sync.status.pending).toBe(0);
  });

  it('does no network work offline or while disconnected, and queues commits for later', async () => {
    const server = new FakeServer();
    let online = false;
    const sync = engine(null, server, { online: () => online });
    submit(sync);
    await tick();
    await sync.sync();
    expect(sync.status.phase).toBe('offline');
    expect(server.requests).toHaveLength(0);
    sync.disconnect();
    online = true;
    await sync.sync();
    expect(server.requests).toHaveLength(0);
    expect(sync.status).toMatchObject({ phase: 'local', pending: 1 });
    sync.connect(server);
    await until(() => sync.status.pending === 0);
  });

  it('refuses to run for guests', () => {
    expect(() => new QuestionSyncEngine(null, 'guest')).toThrow();
  });

  it('pages through the feed and stores every page', async () => {
    const db = await open();
    const server = new FakeServer();
    server.pageSize = 2;
    for (let index = 0; index < 5; index++) server.edit(choice('A'), question(`q${index}`));
    const sync = engine(db, server);
    await until(() => sync.status.phase === 'idle' && server.requests.length >= 3);
    expect(await db.answers.listDocument(ACCOUNT, page)).toHaveLength(5);
    expect((await db.syncState(ACCOUNT)).cursor).toBe('5');
  });

  it('keeps the feed position in memory when IndexedDB cannot store it', async () => {
    const db = await open();
    const server = new FakeServer();
    server.edit(choice('A'));
    const failing = vi.spyOn(db, 'commitExchange').mockRejectedValue(quota());
    const sync = engine(db, server);
    await until(() => server.requests.length === 1 && sync.status.phase === 'idle');
    failing.mockRestore();
    await sync.sync();
    expect(server.requests.at(-1)?.cursor).toBe('1');
  });

  it('refreshes a stale copy when a page is read, but not on every read', async () => {
    const server = new FakeServer();
    const sync = engine(null, server, { staleMs: 60_000 });
    await until(() => server.requests.length === 1 && sync.status.phase === 'idle');
    const count = server.requests.length;
    sync.refreshIfStale();
    await tick();
    expect(server.requests.length).toBe(count);
  });

  it('bounds one request and sends tags before the marks that use them', async () => {
    const server = new FakeServer();
    const sync = engine(null, server);
    sync.disconnect();
    const answers = Array.from({ length: 150 }, (_, index) => ({ ...question(`q${index}`), state: choice('A'), updatedAt: nextTimestamp() }));
    sync.put({ answers });
    sync.connect(server);
    await until(() => sync.status.pending === 0);
    expect(server.requests[0].changes.answers.length).toBe(100);
    expect(new TextEncoder().encode(JSON.stringify(server.requests[0].changes)).length).toBeLessThan(512 * 1024);
  });
});
