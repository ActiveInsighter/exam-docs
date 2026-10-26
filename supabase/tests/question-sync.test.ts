import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSupabaseTestDatabase, migrationNames, readMigration } from './pglite';

// Real PostgreSQL SQL/PLpgSQL execution without Docker; only Supabase platform
// objects are stubbed (see ./pglite.ts). No RPC or RLS implementation is mocked.
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type State = { selected: string[]; values: string[]; submitted: boolean; attempt: number };
type Answer = { documentPath: string; questionId: string; questionRevision: string; state: State; updatedAt: string };
type Attempt = { documentPath: string; questionId: string; questionRevision: string; attemptId: string; state: State; createdAt: string };
type Tag = { tagId: string; name: string; color: string; deleted: boolean; createdAt: string; updatedAt: string };
type Mark = { documentPath: string; questionId: string; favorite: boolean; note: string; excerpt: string; tagIds: string[]; updatedAt: string };
type Changes = { answers?: Answer[]; attempts?: Attempt[]; tags?: Tag[]; marks?: Mark[] };
type Response = Required<Changes> & { merged: { from: string; to: string }[]; cursor: string; hasMore: boolean; reset: boolean };

let clock = Date.parse('2026-10-26T08:00:00Z');
const tick = () => new Date(clock += 1000).toISOString();
const state = (value = 'A', submitted = false): State => ({ selected: [value], values: [], submitted, attempt: submitted ? 1 : 0 });
const answer = (overrides: Partial<Answer> = {}): Answer => ({
  documentPath: '/docs/math', questionId: 'q1', questionRevision: 'sha256-content-v1', state: state('A', true), updatedAt: tick(), ...overrides,
});
const attempt = (overrides: Partial<Attempt> = {}): Attempt => ({
  documentPath: '/docs/math', questionId: 'q1', questionRevision: 'sha256-content-v1', attemptId: randomUUID(),
  state: state('A', true), createdAt: tick(), ...overrides,
});
const tag = (overrides: Partial<Tag> = {}): Tag => {
  const at = tick();
  return { tagId: randomUUID(), name: '难题', color: 'red', deleted: false, createdAt: at, updatedAt: at, ...overrides };
};
const mark = (overrides: Partial<Mark> = {}): Mark => ({
  documentPath: '/docs/math', questionId: 'q1', favorite: true, note: '', excerpt: '求极限', tagIds: [], updatedAt: tick(), ...overrides,
});

