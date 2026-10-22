import { IDBFactory, IDBObjectStore, forceCloseDatabase } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  QuestionDatabase, QuestionSyncEngine, namespaceForUser, questionKey,
  type AnswerState, type QuestionIdentity, type QuestionNamespace, type RemoteAttempt,
  type RemoteQuestionRecord, type SyncOperation, type SyncReceipt, type SyncRequest,
  type SyncResponse, type QuestionSyncTransport,
} from '../lib/question-store';

const ACCOUNT = namespaceForUser('11111111-1111-4111-8111-111111111111');
const OTHER = namespaceForUser('22222222-2222-4222-8222-222222222222');
const identity: QuestionIdentity = { documentPath: '/docs/math', questionId: 'q1', questionRevision: 'r1' };
const draft = (text: string): AnswerState => ({ selected: [], values: [text], submitted: false, attempt: 0 });
const submitted = (text: string, attempt = 1): AnswerState => ({ ...draft(text), submitted: true, attempt });
const databases: QuestionDatabase[] = [];
const engines: QuestionSyncEngine[] = [];

async function open(factory = new IDBFactory(), name = crypto.randomUUID(), broadcast = false) {
  const db = await QuestionDatabase.open({ name, indexedDB: factory, broadcast });
  databases.push(db);
  return db;
}

function engine(db: QuestionDatabase, transport?: QuestionSyncTransport, namespace: QuestionNamespace = ACCOUNT) {
  const value = new QuestionSyncEngine(db, namespace, transport);
  engines.push(value);
  return value;
}

/** Minimal CAS/event-stream model. This is deliberately independent of IndexedDB implementation. */
class Server implements QuestionSyncTransport {
  records = new Map<string, RemoteQuestionRecord>();
  attempts = new Map<string, RemoteAttempt>();
  receipts = new Map<string, SyncReceipt>();
  events: ({ record: RemoteQuestionRecord } | { attempt: RemoteAttempt })[] = [];
  requests: SyncRequest[] = [];
  loseNextResponse = false;
  pageSize = 100;

