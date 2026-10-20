import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Real PostgreSQL SQL/PLpgSQL execution without Docker. auth.uid() and auth.users
// are the only Supabase platform stubs; no RPC or RLS implementation is mocked.
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
  cursor: string; hasMore: boolean;
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
      (select count(*)::integer from exam_private.question_events) as events`);
    return result.rows[0];
  }

  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable security invoker
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    const migrations = readdirSync(new URL('../migrations/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort();
    for (const migration of migrations) {
      await db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    }
  }, 30_000);

  beforeEach(async () => {
    await db.exec('reset role; truncate auth.users cascade');
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
    expect(await counts()).toEqual({ progress: 1, attempts: 0, operations: 1, events: 1 });
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
    expect(await counts()).toEqual({ progress: 1, attempts: 1, operations: 3, events: 3 });
  });

  it('rejects reused operation and attempt UUIDs with changed contents', async () => {
    const submission = { attemptId: randomUUID(), state: state('A', true), createdAt: '2026-10-20T00:00:00Z' };
    const write = operation({ attempt: submission });
    await sync([write]);
    await expect(sync([{ ...write, state: state('B') }])).rejects.toMatchObject({ code: '22023' });
    await expect(sync([operation({ baseVersion: 1, attempt: { ...submission, state: state('B', true) } })])).rejects.toMatchObject({ code: '22023' });
    expect(await counts()).toEqual({ progress: 1, attempts: 1, operations: 1, events: 2 });
  });

  it('rejects draft states and zero-count submissions as immutable attempts', async () => {
    const submission = { attemptId: randomUUID(), state: state('A'), createdAt: '2026-10-20T00:00:00Z' };
    await expect(sync([operation({ attempt: submission })])).rejects.toMatchObject({ code: '22023' });
    await expect(sync([operation({ attempt: {
      ...submission, state: { ...state('A', true), attempt: 0 },
    } })])).rejects.toMatchObject({ code: '22023' });
    expect(await counts()).toEqual({ progress: 0, attempts: 0, operations: 0, events: 0 });
  });

  it('paginates every progress snapshot and attempt without skipping later updates', async () => {
    const submission = { attemptId: randomUUID(), state: state('C', true), createdAt: '2026-10-20T00:00:00Z' };
    let page = await sync([
      operation(), operation({ baseVersion: 1, state: state('B') }),
      operation({ baseVersion: 2, state: state('C', true), attempt: submission }),
    ], '0', 1);
    const cursors = [page.cursor];
    const versions = page.changes.map((record) => record.version);
    const attemptIds = page.attempts.map((attempt) => attempt.attemptId);
    expect(page.receipts).toHaveLength(3);
    while (page.hasMore) {
      page = await sync([], page.cursor, 1);
      cursors.push(page.cursor);
      versions.push(...page.changes.map((record) => record.version));
      attemptIds.push(...page.attempts.map((attempt) => attempt.attemptId));
    }
    expect(cursors).toEqual(['1', '2', '3', '4']);
    expect(versions).toEqual([1, 2, 3]);
    expect(attemptIds).toEqual([submission.attemptId]);
    expect(await sync([], page.cursor, 1)).toMatchObject({ cursor: '4', changes: [], attempts: [], hasMore: false });
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
      const events = await db.query<{ user_id: string }>('select user_id from exam_private.question_events');
      expect(events.rows.map((row) => row.user_id)).toEqual([USER_A]);
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
    await expect(sync([], '1')).rejects.toMatchObject({ code: '22023' });
    await expect(sync([], '0', 201)).rejects.toMatchObject({ code: '22023' });
    await expect(sync([operation({ irrelevant: 'x'.repeat(262144) })])).rejects.toMatchObject({ code: '22023' });
    expect(await counts()).toEqual({ progress: 0, attempts: 0, operations: 0, events: 0 });
  });

  it('accepts the maximum supported attempt count consistently with the browser', async () => {
    const result = await sync([operation({ state: { ...state(), attempt: 2147483647 } })]);
    expect(result.receipts[0].record.state.attempt).toBe(2147483647);
  });

  it('rolls back the complete batch when a later operation is invalid', async () => {
    await expect(sync([operation(), operation({ state: {} })])).rejects.toMatchObject({ code: '22023' });
    expect(await counts()).toEqual({ progress: 0, attempts: 0, operations: 0, events: 0 });
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
    expect(await counts()).toMatchObject({ progress: 3, events: 3 });
  });

  it('accepts the maximum 50-operation batch and removes user data on account deletion', async () => {
    const result = await sync(Array.from({ length: 50 }, (_, i) => operation({ questionId: `q${i}` })));
    expect(result.receipts).toHaveLength(50);
    expect(result.cursor).toBe('50');
    await actor(USER_B);
    await sync([operation({ state: state('B') })]);
    await db.exec('reset role');
    await db.query('delete from auth.users where id = $1', [USER_A]);
    expect(await counts()).toEqual({ progress: 1, attempts: 0, operations: 1, events: 1 });
  });

  it('executes the cloud smoke script and rolls back every fixture', async () => {
    await db.exec('reset role');
    await db.exec(readFileSync(new URL('./cloud-smoke.sql', import.meta.url), 'utf8'));
    expect(await counts()).toEqual({ progress: 0, attempts: 0, operations: 0, events: 0 });
  });
});