describe('question sync database contract', () => {
  let db: PGlite;

  async function actor(user: string | null, role: 'authenticated' | 'anon' = 'authenticated') {
    await db.exec('reset role');
    await db.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', user ?? '']);
    await db.exec(`set role ${role}`);
  }

  async function sync(changes: Changes = {}, cursor = '0', limit = 100) {
    const result = await db.query<{ result: Response }>(
      'select public.exam_sync($1::jsonb, $2::bigint, $3::integer) as result',
      [JSON.stringify(changes), cursor, limit],
    );
    return result.rows[0].result;
  }

  async function counts() {
    await db.exec('reset role');
    const result = await db.query<Record<string, number>>(`select
      (select count(*)::integer from exam_private.question_progress) as answers,
      (select count(*)::integer from exam_private.question_attempts) as attempts,
      (select count(*)::integer from exam_private.question_tags) as tags,
      (select count(*)::integer from exam_private.question_marks) as marks`);
    return result.rows[0];
  }

  beforeAll(async () => {
    db = await createSupabaseTestDatabase();
  }, 30_000);

  beforeEach(async () => {
    await db.exec('reset role; truncate auth.users cascade');
    await db.query('insert into auth.users(id) values ($1), ($2)', [USER_A, USER_B]);
    await actor(USER_A);
  });

  afterAll(async () => { await db?.close(); });

  it('keeps the newer answer of two devices and returns the current row for every answer sent', async () => {
    const older = answer({ state: state('A', true) });
    const newer = answer({ state: state('B', true) });
    expect((await sync({ answers: [newer] })).answers.map((row) => row.state)).toEqual([state('B', true)]);
    const late = await sync({ answers: [older] }, '1');
    // The older write loses but the device learns the current answer.
    expect(late.answers).toHaveLength(1);
    expect(late.answers[0].state).toEqual(state('B', true));
    expect(late.cursor).toBe('1');
    // A retried write after a lost response is a no-op.
    const retry = await sync({ answers: [newer] }, '1');
    expect(retry).toMatchObject({ cursor: '1', hasMore: false });
    expect(Date.parse(retry.answers[0].updatedAt)).toBe(Date.parse(newer.updatedAt));
    expect(await counts()).toMatchObject({ answers: 1 });
  });

  it('stores submissions once by id, independently of which answer is current', async () => {
    const first = attempt({ state: state('A', true) });
    await sync({ attempts: [first], answers: [answer({ state: state('A', true) })] });
    const repeated = await sync({ attempts: [first] }, '2');
    expect(repeated).toMatchObject({ cursor: '2', attempts: [] });
    const fromOldDevice = attempt({ state: state('C', true), createdAt: '2026-01-01T00:00:00Z' });
    const pulled = await sync({ attempts: [fromOldDevice], answers: [answer({ state: state('C', true), updatedAt: '2026-01-01T00:00:00Z' })] }, '2');
    expect(pulled.attempts.map((row) => row.attemptId)).toEqual([fromOldDevice.attemptId]);
    expect(pulled.answers[0].state).toEqual(state('A', true));
    expect(await counts()).toMatchObject({ answers: 1, attempts: 2 });
  });

  it('rejects drafts and zero-count submissions as attempts', async () => {
    await expect(sync({ attempts: [attempt({ state: state('A') })] })).rejects.toThrow(/submitted/);
    await expect(sync({ attempts: [attempt({ state: { ...state('A', true), attempt: 0 } })] })).rejects.toThrow(/submitted/);
  });

  it('compacts the feed to the newest row of each answer and pages without skipping rewrites', async () => {
    for (const text of ['one', 'two', 'three']) await sync({ answers: [answer({ state: state(text, true) })] });
    await sync({ answers: [answer({ questionId: 'q2' })], tags: [tag()], marks: [mark()] });
    const all = await sync({}, '0');
    expect(all.answers.map((row) => `${row.questionId}:${row.state.selected[0]}`)).toEqual(['q1:three', 'q2:A']);
    expect([all.tags.length, all.marks.length, all.hasMore]).toEqual([1, 1, false]);

    const first = await sync({}, '0', 2);
    expect(first.hasMore).toBe(true);
    // q1 is rewritten while the reader is mid-feed: it moves to the end and is still read.
    await actor(USER_A);
    await sync({ answers: [answer({ state: state('four', true) })] }, first.cursor);
    let cursor = first.cursor;
    const later: Answer[] = [];
    for (let page = 0; page < 5; page++) {
      const next = await sync({}, cursor, 2);
      later.push(...next.answers);
      cursor = next.cursor;
      if (!next.hasMore) break;
    }
    expect(later.map((row) => row.state.selected[0])).toContain('four');
  });

  it('restarts the feed when the client cursor is ahead of the account', async () => {
    await sync({ answers: [answer()] });
    expect(await sync({}, '999')).toMatchObject({ reset: true, cursor: '1', hasMore: false, answers: [{ questionId: 'q1' }] });
  });

  it('folds a same-name tag created on another device and removes deleted tags from every question', async () => {
    const original = tag({ name: 'Hard' });
    await sync({ tags: [original], marks: [mark({ tagIds: [original.tagId] })] });
    await actor(USER_A);
    const twin = tag({ name: 'hard' });
    const folded = await sync({ tags: [twin], marks: [mark({ questionId: 'q2', tagIds: [twin.tagId] })] }, '2');
    expect(folded.merged).toEqual([{ from: twin.tagId, to: original.tagId }]);
    expect(folded.marks.find((row) => row.questionId === 'q2')?.tagIds).toEqual([original.tagId]);

    const deleted = await sync({ tags: [{ ...original, deleted: true, updatedAt: tick() }] }, folded.cursor);
    expect(deleted.tags[0]).toMatchObject({ tagId: original.tagId, deleted: true });
    expect(deleted.marks.map((row) => row.tagIds)).toEqual([[], []]);
  });

  it('drops unknown tag ids and caps future device clocks', async () => {
    const saved = await sync({ marks: [mark({ tagIds: [randomUUID()], updatedAt: '2099-01-01T00:00:00Z' })] });
    expect(saved.marks[0].tagIds).toEqual([]);
    expect(Date.parse(saved.marks[0].updatedAt)).toBeLessThan(Date.parse('2099-01-01T00:00:00Z'));
    expect((await sync({ marks: [mark({ favorite: false, updatedAt: new Date(Date.now() + 10 * 60_000).toISOString() })] }, saved.cursor)).marks[0].favorite).toBe(false);
  });

  it('isolates accounts and refuses anonymous callers and direct table access', async () => {
    await sync({ answers: [answer()], attempts: [attempt()], tags: [tag()], marks: [mark()] });
    await actor(USER_B);
    expect(await sync()).toMatchObject({ answers: [], attempts: [], tags: [], marks: [], cursor: '0' });
    await expect(db.query('select * from exam_private.question_progress')).rejects.toThrow(/permission denied/);
    await expect(db.query("update exam_private.question_progress set state = '{}'")).rejects.toThrow(/permission denied/);
    await actor(null);
    await expect(sync()).rejects.toThrow(/Authentication required/);
    await actor(null, 'anon');
    await expect(sync()).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
    expect((await db.query("select has_function_privilege('anon', 'public.exam_sync(jsonb,bigint,integer)', 'EXECUTE') as allowed")).rows)
      .toEqual([{ allowed: false }]);
  });

  it('enforces owner RLS even if an administrator later grants SELECT', async () => {
    await sync({ answers: [answer()] });
    await actor(USER_B);
    await sync({ answers: [answer({ questionId: 'other' })] });
    await db.exec('reset role; grant select on exam_private.question_progress to authenticated');
    try {
      await actor(USER_A);
      expect((await db.query('select question_id from exam_private.question_progress')).rows).toEqual([{ question_id: 'q1' }]);
    } finally {
      await db.exec('reset role; revoke select on exam_private.question_progress from authenticated');
    }
  });

  it('bounds request sizes, identities, states and cursors and rolls back a failed batch', async () => {
    await expect(sync({ answers: Array.from({ length: 201 }, (_, index) => answer({ questionId: `q${index}` })) })).rejects.toThrow(/at most 200/);
    await expect(sync({ answers: [answer({ questionId: '' })] })).rejects.toThrow(/identity/);
    await expect(sync({ answers: [{ ...answer(), extra: true } as Answer] })).rejects.toThrow(/Invalid answer/);
    await expect(sync({ answers: [answer({ state: { ...state(), values: ['x'.repeat(8193)] } })] })).rejects.toThrow(/Invalid answer/);
    await expect(sync({}, '-1')).rejects.toThrow(/cursor/);
    await expect(db.query('select public.exam_sync($1::jsonb, 0, 100)', ['{"other": []}'])).rejects.toThrow(/object/);
    await expect(sync({ answers: [answer({ questionId: 'kept?' }), answer({ questionId: '' })] })).rejects.toThrow();
    expect(await counts()).toMatchObject({ answers: 0 });
  });

  it('allocates cursors transactionally and removes everything with the account', async () => {
    await sync({ answers: [answer()] });
    await expect(sync({ answers: [answer({ questionId: 'q2' }), answer({ questionId: '' })] })).rejects.toThrow();
    await actor(USER_A);
    expect((await sync({ answers: [answer({ questionId: 'q3' })] }, '1')).cursor).toBe('2');
    await sync({ attempts: [attempt()], tags: [tag()], marks: [mark()] });
    await db.exec('reset role');
    await db.query('delete from auth.users where id = $1', [USER_A]);
    expect(await counts()).toEqual({ answers: 0, attempts: 0, tags: 0, marks: 0 });
  });

  it('executes the cloud smoke script and rolls back every fixture', async () => {
    await db.exec('reset role');
    await db.exec(readFileSync(new URL('./cloud-smoke.sql', import.meta.url), 'utf8'));
    expect(await counts()).toEqual({ answers: 0, attempts: 0, tags: 0, marks: 0 });
  });
});

