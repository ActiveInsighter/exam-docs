import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSupabaseTestDatabase } from './pglite';

// Real PostgreSQL execution of the annotation migration (see ./pglite.ts).
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Tag = { tagId: string; name: string; color: string; deleted: boolean; createdAt: string; updatedAt: string };
type Mark = { documentPath: string; questionId: string; favorite: boolean; note: string; excerpt: string; tagIds: string[]; updatedAt: string };
type Response = { tags: Tag[]; marks: Mark[]; merged: { from: string; to: string }[]; cursor: string; hasMore: boolean; reset: boolean };

let clock = Date.parse('2026-10-22T08:00:00Z');
const tick = () => new Date(clock += 1000).toISOString();
const tag = (overrides: Partial<Tag> = {}): Tag => {
  const at = tick();
  return { tagId: randomUUID(), name: '难题', color: 'red', deleted: false, createdAt: at, updatedAt: at, ...overrides };
};
const mark = (overrides: Partial<Mark> = {}): Mark => ({
  documentPath: '/docs/math', questionId: 'q1', favorite: true, note: '', excerpt: '求极限', tagIds: [], updatedAt: tick(), ...overrides,
});

describe('question annotation sync', () => {
  let db: PGlite;

  async function actor(user: string | null, role: 'authenticated' | 'anon' = 'authenticated') {
    await db.exec('reset role');
    await db.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', user ?? '']);
    await db.exec(`set role ${role}`);
  }

  async function sync(tags: Tag[] = [], marks: Mark[] = [], cursor = '0', limit = 100) {
    const result = await db.query<{ result: Response }>(
      'select public.exam_sync_question_annotations($1::jsonb, $2::jsonb, $3::bigint, $4::integer) as result',
      [JSON.stringify(tags), JSON.stringify(marks), cursor, limit],
    );
    return result.rows[0].result;
  }

  beforeAll(async () => { db = await createSupabaseTestDatabase(); }, 30_000);
  beforeEach(async () => {
    await db.exec('reset role; truncate auth.users cascade');
    await db.query('insert into auth.users(id) values ($1), ($2)', [USER_A, USER_B]);
    await actor(USER_A);
  });
  afterAll(async () => { await db?.close(); });

  it('stores tags and tagged marks and returns them through the feed', async () => {
    const hard = tag();
    const first = await sync([hard], [mark({ tagIds: [hard.tagId], note: '注意换元' })]);
    expect(first.tags.map((entry) => entry.name)).toEqual(['难题']);
    expect(first.marks[0]).toMatchObject({ favorite: true, note: '注意换元', tagIds: [hard.tagId] });

    const pulled = await sync([], [], '0');
    expect(pulled.marks).toHaveLength(1);
    expect(pulled.cursor).toBe(first.cursor);
    expect((await sync([], [], first.cursor)).marks).toEqual([]);
  });

  it('keeps the newer write of two devices', async () => {
    const newer = mark({ note: '新的' });
    const older = { ...mark({ note: '旧的' }), updatedAt: new Date(Date.parse(newer.updatedAt) - 5000).toISOString() };
    await sync([], [newer]);
    const response = await sync([], [older]);
    expect(response.marks[0].note).toBe('新的');
  });

  it('folds a same-name tag created on another device into the existing one', async () => {
    const original = tag({ name: 'Hard' });
    await sync([original]);
    const duplicate = tag({ name: 'hard' });
    const response = await sync([duplicate], [mark({ tagIds: [duplicate.tagId] })]);
    expect(response.merged).toEqual([{ from: duplicate.tagId, to: original.tagId }]);
    expect(response.marks[0].tagIds).toEqual([original.tagId]);
  });

  it('removes a deleted tag from every question and announces those questions again', async () => {
    const hard = tag();
    const first = await sync([hard], [mark({ tagIds: [hard.tagId] }), mark({ questionId: 'q2', tagIds: [hard.tagId] })]);
    const deleted = await sync([{ ...hard, deleted: true, updatedAt: tick() }], [], first.cursor);
    expect(deleted.tags[0].deleted).toBe(true);
    expect(deleted.marks.map((entry) => [entry.questionId, entry.tagIds])).toEqual([['q1', []], ['q2', []]]);
  });

  it('drops unknown tag ids instead of failing', async () => {
    const response = await sync([], [mark({ tagIds: [randomUUID()] })]);
    expect(response.marks[0].tagIds).toEqual([]);
  });

  it('paginates the feed across tags and marks', async () => {
    await sync([tag({ name: 'a' }), tag({ name: 'b' })], [mark({ questionId: 'q1' }), mark({ questionId: 'q2' })]);
    const first = await sync([], [], '0', 3);
    expect(first.hasMore).toBe(true);
    expect(first.tags.length + first.marks.length).toBe(3);
    const second = await sync([], [], first.cursor, 3);
    expect(second.hasMore).toBe(false);
    expect(second.tags.length + second.marks.length).toBe(1);
  });

  it('isolates accounts and refuses anonymous callers and direct table access', async () => {
    await sync([tag()], [mark()]);
    await actor(USER_B);
    const other = await sync();
    expect(other.tags).toEqual([]);
    expect(other.marks).toEqual([]);
    await expect(db.query('select * from exam_private.question_marks')).rejects.toThrow(/permission denied/);
    await expect(db.query('insert into exam_private.question_tags values ($1, $2, $3, $4, false, now(), now(), 1)',
      [USER_B, randomUUID(), 'x', 'red'])).rejects.toThrow(/permission denied/);
    await actor(null, 'anon');
    await expect(sync()).rejects.toThrow(/permission denied/);
    await actor(null);
    await expect(sync()).rejects.toThrow(/Authentication required/);
  });

  it('validates sizes, colours and names', async () => {
    await expect(sync([tag({ color: 'gold' })])).rejects.toThrow();
    await expect(sync([tag({ name: ' padded ' })])).rejects.toThrow();
    await expect(sync([tag({ name: 'x'.repeat(25) })])).rejects.toThrow();
    await expect(sync([], [mark({ note: 'x'.repeat(4001) })])).rejects.toThrow();
    await expect(sync([], [{ ...mark(), extra: true } as Mark])).rejects.toThrow(/Invalid question mark/);
    await expect(sync([], [], '0', 0)).rejects.toThrow(/Invalid cursor/);
  });

  it('caps future device clocks so they cannot win every later edit', async () => {
    const future = mark({ note: '未来', updatedAt: '2099-01-01T00:00:00Z' });
    const response = await sync([], [future]);
    expect(Date.parse(response.marks[0].updatedAt)).toBeLessThan(Date.parse('2099-01-01T00:00:00Z'));
  });

  it('restarts the feed when the cursor is ahead and removes data with the account', async () => {
    await sync([tag()], [mark()]);
    const reset = await sync([], [], '999');
    expect(reset.reset).toBe(true);
    expect(reset.marks).toHaveLength(1);
    await db.exec('reset role');
    await db.query('delete from auth.users where id = $1', [USER_A]);
    const left = await db.query<{ count: number }>('select count(*)::integer as count from exam_private.question_marks');
    expect(left.rows[0].count).toBe(0);
  });
});
