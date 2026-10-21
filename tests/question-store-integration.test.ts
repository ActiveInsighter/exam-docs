import type { PGlite } from '@electric-sql/pglite';
import { IDBFactory } from 'fake-indexeddb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  QuestionDatabase, QuestionSyncEngine, namespaceForUser, type AnswerState,
  type QuestionIdentity, type QuestionSyncTransport, type SyncRequest, type SyncResponse,
} from '../lib/question-store';
import { createSupabaseTestDatabase } from '../supabase/tests/pglite';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const namespace = namespaceForUser(USER);
const question: QuestionIdentity = { documentPath: '/docs/math', questionId: 'same-question', questionRevision: 'content-v1' };
const answer = (value: string, attempt = 1): AnswerState => ({ selected: [value], values: [], submitted: true, attempt });

describe('IndexedDB and PostgreSQL synchronization integration', () => {
  let postgres: PGlite;
  const browsers: QuestionDatabase[] = [];
  const engines: QuestionSyncEngine[] = [];

  async function browser(factory = new IDBFactory(), name = crypto.randomUUID()) {
    const value = await QuestionDatabase.open({ indexedDB: factory, name, broadcast: false });
    browsers.push(value);
    return value;
  }

  const transport: QuestionSyncTransport = {
    async sync(input: SyncRequest) {
      const result = await postgres.query<{ result: SyncResponse }>(
        'select public.exam_sync_question_state($1::jsonb, $2::bigint, $3::integer) as result',
        [JSON.stringify(input.operations), input.cursor ?? '0', 1],
      );
      return result.rows[0].result;
    },
  };

  function synchronize(db: QuestionDatabase, remote = transport) {
    const value = new QuestionSyncEngine(db, namespace, remote);
    engines.push(value);
    return value;
  }

  beforeAll(async () => {
    postgres = await createSupabaseTestDatabase();
  }, 30_000);

  beforeEach(async () => {
    for (const value of engines.splice(0)) value.stop();
    for (const value of browsers.splice(0)) value.close();
    await postgres.exec('reset role; truncate auth.users cascade');
    await postgres.query('insert into auth.users(id) values ($1)', [USER]);
    await postgres.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', USER]);
    await postgres.exec('set role authenticated');
  });

  afterAll(async () => {
    for (const value of engines) value.stop();
    for (const value of browsers) value.close();
    await postgres?.close();
  });

  it('replicates offline submissions and preserves all attempts when choosing the other device answer', async () => {
    const first = await browser();
    const second = await browser();
    await first.save(namespace, question, answer('A'), { submission: true });
    await second.save(namespace, question, answer('B'), { submission: true });
    await second.save(namespace, question, answer('C', 2), { submission: true });
    const firstSync = synchronize(first);
    const secondSync = synchronize(second);
    await firstSync.sync();
    expect(firstSync.status.error).toBeNull();
    await secondSync.sync();
    expect(secondSync.status.error).toBeNull();
    const [conflict] = await second.listConflicts(namespace);
    expect(conflict.remote.state.selected).toEqual(['A']);
    expect((await second.get(namespace, question))?.state.selected).toEqual(['C']);
    expect((await second.stats(namespace)).pending).toBe(1);
    await second.resolveConflict(namespace, conflict.conflictId, 'remote');
    await secondSync.sync();
    expect(secondSync.status.error).toBeNull();
    expect((await second.get(namespace, question))?.state.selected).toEqual(['A']);
    expect((await second.stats(namespace)).pending).toBe(0);
    expect(await second.listConflicts(namespace)).toEqual([]);
    await firstSync.sync();
    expect((await first.get(namespace, question))?.state.selected).toEqual(['A']);
    for (const device of [first, second]) {
      expect((await device.listAttempts(namespace)).map((entry) => entry.state.selected[0]).sort()).toEqual(['A', 'B', 'C']);
      expect(BigInt((await device.metadata(namespace)).cursor!)).toBeGreaterThan(3n);
    }
  });

  it('replays uncertain IDs after browser reload and consumes old feed snapshots without reverting newer acknowledgements', async () => {
    const factory = new IDBFactory();
    const name = crypto.randomUUID();
    const first = await browser(factory, name);
    await first.save(namespace, question, answer('A'), { submission: true });
    let lose = true;
    const operationIds: string[] = [];
    const flaky: QuestionSyncTransport = { sync: async (input) => {
      operationIds.push(...input.operations.map((operation) => operation.operationId));
      const response = await transport.sync(input);
      if (lose) { lose = false; throw new Error('Response lost after SQL committed'); }
      return response;
    } };
    const oldEngine = synchronize(first, flaky);
    await oldEngine.sync();
    expect(oldEngine.status.phase).toBe('error');
    oldEngine.stop();
    first.close();
    const reopened = await browser(factory, name);
    // A new offline submission cannot replace the uncertain first operation.
    await reopened.save(namespace, question, answer('B', 2), { submission: true });
    const resumed = synchronize(reopened, flaky);
    await resumed.sync();
    expect(resumed.status.error).toBeNull();
    expect(operationIds[0]).toBe(operationIds[1]);
    expect((await reopened.get(namespace, question))?.state.selected).toEqual(['B']);
    expect((await reopened.get(namespace, question))?.remoteVersion).toBe(2);
    expect((await reopened.listAttempts(namespace)).length).toBe(2);
    expect((await reopened.stats(namespace)).pending).toBe(0);
    const otherDevice = await browser();
    await synchronize(otherDevice).sync();
    expect((await otherDevice.get(namespace, question))?.state.selected).toEqual(['B']);
    expect((await otherDevice.listAttempts(namespace)).length).toBe(2);
  });

  it('resolves a missing cloud record against version zero instead of retrying a stale local base forever', async () => {
    const local = await browser();
    // A restored local record can remember a version that is absent on this cloud project.
    await local.apply(namespace, { receipts: [], changes: [{ ...question, state: answer('restored'),
      version: 5, updatedAt: new Date().toISOString() }], attempts: [], cursor: '0', hasMore: false });
    await local.save(namespace, question, answer('keep local', 2), { submission: true });
    const sync = synchronize(local);
    await sync.sync();
    expect(sync.status.error).toBeNull();
    const [conflict] = await local.listConflicts(namespace);
    expect(conflict.remote.version).toBe(0);
    expect(conflict.remote.state.submitted).toBe(false);
    await local.resolveConflict(namespace, conflict.conflictId, 'local');
    await sync.sync();
    expect(sync.status.error).toBeNull();
    expect(await local.listConflicts(namespace)).toEqual([]);
    expect((await local.get(namespace, question))?.remoteVersion).toBe(1);
    const other = await browser();
    await synchronize(other).sync();
    expect((await other.get(namespace, question))?.state.selected).toEqual(['keep local']);
  });
});
