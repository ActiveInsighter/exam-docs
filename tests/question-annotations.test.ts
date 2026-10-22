import type { PGlite } from '@electric-sql/pglite';
import { IDBFactory } from 'fake-indexeddb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AnnotationError, QuestionAnnotationCache, QuestionDatabase, QuestionSyncEngine, namespaceForUser,
  type AnnotationSyncRequest, type AnnotationSyncResponse, type QuestionSyncTransport, type SyncResponse,
} from '../lib/question-store';
import { createSupabaseTestDatabase } from '../supabase/tests/pglite';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const namespace = namespaceForUser(USER);
const question = { documentPath: '/docs/math', questionId: 'q1' };

describe('question annotations (IndexedDB)', () => {
  const databases: QuestionDatabase[] = [];
  const open = async () => {
    const db = await QuestionDatabase.open({ indexedDB: new IDBFactory(), name: crypto.randomUUID(), broadcast: false });
    databases.push(db);
    return db;
  };
  afterAll(() => { for (const db of databases) db.close(); });

  it('creates tags, binds them to a question and lists marks', async () => {
    const db = await open();
    const hard = await db.annotations.saveTag('guest', { name: ' 难题 ', color: 'red' });
    expect(hard.name).toBe('难题');
    await db.annotations.updateMark('guest', question, { favorite: true, tagIds: [hard.tagId], note: '注意符号', excerpt: '求极限' });
    const [mark] = await db.annotations.listMarks('guest');
    expect(mark).toMatchObject({ favorite: true, tagIds: [hard.tagId], note: '注意符号', excerpt: '求极限' });
    expect(await db.annotations.listDocumentMarks('guest', '/docs/math')).toHaveLength(1);
  });

  it('rejects duplicate names case-insensitively and over-long notes', async () => {
    const db = await open();
    await db.annotations.saveTag('guest', { name: 'Hard', color: 'red' });
    await expect(db.annotations.saveTag('guest', { name: 'hard', color: 'blue' })).rejects.toBeInstanceOf(AnnotationError);
    await expect(db.annotations.updateMark('guest', question, { note: 'x'.repeat(4001) })).rejects.toBeInstanceOf(AnnotationError);
  });

  it('removes a deleted tag from every question; guests drop emptied marks', async () => {
    const db = await open();
    const tag = await db.annotations.saveTag('guest', { name: '二刷', color: 'blue' });
    await db.annotations.updateMark('guest', question, { tagIds: [tag.tagId] });
    await db.annotations.deleteTag('guest', tag.tagId);
    expect(await db.annotations.listTags('guest')).toEqual([]);
    expect(await db.annotations.listMarks('guest')).toEqual([]);
  });

  it('ignores tag ids that do not exist', async () => {
    const db = await open();
    await db.annotations.updateMark('guest', question, { favorite: true, tagIds: [crypto.randomUUID()] });
    expect((await db.annotations.listMarks('guest'))[0].tagIds).toEqual([]);
  });

  it('merges guest marks into an account by tag name', async () => {
    const db = await open();
    const accountTag = await db.annotations.saveTag(namespace, { name: '难题', color: 'red' });
    const guestTag = await db.annotations.saveTag('guest', { name: '难题', color: 'amber' });
    await db.annotations.updateMark(namespace, question, { note: '账号注释' });
    await db.annotations.updateMark('guest', question, { favorite: true, note: '本机注释', tagIds: [guestTag.tagId] });
    expect(await db.annotations.importGuest(namespace)).toBe(1);
    const [mark] = await db.annotations.listMarks(namespace);
    expect(mark).toMatchObject({ favorite: true, note: '账号注释\n\n本机注释', tagIds: [accountTag.tagId] });
    expect(await db.annotations.listTags(namespace)).toHaveLength(1);
    expect(await db.annotations.importGuest(namespace)).toBe(0);
    expect((await db.annotations.listMarks(namespace))[0].note).toBe('账号注释\n\n本机注释');
  });

  it('serves components from memory and keeps answer caches out of annotation changes', async () => {
    const db = await open();
    const cache = new QuestionAnnotationCache(db, 'guest');
    const changes: string[] = [];
    const unsubscribe = cache.subscribeMark(question, () => changes.push('mark'));
    await cache.updateMark(question, { favorite: true });
    expect(cache.readMark(question).mark?.favorite).toBe(true);
    expect(changes.length).toBeGreaterThan(0);
    unsubscribe();
    cache.dispose();
  });
});