describe('question sync v2 to v3 data migration', () => {
  it('keeps every answer, attempt, tag and mark in one renumbered feed and removes the old API', async () => {
    const db = await createSupabaseTestDatabase(3);
    try {
      await db.query('insert into auth.users(id) values ($1)', [USER_A]);
      const as = async (sql: string, params: unknown[]) => {
        await db.exec('reset role');
        await db.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', USER_A]);
        await db.exec('set role authenticated');
        return (await db.query<{ result: Record<string, unknown> }>(sql, params)).rows[0].result;
      };
      const submission = { attemptId: randomUUID(), state: state('B', true), createdAt: '2026-10-20T00:00:00Z' };
      await as('select public.exam_sync_question_state($1::jsonb, 0, 100) as result', [JSON.stringify([
        { operationId: randomUUID(), documentPath: '/docs/math', questionId: 'q1', questionRevision: 'r1', baseVersion: 0, state: state('B', true), attempt: submission },
        { operationId: randomUUID(), documentPath: '/docs/math', questionId: 'q2', questionRevision: 'r1', baseVersion: 0, state: state('C') },
      ])]);
      const hard = tag();
      await as('select public.exam_sync_question_annotations($1::jsonb, $2::jsonb, 0, 100) as result',
        [JSON.stringify([hard]), JSON.stringify([mark({ tagIds: [hard.tagId], note: '易错' })])]);

      await db.exec('reset role');
      for (const name of migrationNames().slice(3)) await db.exec(readMigration(name));

      const pulled = await as("select public.exam_sync('{}'::jsonb, 0, 100) as result", []) as unknown as Response;
      expect(pulled.answers.map((row) => `${row.questionId}:${row.state.selected[0]}`).sort()).toEqual(['q1:B', 'q2:C']);
      expect(pulled.attempts.map((row) => row.attemptId)).toEqual([submission.attemptId]);
      expect(pulled.tags.map((row) => row.tagId)).toEqual([hard.tagId]);
      expect(pulled.marks).toMatchObject([{ note: '易错', tagIds: [hard.tagId] }]);
      expect(pulled).toMatchObject({ cursor: '5', hasMore: false });
      await db.exec('reset role');
      const gone = await db.query(`select to_regclass('exam_private.question_operations') as operations,
        to_regclass('exam_private.question_annotation_heads') as heads,
        to_regprocedure('public.exam_sync_question_state(jsonb,bigint,integer)') as v2`);
      expect(gone.rows).toEqual([{ operations: null, heads: null, v2: null }]);
    } finally {
      await db.close();
    }
  }, 30_000);
});
