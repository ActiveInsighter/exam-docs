import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSupabaseTestDatabase, migrationNames, readMigration } from './pglite';

// Real PostgreSQL SQL/PLpgSQL execution without Docker; only Supabase platform
// objects are stubbed (see ./pglite.ts). No RPC or RLS implementation is mocked.
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const state = (value = 'A', submitted = false) => ({
  selected: [value], values: [], submitted, attempt: submitted ? 1 : 0,
});
const operation = (overrides: Record<string, unknown> = {}) => ({
  operationId: randomUUID(), documentPath: '/docs/math', questionId: 'q1',
  questionRevision: 'sha256-content-v1', baseVersion: 0, state: state(), ...overrides,
});

type RecordState = { selected: string[]; values: string[]; submitted: boolean; attempt: number };
type RemoteRecord = { documentPath: string; questionId: string; questionRevision: string; state: RecordState; version: number; updatedAt: string };
type Response = {
  receipts: { operationId: string; status: 'applied' | 'conflict'; record: RemoteRecord }[];
  changes: RemoteRecord[];
  attempts: { attemptId: string; state: RecordState; createdAt: string; receivedAt: string }[];
  cursor: string; hasMore: boolean; reset: boolean;
};

describe('question sync database contract', () => {
  let db: PGlite;

  async function actor(user: string | null, role: 'authenticated' | 'anon' = 'authenticated') {
    await db.exec('reset role');
    await db.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', user ?? '']);
    await db.exec(`set role ${role}`);
  }

  async function sync(operations: unknown[] = [], cursor = '0', limit = 100) {
    const result = await db.query<{ result: Response }>(
      'select public.exam_sync_question_state($1::jsonb, $2::bigint, $3::integer) as result',
      [JSON.stringify(operations), cursor, limit],
    );
    return result.rows[0].result;
  }

  async function counts() {
    await db.exec('reset role');
    const result = await db.query<Record<string, number>>(`select
      (select count(*)::integer from exam_private.question_progress) as progress,
      (select count(*)::integer from exam_private.question_attempts) as attempts,
      (select count(*)::integer from exam_private.question_operations) as operations,
      (select count(*)::integer from realtime.messages) as notifications`);
    return result.rows[0];
  }

  beforeAll(async () => {
    db = await createSupabaseTestDatabase();
  }, 30_000);

  beforeEach(async () => {
    await db.exec('reset role; truncate auth.users cascade; truncate realtime.messages');
    await db.query('insert into auth.users(id) values ($1), ($2)', [USER_A, USER_B]);
    await actor(USER_A);
  });

  afterAll(async () => { await db?.close(); });

  it('applies once and returns the identical immutable receipt after a lost response', async () => {
    const write = operation();
    const first = await sync([write]);
    expect(first.receipts[0]).toMatchObject({ operationId: write.operationId, status: 'applied', record: { version: 1, state: state() } });
    expect(first).toMatchObject({ cursor: '1', hasMore: false, attempts: [] });
    const retry = await sync([write], first.cursor);
    expect(retry.receipts).toEqual(first.receipts);
    expect(retry).toMatchObject({ cursor: '1', changes: [], attempts: [] });
    expect(await counts()).toEqual({ progress: 1, attempts: 0, operations: 1, notifications: 1 });
  });

  it('preserves an immutable submission even when progress has a CAS conflict', async () => {
    const first = await sync([operation()]);
    const submission = { attemptId: randomUUID(), state: state('B', true), createdAt: '2026-10-20T00:00:00.000Z' };
    const conflicting = operation({ state: state('B'), attempt: submission });
    const second = await sync([conflicting], first.cursor);
    expect(second.receipts[0]).toMatchObject({ status: 'conflict', record: { version: 1, state: state('A') } });
    expect(second).toMatchObject({ changes: [], cursor: '2', hasMore: false });
    expect(second.attempts).toHaveLength(1);
    expect(second.attempts[0]).toMatchObject({ attemptId: submission.attemptId, state: submission.state });
    // A new resolution operation can reuse the same historical attempt, even
    // when its chosen current state differs from that attempt's state.
    const resolution = await sync([operation({ baseVersion: 1, state: state('C'), attempt: submission })], second.cursor);
    expect(resolution.receipts[0]).toMatchObject({ status: 'applied', record: { version: 2, state: state('C') } });
    expect(resolution.attempts).toEqual([]);
    expect(await counts()).toEqual({ progress: 1, attempts: 1, operations: 3, notifications: 3 });
  });

  it('rejects reused operation and attempt UUIDs with changed contents', async () => {
    const submission = { attemptId: randomUUID(), state: state('A', true), createdAt: '2026-10-20T00:00:00Z' };
    const write = operation({ attempt: submission });
    await sync([write]);
    await expect(sync([{ ...write, state: state('B') }])).rejects.toMatchObject({ code: '22023' });
    await expect(sync([operation({ baseVersion: 1, attempt: { ...submission, state: state('B', true) } })])).rejects.toMatchObject({ code: '22023' });
    expect(await counts()).toEqual({ progress: 1, attempts: 1, operations: 1, notifications: 1 });
  });

  it('rejects draft states and zero-count submissions as immutable attempts', async () => {
    const submission = { attemptId: randomUUID(), state: state('A'), createdAt: '2026-10-20T00:00:00Z' };
    await expect(sync([operation({ attempt: submission })])).rejects.toMatchObject({ code: '22023' });
    await expect(sync([operation({ attempt: {
      ...submission, state: { ...state('A', true), attempt: 0 },
    } })])).rejects.toMatchObject({ code: '22023' });
    expect(await counts()).toEqual({ progress: 0, attempts: 0, operations: 0, notifications: 0 });
  });

  it('compacts the feed to the newest state of each question and its attempts', async () => {
    const submission = { attemptId: randomUUID(), state: state('C', true), createdAt: '2026-10-20T00:00:00Z' };
    let page = await sync([
      operation(), operation({ baseVersion: 1, state: state('B') }),
      operation({ baseVersion: 2, state: state('C', true), attempt: submission }),
    ], '0', 1);
    expect(page.receipts.map((receipt) => receipt.record.version)).toEqual([1, 2, 3]);
    const cursors = [page.cursor];
    const versions = page.changes.map((record) => record.version);
    const attemptIds = page.attempts.map((attempt) => attempt.attemptId);
    while (page.hasMore) {
      page = await sync([], page.cursor, 1);
      cursors.push(page.cursor);
      versions.push(...page.changes.map((record) => record.version));
      attemptIds.push(...page.attempts.map((attempt) => attempt.attemptId));
    }
    // Superseded snapshots (versions 1 and 2) are never replayed.
    expect(cursors).toEqual(['3', '4']);
    expect(versions).toEqual([3]);
    expect(attemptIds).toEqual([submission.attemptId]);
    expect(await sync([], page.cursor, 1)).toMatchObject({ cursor: '4', changes: [], attempts: [], hasMore: false });
  });

  it('paginates without skipping a question rewritten while a reader is mid-feed', async () => {
    await sync(['q1', 'q2', 'q3'].map((questionId) => operation({ questionId })));
    let page = await sync([], '0', 1);
    expect(page).toMatchObject({ cursor: '1', hasMore: true });
    expect(page.changes.map((record) => record.questionId)).toEqual(['q1']);
    // Another device rewrites q1 after this reader already consumed it.
    await sync([operation({ questionId: 'q1', baseVersion: 1, state: state('Z') })]);
    const seen = [];
    while (page.hasMore) {
      page = await sync([], page.cursor, 1);
      seen.push(...page.changes.map((record) => `${record.questionId}@${record.version}`));
    }
    expect(seen).toEqual(['q2@1', 'q3@1', 'q1@2']);
    expect(page.cursor).toBe('4');
  });

  it('restarts the feed when the client cursor is ahead of the account', async () => {
    await sync([operation()]);
    const result = await sync([], '42');
    expect(result).toMatchObject({ reset: true, cursor: '1', hasMore: false });
    expect(result.changes).toHaveLength(1);
    expect((await sync([], '1')).reset).toBe(false);
  });

  it('pokes only the owner realtime topic after a committed change', async () => {
    const first = await sync([operation()]);
    await sync([], first.cursor);
    await db.exec('reset role');
    const messages = await db.query<{ topic: string; event: string; payload: { cursor: string }; private: boolean }>(
      'select topic, event, payload, private from realtime.messages');
    expect(messages.rows).toEqual([{ topic: `exam-sync:${USER_A}`, event: 'changed', payload: { cursor: '1' }, private: true }]);
    await actor(USER_B);
    await db.query("select set_config('realtime.topic', $1, false)", [`exam-sync:${USER_A}`]);
    expect((await db.query('select * from realtime.messages')).rows).toEqual([]);
    await actor(USER_A);
    expect((await db.query('select * from realtime.messages')).rows).toHaveLength(1);
    await db.query("select set_config('realtime.topic', '', false)");
  });

  it('prunes receipts older than 30 days and treats an expired retry as a fresh write', async () => {
    const write = operation();
    await sync([write]);
    await db.exec("reset role; update exam_private.question_operations set received_at = now() - interval '31 days'");
    await actor(USER_A);
    const retry = await sync([write]);
    // The expired UUID is new again; its stale base now conflicts with the row it created.
    expect(retry.receipts[0]).toMatchObject({ status: 'conflict', record: { version: 1, state: state() } });
    expect(await counts()).toMatchObject({ progress: 1, operations: 1 });
  });

  it('isolates accounts and rejects direct table reads and writes', async () => {
    await sync([operation()]);
    await actor(USER_B);
    expect(await sync()).toMatchObject({ cursor: '0', changes: [], attempts: [] });
    const own = await sync([operation({ state: state('B') })]);
    expect(own.changes).toHaveLength(1);
    expect(own.changes[0].state).toEqual(state('B'));
    await expect(db.query('select * from exam_private.question_progress')).rejects.toMatchObject({ code: '42501' });
    await expect(db.exec('update exam_private.question_progress set version = 99')).rejects.toMatchObject({ code: '42501' });
    await actor(USER_A);
    expect((await sync()).changes.map((record) => record.state)).toEqual([state('A')]);
  });

  it('enforces owner RLS even if an administrator later grants SELECT', async () => {
    await sync([operation()]);
    await actor(USER_B);
    await sync([operation({ state: state('B') })]);
    await db.exec('reset role; grant select on all tables in schema exam_private to authenticated');
    try {
      await actor(USER_A);
      const rows = await db.query<{ user_id: string }>('select user_id from exam_private.question_progress');
      expect(rows.rows.map((row) => row.user_id)).toEqual([USER_A]);
      const receipts = await db.query<{ user_id: string }>('select user_id from exam_private.question_operations');
      expect(receipts.rows.map((row) => row.user_id)).toEqual([USER_A]);
    } finally {
      await db.exec('reset role; revoke select on all tables in schema exam_private from authenticated');
    }
  });

  it('denies anonymous RPC calls and authenticated requests without a uid', async () => {
    await actor(null, 'anon');
    await expect(sync()).rejects.toMatchObject({ code: '42501' });
    await actor(null);
    await expect(sync()).rejects.toMatchObject({ code: '42501' });
  });

  it('bounds batches, state sizes, identity lengths, and cursor inputs', async () => {
    await expect(sync(Array.from({ length: 51 }, () => operation()))).rejects.toMatchObject({ code: '22023' });
    await expect(sync([operation({ state: { ...state(), values: ['x'.repeat(16384)] } })])).rejects.toMatchObject({ code: '22023' });
    await expect(sync([operation({ state: { ...state(), selected: [42] } })])).rejects.toMatchObject({ code: '22023' });
    await expect(sync([operation({ state: { ...state(), attempt: 2147483648 } })])).rejects.toMatchObject({ code: '22023' });
    await expect(sync([operation({ documentPath: 'x'.repeat(2049) })])).rejects.toMatchObject({ code: '22023' });
    await expect(sync([], '-1')).rejects.toMatchObject({ code: '22023' });
    await expect(sync([], '0', 501)).rejects.toMatchObject({ code: '22023' });
    await expect(sync([operation({ irrelevant: 'x'.repeat(262144) })])).rejects.toMatchObject({ code: '22023' });
    expect(await counts()).toEqual({ progress: 0, attempts: 0, operations: 0, notifications: 0 });
  });

  it('accepts the maximum supported attempt count consistently with the browser', async () => {
    const result = await sync([operation({ state: { ...state(), attempt: 2147483647 } })]);
    expect(result.receipts[0].record.state.attempt).toBe(2147483647);
  });

  it('rolls back the complete batch when a later operation is invalid', async () => {
    await expect(sync([operation(), operation({ state: {} })])).rejects.toMatchObject({ code: '22023' });
    expect(await counts()).toEqual({ progress: 0, attempts: 0, operations: 0, notifications: 0 });
  });

  it('allocates cursors transactionally, so a rollback leaves no sequence gap', async () => {
    const write = operation();
    await db.exec('begin');
    expect((await sync([write])).cursor).toBe('1');
    await db.exec('rollback');
    const retry = await sync([write]);
    expect(retry.cursor).toBe('1');
    expect(retry.receipts[0].record.version).toBe(1);
  });

  it('keeps changed question revisions and long Unicode identities distinct', async () => {
    const result = await sync([
      operation(), operation({ questionRevision: 'sha256-content-v2' }),
      operation({ documentPath: `/${'题'.repeat(2000)}`, questionId: '问'.repeat(200), questionRevision: '版'.repeat(128) }),
    ]);
    expect(result.receipts.map((receipt) => receipt.record.version)).toEqual([1, 1, 1]);
    expect(await counts()).toMatchObject({ progress: 3, notifications: 1 });
  });

  it('accepts the maximum 50-operation batch and removes user data on account deletion', async () => {
    const result = await sync(Array.from({ length: 50 }, (_, i) => operation({ questionId: `q${i}` })));
    expect(result.receipts).toHaveLength(50);
    expect(result.cursor).toBe('50');
    await actor(USER_B);
    await sync([operation({ state: state('B') })]);
    await db.exec('reset role');
    await db.query('delete from auth.users where id = $1', [USER_A]);
    expect(await counts()).toEqual({ progress: 1, attempts: 0, operations: 1, notifications: 2 });
  });

  it('executes the cloud smoke script and rolls back every fixture', async () => {
    await db.exec('reset role');
    await db.exec(readFileSync(new URL('./cloud-smoke.sql', import.meta.url), 'utf8'));
    expect(await counts()).toEqual({ progress: 0, attempts: 0, operations: 0, notifications: 0 });
  });
});