describe('question annotations sync with PostgreSQL', () => {
  let postgres: PGlite;
  const browsers: QuestionDatabase[] = [];
  const engines: QuestionSyncEngine[] = [];

  const transport: QuestionSyncTransport = {
    async sync(input) {
      const result = await postgres.query<{ result: SyncResponse }>(
        'select public.exam_sync_question_state($1::jsonb, $2::bigint, $3::integer) as result',
        [JSON.stringify(input.operations), input.cursor ?? '0', 100],
      );
      return result.rows[0].result;
    },
    async syncAnnotations(input: AnnotationSyncRequest) {
      const result = await postgres.query<{ result: AnnotationSyncResponse }>(
        'select public.exam_sync_question_annotations($1::jsonb, $2::jsonb, $3::bigint, $4::integer) as result',
        [JSON.stringify(input.tags), JSON.stringify(input.marks), input.cursor ?? '0', 2],
      );
      return result.rows[0].result;
    },
  };

  async function device() {
    const db = await QuestionDatabase.open({ indexedDB: new IDBFactory(), name: crypto.randomUUID(), broadcast: false });
    browsers.push(db);
    const engine = new QuestionSyncEngine(db, namespace, transport);
    engines.push(engine);
    return { db, engine };
  }

  beforeAll(async () => { postgres = await createSupabaseTestDatabase(); }, 30_000);
  beforeEach(async () => {
    for (const engine of engines.splice(0)) engine.stop();
    for (const db of browsers.splice(0)) db.close();
    await postgres.exec('reset role; truncate auth.users cascade');
    await postgres.query('insert into auth.users(id) values ($1)', [USER]);
    await postgres.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', USER]);
    await postgres.exec('set role authenticated');
  });
  afterAll(async () => {
    for (const engine of engines) engine.stop();
    for (const db of browsers) db.close();
    await postgres?.close();
  });

  it('carries tags, favourites and notes to another device, paging through the feed', async () => {
    const phone = await device();
    const laptop = await device();
    const tag = await phone.db.annotations.saveTag(namespace, { name: '难题', color: 'red' });
    await phone.db.annotations.updateMark(namespace, question, { favorite: true, tagIds: [tag.tagId], note: '换元' });
    await phone.db.annotations.updateMark(namespace, { ...question, questionId: 'q2' }, { note: '第二题' });
    expect((await phone.db.stats(namespace)).pending).toBe(3);

    await phone.engine.sync();
    expect(phone.engine.status.error).toBeNull();
    expect((await phone.db.stats(namespace)).pending).toBe(0);

    await laptop.engine.sync();
    expect(laptop.engine.status.error).toBeNull();
    expect(await laptop.db.annotations.listTags(namespace)).toMatchObject([{ name: '难题', color: 'red' }]);
    const marks = await laptop.db.annotations.listMarks(namespace);
    expect(marks.map((mark) => mark.note).sort()).toEqual(['换元', '第二题']);
    expect(marks.find((mark) => mark.questionId === 'q1')).toMatchObject({ favorite: true, tagIds: [tag.tagId] });
  });

  it('folds the same tag created offline on two devices into one', async () => {
    const phone = await device();
    const laptop = await device();
    const first = await phone.db.annotations.saveTag(namespace, { name: '易错', color: 'red' });
    const second = await laptop.db.annotations.saveTag(namespace, { name: '易错', color: 'blue' });
    await laptop.db.annotations.updateMark(namespace, question, { tagIds: [second.tagId] });
    await phone.engine.sync();
    await laptop.engine.sync();
    expect(laptop.engine.status.error).toBeNull();
    expect((await laptop.db.annotations.listTags(namespace)).map((tag) => tag.tagId)).toEqual([first.tagId]);
    expect((await laptop.db.annotations.listMarks(namespace))[0].tagIds).toEqual([first.tagId]);
  });

  it('propagates a tag deletion to questions on the other device', async () => {
    const phone = await device();
    const laptop = await device();
    const tag = await phone.db.annotations.saveTag(namespace, { name: '二刷', color: 'green' });
    await phone.db.annotations.updateMark(namespace, question, { favorite: true, tagIds: [tag.tagId] });
    await phone.engine.sync();
    await laptop.engine.sync();
    await laptop.db.annotations.deleteTag(namespace, tag.tagId);
    await laptop.engine.sync();
    await phone.engine.sync();
    expect(await phone.db.annotations.listTags(namespace)).toEqual([]);
    expect((await phone.db.annotations.listMarks(namespace))[0].tagIds).toEqual([]);
  });

  it('keeps answers syncing when the server has no annotation endpoint yet', async () => {
    const db = await QuestionDatabase.open({ indexedDB: new IDBFactory(), name: crypto.randomUUID(), broadcast: false });
    browsers.push(db);
    const engine = new QuestionSyncEngine(db, namespace, { ...transport, syncAnnotations: async () => null });
    engines.push(engine);
    await db.annotations.updateMark(namespace, question, { favorite: true });
    await engine.sync();
    expect(engine.status.error).toBeNull();
    expect((await db.stats(namespace)).pending).toBe(1);
  });
});
