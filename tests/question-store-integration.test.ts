import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  QuestionSession, namespaceForUser, type QuestionDatabase,
  type QuestionIdentity, type QuestionSyncTransport, type SyncResponse,
} from '../lib/question-store';
import { createSupabaseTestDatabase } from '../supabase/tests/pglite';
import { choice, onCleanup, openDatabase, quota, runCleanup, tick, until } from './helpers/question-store';
import { vi } from 'vitest';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const namespace = namespaceForUser(USER);
const question: QuestionIdentity = { documentPath: '/docs/math', questionId: 'same-question', questionRevision: 'content-v1' };
const mark = { documentPath: '/docs/math', questionId: 'same-question' };

/** Two browsers (separate IndexedDB) of one account, synchronised through the real SQL RPC. */
describe('IndexedDB and PostgreSQL synchronization integration', () => {
  let postgres: PGlite;
  let pageSize = 200;

  const transport: QuestionSyncTransport = {
    async sync(input) {
      const result = await postgres.query<{ result: SyncResponse }>(
        'select public.exam_sync($1::jsonb, $2::bigint, $3::integer) as result',
        [JSON.stringify(input.changes), input.cursor ?? '0', Math.min(input.limit, pageSize)],
      );
      return result.rows[0].result;
    },
  };

  async function device() {
    const db = await openDatabase();
    const session = new QuestionSession(db, namespace, { answers: { draftDelayMs: 0 }, sync: { urgentMs: 0 } });
    onCleanup(() => session.dispose());
    session.sync!.connect(transport);
    session.answers.subscribe(question, () => {});
    session.annotations.subscribeMark(mark, () => {});
    session.annotations.subscribeTags(() => {});
    await until(() => session.answers.read(question).ready && session.annotations.readMark(mark).ready && session.annotations.readTags().ready);
    await until(() => session.sync!.status.phase === 'idle');
    return { db, session };
  }

  /** The device stored its own commit (and so handed it to the outbox). */
  const stored = ({ db }: { db: QuestionDatabase }, letter: string) =>
    until(async () => (await db.answers.get(namespace, question))?.state.selected[0] === letter);

  /** Every commit handed over, uploaded and acknowledged locally. */
  const settled = (...devices: { db: QuestionDatabase; session: QuestionSession }[]) => until(async () => {
    for (const { db, session } of devices) {
      const pending = await db.pending(namespace);
      if (session.sync!.status.phase !== 'idle' || session.sync!.status.pending ||
        pending.answers.length || pending.attempts.length || pending.tags.length || pending.marks.length) return false;
    }
    return true;
  }, 20_000); // the first PL/pgSQL call compiles in WASM, slow when the whole suite runs in parallel

  beforeAll(async () => {
    postgres = await createSupabaseTestDatabase();
  }, 30_000);

  beforeEach(async () => {
    runCleanup();
    pageSize = 200;
    await postgres.exec('reset role; truncate auth.users cascade');
    await postgres.query('insert into auth.users(id) values ($1)', [USER]);
    await postgres.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', USER]);
    await postgres.exec('set role authenticated');
  });

  afterAll(async () => {
    runCleanup();
    await postgres?.close();
  });

  it('carries a submission to the other device; drafts stay on the device that typed them', async () => {
    const phone = await device();
    const laptop = await device();
    phone.session.answers.write(question, { selected: ['A'], values: [], submitted: false, attempt: 0 });
    await tick();
    phone.session.answers.write(question, choice('B'), 'submit');
    await stored(phone, 'B');
    await settled(phone);
    await laptop.session.sync!.sync();
    expect(laptop.session.answers.read(question).state).toEqual(choice('B'));
    expect(await laptop.db.answers.listAttempts(namespace)).toHaveLength(1);
    await postgres.exec('reset role');
    const drafts = await postgres.query<{ count: number }>("select count(*)::integer as count from exam_private.question_progress where state @> '{\"submitted\": false}'");
    expect(drafts.rows[0].count).toBe(0);
    await postgres.exec('set role authenticated');
  });

  it('keeps the newer of two offline submissions and every attempt on both devices', async () => {
    const phone = await device();
    const laptop = await device();
    phone.session.sync!.disconnect();
    laptop.session.sync!.disconnect();
    phone.session.answers.write(question, choice('A'), 'submit');
    await stored(phone, 'A');
    laptop.session.answers.write(question, choice('C', 1), 'submit');
    await stored(laptop, 'C');
    // The older submission arrives last and still loses.
    laptop.session.sync!.connect(transport);
    await settled(laptop);
    phone.session.sync!.connect(transport);
    await settled(phone);
    await laptop.session.sync!.sync();
    expect(phone.session.answers.read(question).state).toEqual(choice('C'));
    expect(laptop.session.answers.read(question).state).toEqual(choice('C'));
    expect(await phone.db.answers.listAttempts(namespace)).toHaveLength(2);
    expect(await laptop.db.answers.listAttempts(namespace)).toHaveLength(2);
  });

  it('syncs a reset, so the other device stops showing the old graded answer', async () => {
    const phone = await device();
    const laptop = await device();
    phone.session.answers.write(question, choice('A'), 'submit');
    await stored(phone, 'A');
    await settled(phone);
    await laptop.session.sync!.sync();
    expect(laptop.session.answers.read(question).state.submitted).toBe(true);
    phone.session.answers.write(question, { selected: [], values: [], submitted: false, attempt: 1 }, 'reset');
    await until(async () => (await phone.db.answers.get(namespace, question))?.state.submitted === false);
    await settled(phone);
    await laptop.session.sync!.sync();
    expect(laptop.session.answers.read(question).state).toEqual({ selected: [], values: [], submitted: false, attempt: 1 });
  });

  it('uploads a submission when the local database is full and shows it on the other device', async () => {
    const phone = await device();
    const laptop = await device();
    vi.spyOn(phone.db.answers, 'save').mockRejectedValue(quota());
    vi.spyOn(phone.db, 'commitExchange').mockRejectedValue(quota());
    phone.session.answers.write(question, choice('D'), 'submit');
    await until(() => phone.session.answers.read(question).error !== null);
    expect(phone.session.answers.read(question).state).toEqual(choice('D'));
    await until(() => phone.session.sync!.status.phase === 'idle' && phone.session.sync!.status.pending === 0);
    expect(phone.session.answers.hasUnsaved()).toBe(false);
    await laptop.session.sync!.sync();
    expect(laptop.session.answers.read(question).state).toEqual(choice('D'));
  });

  it('carries tags, favourites and notes, folds same-name tags and propagates deletions', async () => {
    pageSize = 2;
    const phone = await device();
    const laptop = await device();
    const phoneTag = await phone.session.annotations.saveTag({ name: '难题', color: 'red' });
    await phone.session.annotations.updateMark(mark, { favorite: true, note: '注意符号', tagIds: [phoneTag.tagId] });
    for (let index = 0; index < 3; index++) {
      await phone.session.annotations.updateMark({ ...mark, questionId: `extra-${index}` }, { favorite: true });
    }
    // The same name created on the other device before it ever synced.
    laptop.session.sync!.disconnect();
    const laptopTag = await laptop.session.annotations.saveTag({ name: '难题', color: 'blue' });
    await settled(phone);
    laptop.session.sync!.connect(transport);
    await settled(laptop);
    await laptop.session.sync!.sync();
    expect(laptop.session.annotations.readMark(mark).mark).toMatchObject({ favorite: true, note: '注意符号', tagIds: [phoneTag.tagId] });
    expect(laptop.session.annotations.readTags().tags.map((tag) => tag.tagId)).toEqual([phoneTag.tagId]);
    expect(laptopTag.tagId).not.toBe(phoneTag.tagId);
    expect(await laptop.db.annotations.listMarks(namespace)).toHaveLength(4);

    await laptop.session.annotations.deleteTag(phoneTag.tagId);
    await settled(laptop);
    await phone.session.sync!.sync();
    expect(phone.session.annotations.readTags().tags).toEqual([]);
    expect(phone.session.annotations.readMark(mark).mark?.tagIds).toEqual([]);
  });
});