describe('question sync v1 to v2 data migration', () => {
  it('keeps every account answer, attempt and receipt while compacting the feed', async () => {
    const db = await createSupabaseTestDatabase(1);
    try {
      expect(migrationNames().length).toBeGreaterThan(1);
      await db.query('insert into auth.users(id) values ($1), ($2)', [USER_A, USER_B]);
      const run = async (user: string, operations: unknown[]) => {
        await db.exec('reset role');
        await db.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', user]);
        await db.exec('set role authenticated');
        return (await db.query<{ result: Response }>('select public.exam_sync_question_state($1::jsonb, 0, 100) as result',
          [JSON.stringify(operations)])).rows[0].result;
      };
      const submission = { attemptId: randomUUID(), state: state('B', true), createdAt: '2026-10-20T00:00:00Z' };
      const retried = operation();
      await run(USER_A, [retried, operation({ baseVersion: 1, state: state('B', true), attempt: submission }), operation({ questionId: 'q2' })]);
      await run(USER_B, [operation({ state: state('X') })]);
      await db.exec('reset role');
      for (const name of migrationNames().slice(1)) await db.exec(readMigration(name));

      const pulled = await run(USER_A, []);
      expect(pulled).toMatchObject({ cursor: '3', hasMore: false, reset: false });
      expect(pulled.changes.map((record) => `${record.questionId}@${record.version}`).sort()).toEqual(['q1@2', 'q2@1']);
      expect(pulled.attempts.map((attempt) => attempt.attemptId)).toEqual([submission.attemptId]);
      // A v1 receipt still answers a retried UUID instead of writing twice.
      const retry = await run(USER_A, [retried]);
      expect(retry.receipts[0]).toMatchObject({ status: 'applied', record: { version: 2 } });
      expect(retry.cursor).toBe('3');
      expect((await run(USER_B, [])).changes.map((record) => record.state)).toEqual([state('X')]);
      await db.exec('reset role');
      expect((await db.query("select to_regclass('exam_private.question_events') as events")).rows).toEqual([{ events: null }]);
    } finally {
      await db.close();
    }
  }, 30_000);
});