  async sync(input: SyncRequest): Promise<SyncResponse> {
    this.requests.push(structuredClone(input));
    const receipts: SyncReceipt[] = [];
    for (const operation of input.operations) {
      const cached = this.receipts.get(operation.operationId);
      if (cached) { receipts.push(cached); continue; }
      const key = questionKey(operation);
      if (operation.attempt && !this.attempts.has(operation.attempt.attemptId)) {
        const attempt = { ...identityPart(operation), ...operation.attempt };
        this.attempts.set(attempt.attemptId, attempt);
        this.events.push({ attempt });
      }
      const current = this.records.get(key);
      let receipt: SyncReceipt;
      if ((current?.version ?? 0) !== operation.baseVersion && current) {
        receipt = { operationId: operation.operationId, status: 'conflict', record: current };
      } else {
        const record = { ...identityPart(operation), state: operation.state, version: (current?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
        this.records.set(key, record);
        this.events.push({ record });
        receipt = { operationId: operation.operationId, status: 'applied', record };
      }
      this.receipts.set(operation.operationId, receipt);
      receipts.push(receipt);
    }
    const offset = Number(input.cursor ?? 0);
    const page = this.events.slice(offset, offset + this.pageSize);
    const result = { receipts, changes: page.flatMap((value) => 'record' in value ? [value.record] : []), attempts: page.flatMap((value) => 'attempt' in value ? [value.attempt] : []), cursor: String(offset + page.length), hasMore: offset + page.length < this.events.length };
    if (this.loseNextResponse) { this.loseNextResponse = false; throw new Error('Connection lost after server commit'); }
    return structuredClone(result);
  }

  edit(state: AnswerState, question = identity): RemoteQuestionRecord {
    const key = questionKey(question);
    const record = { ...question, state, version: (this.records.get(key)?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
    this.records.set(key, record);
    this.events.push({ record });
    return record;
  }
}

function identityPart(value: QuestionIdentity): QuestionIdentity {
  return { documentPath: value.documentPath, questionId: value.questionId, questionRevision: value.questionRevision };
}

afterEach(() => {
  for (const value of engines.splice(0)) value.stop();
  for (const value of databases.splice(0)) value.close();
});

describe('question browser database', () => {
  it('reopens an interrupted connection without losing answers, attempts or subscriptions', async () => {
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
    await db.save(ACCOUNT, identity, submitted('first'), { submission: true });
    // fake-indexeddb 6.2.6 declares a constructor here, but accepts a connection.
    forceCloseDatabase(connection! as unknown as Parameters<typeof forceCloseDatabase>[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.all([
      db.save(ACCOUNT, identity, submitted('second', 2), { submission: true }),
      db.save('guest', { ...identity, questionId: 'other' }, draft('parallel')),
    ]);
    expect(opening).toHaveBeenCalledTimes(2);
    expect((await db.get(ACCOUNT, identity))?.state).toEqual(submitted('second', 2));
    expect(await db.listAttempts(ACCOUNT)).toHaveLength(2);
    expect((await db.stats(ACCOUNT)).pending).toBe(2);
    expect(changed).toHaveBeenCalledTimes(3);
    // A normal close does not dispatch a close event; transaction creation must recover too.
    connection!.close();
    expect((await db.get(ACCOUNT, identity))?.state).toEqual(submitted('second', 2));
    expect(opening).toHaveBeenCalledTimes(3);
    db.close();
    await expect(db.get(ACCOUNT, identity)).rejects.toThrow();
    expect(opening).toHaveBeenCalledTimes(3);
  });

  it('persists offline drafts, submitted attempts and reset tombstones across reloads', async () => {
    const factory = new IDBFactory();
    const name = crypto.randomUUID();
    const db = await open(factory, name);
    await db.save(ACCOUNT, identity, draft('first'));
    await db.save(ACCOUNT, identity, submitted('answer'), { submission: true });
    await db.save(ACCOUNT, identity, { ...draft(''), attempt: 1 });
    db.close();
    const reopened = await open(factory, name);
    expect((await reopened.get(ACCOUNT, identity))?.state).toEqual({ ...draft(''), attempt: 1 });
    expect((await reopened.listAttempts(ACCOUNT))[0].state).toEqual(submitted('answer'));
    expect((await reopened.stats(ACCOUNT)).pending).toBe(2);
    const server = new Server();
    await engine(reopened, server).sync();
    expect(server.records.get(questionKey(identity))?.state).toEqual({ ...draft(''), attempt: 1 });
    expect(server.attempts.size).toBe(1);
    expect((await reopened.stats(ACCOUNT)).pending).toBe(0);
  });

  it('compacts unsent keystrokes without deleting submitted history', async () => {
    // Submissions can share a millisecond; UUID ordering must not affect preservation.
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-10-20T00:00:00.000Z');
    const db = await open();
    for (const text of ['a', 'ab', 'abc']) await db.save(ACCOUNT, identity, draft(text));
    expect((await db.stats(ACCOUNT)).pending).toBe(1);
    await db.save(ACCOUNT, identity, submitted('abc'), { submission: true });
    await db.save(ACCOUNT, identity, draft('new'));
    await db.save(ACCOUNT, identity, submitted('new', 2), { submission: true });
    expect((await db.stats(ACCOUNT)).pending).toBe(2);
    const attempts = await db.listAttempts(ACCOUNT);
    expect(attempts).toHaveLength(2);
    expect(attempts.map((attempt) => attempt.state)).toEqual(
      expect.arrayContaining([submitted('abc'), submitted('new', 2)]),
    );
  });

  it('rolls back the current answer if the atomic outbox write fails', async () => {
    const db = await open();
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof original>) {
      if (this.name === 'operations') throw new DOMException('Storage full', 'QuotaExceededError');
      return original.apply(this, args);
    };
    try {
      await expect(db.save(ACCOUNT, identity, submitted('answer'), { submission: true })).rejects.toThrow('Storage full');
    } finally { IDBObjectStore.prototype.add = original; }
    expect(await db.get(ACCOUNT, identity)).toBeUndefined();
    expect(await db.listAttempts(ACCOUNT)).toEqual([]);
  });

  it('keeps guests and different accounts separate and imports once without clearing guests', async () => {
    const db = await open();
    await db.save('guest', identity, submitted('guest'), { submission: true });
    await db.save(ACCOUNT, identity, draft('account'));
    await db.save(OTHER, identity, draft('other'));
    expect(await db.importGuest(ACCOUNT)).toEqual({ records: 0, attempts: 1 });
    expect(await db.importGuest(ACCOUNT)).toEqual({ records: 0, attempts: 0 });
    expect((await db.get(ACCOUNT, identity))?.state.values).toEqual(['account']);
    expect((await db.get(OTHER, identity))?.state.values).toEqual(['other']);
    expect((await db.get('guest', identity))?.state.values).toEqual(['guest']);
    expect((await db.listAttempts('guest')).length).toBe(1);
    expect((await db.stats('guest')).pending).toBe(0);
    expect(await db.get(ACCOUNT, { ...identity, questionRevision: 'r2' })).toBeUndefined();
  });

  it('rejects invalid or oversized answers before writing', async () => {
    const db = await open();
    await expect(db.save(ACCOUNT, identity, draft('x'.repeat(8193)))).rejects.toThrow();
    await expect(db.save(ACCOUNT, identity, { ...draft(''), values: Array(2) as string[] })).rejects.toThrow();
    await expect(db.save(ACCOUNT, identity, { ...draft(''), extra: true } as AnswerState)).rejects.toThrow('Unexpected answer state fields');
    expect(await db.list(ACCOUNT)).toEqual([]);
  });

  it('broadcasts committed changes to another tab and shares a single sync lease', async () => {
    const factory = new IDBFactory();
    const name = crypto.randomUUID();
    const first = await open(factory, name, true);
    const second = await open(factory, name, true);
    const notification = new Promise<void>((resolve) => second.subscribe((change) => {
      if (change.namespace === ACCOUNT && change.kind === 'local') resolve();
    }));
    await first.save(ACCOUNT, identity, draft('tab one'));
    await notification;
    expect((await second.get(ACCOUNT, identity))?.state.values).toEqual(['tab one']);
    expect(await first.acquireLease(ACCOUNT, 'first')).toBe(true);
    expect(await second.acquireLease(ACCOUNT, 'second')).toBe(false);
    await first.releaseLease(ACCOUNT, 'first');
    expect(await second.acquireLease(ACCOUNT, 'second')).toBe(true);
  });
});

describe('question synchronization', () => {
  it('lets a manual sync proceed while a tab that died mid-sync still holds the fallback lease', async () => {
    const db = await open();
    const server = new Server();
    await db.save(ACCOUNT, identity, submitted('after crash'), { submission: true });
    // A tab killed during an exchange never released its lease.
    expect(await db.acquireLease(ACCOUNT, 'crashed-tab')).toBe(true);
    const sync = engine(db, server);
    await sync.sync();
    expect(server.requests).toHaveLength(1);
    expect((await db.stats(ACCOUNT)).pending).toBe(0);
    expect(sync.status.phase).toBe('idle');
  });

  it('times out a stalled request, keeps the outbox and can sync again', async () => {
    const db = await open();
    const server = new Server();
    let stall = true;
    const transport: QuestionSyncTransport = { sync: (input) => stall ? new Promise(() => undefined) : server.sync(input) };
    const sync = new QuestionSyncEngine(db, ACCOUNT, transport, { requestTimeoutMs: 50 });
    engines.push(sync);
    await db.save(ACCOUNT, identity, draft('stalled'));
    await sync.sync();
    expect(sync.status.phase).toBe('error');
    expect(sync.status.error).toContain('超时');
    expect((await db.stats(ACCOUNT)).pending).toBe(1);
    stall = false;
    await sync.sync();
    expect(sync.status.phase).toBe('idle');
    expect((await db.stats(ACCOUNT)).pending).toBe(0);
  });

  it('does no cloud work offline and does not sync guest records', async () => {
    const db = await open();
    const server = new Server();
    await db.save(ACCOUNT, identity, draft('offline'));
    const offline = new QuestionSyncEngine(db, ACCOUNT, server, { online: () => false });
    engines.push(offline);
    await offline.sync();
    expect(offline.status.phase).toBe('offline');
    await engine(db, server, 'guest').sync();
    expect(server.requests).toEqual([]);
    expect((await db.stats(ACCOUNT)).pending).toBe(1);
  });

  it('retries the same operation after a lost response without duplicating attempts', async () => {
    const db = await open();
    const server = new Server();
    server.loseNextResponse = true;
    await db.save(ACCOUNT, identity, submitted('one'), { submission: true });
    const sync = engine(db, server);
    await sync.sync();
    expect(sync.status.phase).toBe('error');
    expect((await db.metadata(ACCOUNT)).retryCount).toBe(1);
    expect((await db.stats(ACCOUNT)).pending).toBe(1);
    await sync.sync();
    expect(server.requests[0].operations[0].operationId).toBe(server.requests[1].operations[0].operationId);
    expect(server.attempts.size).toBe(1);
    expect(server.records.get(questionKey(identity))?.version).toBe(1);
    expect((await db.metadata(ACCOUNT)).retryCount).toBe(0);
    expect(sync.status.pending).toBe(0);
  });

  it('retains uncertain operation IDs and retry metadata after closing the browser database', async () => {
    const factory = new IDBFactory();
    const name = crypto.randomUUID();
    const db = await open(factory, name);
    const server = new Server();
    server.loseNextResponse = true;
    await db.save(ACCOUNT, identity, submitted('durable'), { submission: true });
    await engine(db, server).sync();
    const retry = await db.metadata(ACCOUNT);
    expect(retry.nextRetryAt).toBeGreaterThan(Date.now());
    db.close();
    const reopened = await open(factory, name);
    expect((await reopened.metadata(ACCOUNT)).retryCount).toBe(1);
    await engine(reopened, server).sync();
    expect(server.requests[1].operations[0].operationId).toBe(server.requests[0].operations[0].operationId);
    expect(server.attempts.size).toBe(1);
    expect((await reopened.stats(ACCOUNT)).pending).toBe(0);
  });

  it('keeps a newer edit while an older network acknowledgement arrives, then rebases it', async () => {
    const db = await open();
    const server = new Server();
    let release: (() => void) | undefined;
    let arrived: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { arrived = resolve; });
    let first = true;
    const transport: QuestionSyncTransport = { sync: async (input) => {
      const response = await server.sync(input);
      if (first) {
        first = false;
        arrived?.();
        await new Promise<void>((resolve) => { release = resolve; });
      }
      return response;
    } };
    await db.save(ACCOUNT, identity, draft('old'));
    const syncing = engine(db, transport).sync();
    await entered;
    await db.save(ACCOUNT, identity, draft('new'));
    release?.();
    await syncing;
    expect((await db.get(ACCOUNT, identity))?.state.values).toEqual(['new']);
    expect(server.records.get(questionKey(identity))?.state.values).toEqual(['new']);
    expect(server.requests[1].operations[0].baseVersion).toBe(1);
    expect((await db.listConflicts(ACCOUNT)).length).toBe(0);
  });

  it('preserves concurrent local and remote answers until an explicit resolution', async () => {
    const db = await open();
    const server = new Server();
    server.edit(draft('remote'));
    await db.save(ACCOUNT, identity, submitted('local'), { submission: true });
    const sync = engine(db, server);
    await sync.sync();
    const [conflict] = await db.listConflicts(ACCOUNT);
    expect(conflict.localState.values).toEqual(['local']);
    expect(conflict.remote.state.values).toEqual(['remote']);
    expect((await db.get(ACCOUNT, identity))?.state.values).toEqual(['local']);
    expect(server.attempts.size).toBe(1);
    await db.save(ACCOUNT, identity, draft('latest local'));
    expect((await db.listConflicts(ACCOUNT))[0].localState.values).toEqual(['latest local']);
    await sync.sync();
    expect(server.records.get(questionKey(identity))?.state.values).toEqual(['remote']);
    await db.resolveConflict(ACCOUNT, conflict.conflictId, 'local');
    await sync.sync();
    expect(server.records.get(questionKey(identity))?.state.values).toEqual(['latest local']);
    expect(await db.listConflicts(ACCOUNT)).toEqual([]);
    expect((await db.listConflicts(ACCOUNT, true))[0].resolution).toBe('local');
  });

  it('choosing the remote answer still uploads every unsent local submission', async () => {
    const db = await open();
    const server = new Server();
    server.edit(draft('remote'));
    await db.save(ACCOUNT, identity, submitted('first'), { submission: true });
    await db.save(ACCOUNT, identity, submitted('second', 2), { submission: true });
    const sync = engine(db, server);
    await sync.sync();
    const [conflict] = await db.listConflicts(ACCOUNT);
    await db.resolveConflict(ACCOUNT, conflict.conflictId, 'remote');
    await sync.sync();
    expect(server.records.get(questionKey(identity))?.state.values).toEqual(['remote']);
    expect([...server.attempts.values()].map((entry) => entry.state.values[0])).toEqual(['first', 'second']);
    expect((await db.get(ACCOUNT, identity))?.dirty).toBe(false);
  });

  it('processes all cursor pages and treats a duplicate response as a no-op', async () => {
    const db = await open();
    const server = new Server();
    server.pageSize = 1;
    for (const text of ['one', 'two', 'three']) server.edit(draft(text));
    const sync = engine(db, server);
    await sync.sync();
    expect((await db.metadata(ACCOUNT)).cursor).toBe('3');
    expect((await db.get(ACCOUNT, identity))?.state.values).toEqual(['three']);
    await db.save(ACCOUNT, identity, submitted('four'), { submission: true });
    const operations = await db.batch(ACCOUNT);
    const response = await server.sync({ operations, cursor: '3', limit: 100 });
    await db.apply(ACCOUNT, response, operations);
    await db.apply(ACCOUNT, response, operations);
    expect((await db.listAttempts(ACCOUNT)).length).toBe(1);
    expect((await db.stats(ACCOUNT)).pending).toBe(0);
  });

  it('rejects partial write acknowledgements without moving the cursor or losing an outbox item', async () => {
    const db = await open();
    await db.save(ACCOUNT, identity, draft('unsaved cloud'));
    const operations = await db.batch(ACCOUNT);
    await expect(db.apply(ACCOUNT, { receipts: [], changes: [], attempts: [], cursor: '100', hasMore: false }, operations)).rejects.toThrow('missing write receipts');
    expect((await db.metadata(ACCOUNT)).cursor).toBeNull();
    expect((await db.stats(ACCOUNT)).pending).toBe(1);
  });

  it('finishes an in-flight old-account response in its namespace and stops further network work', async () => {
    const db = await open();
    const server = new Server();
    let release: (() => void) | undefined;
    let arrived: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { arrived = resolve; });
    const transport: QuestionSyncTransport = { sync: async (input) => {
      const response = await server.sync(input);
      arrived?.();
      await new Promise<void>((resolve) => { release = resolve; });
      return response;
    } };
    await db.save(ACCOUNT, identity, draft('old account'));
    const sync = engine(db, transport);
    const running = sync.sync();
    await entered;
    sync.stop();
    await db.save(OTHER, identity, draft('new account'));
    await db.save(ACCOUNT, { ...identity, questionId: 'not-yet-sent' }, draft('waiting'));
    release?.();
    await running;
    expect(server.requests.length).toBe(1);
    expect((await db.get(ACCOUNT, identity))?.remoteVersion).toBe(1);
    expect((await db.get(OTHER, identity))?.state.values).toEqual(['new account']);
    expect((await db.get(OTHER, identity))?.remoteVersion).toBe(0);
    expect((await db.stats(ACCOUNT)).pending).toBe(1);
  });

  it('limits a batch to 50 distinct questions and a bounded UTF-8 payload', async () => {
    const db = await open();
    for (let index = 0; index < 55; index++) await db.save(ACCOUNT, { ...identity, questionId: `q${index}` }, draft('x'));
    expect((await db.batch(ACCOUNT)).length).toBe(50);
    const server = new Server();
    await engine(db, server).sync();
    expect(server.records.size).toBe(55);
    expect(server.requests.every((input) => input.operations.length <= 50)).toBe(true);
  });
});
