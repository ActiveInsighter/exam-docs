import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotationError, QuestionAnnotationCache, type QuestionDatabase, type QuestionNamespace } from '../lib/question-store';
import { ACCOUNT, onCleanup, openDatabase, quota, runCleanup, until } from './helpers/question-store';

const question = { documentPath: '/docs/math', questionId: 'q1' };

function cacheFor(db: QuestionDatabase | null, namespace: QuestionNamespace = 'guest', outbox: { put: () => void; holds: () => boolean } | null = null) {
  const cache = new QuestionAnnotationCache(db, namespace, { outbox });
  onCleanup(() => cache.dispose());
  return cache;
}

async function ready(cache: QuestionAnnotationCache, identity = question) {
  cache.subscribeMark(identity, () => {});
  cache.subscribeTags(() => {});
  await until(() => cache.readMark(identity).ready && cache.readTags().ready);
}

afterEach(runCleanup);

describe('question annotations', () => {
  it('creates tags, binds them to a question and lists marks from storage', async () => {
    const db = await openDatabase();
    const cache = cacheFor(db);
    await ready(cache);
    const hard = await cache.saveTag({ name: ' 难题 ', color: 'red' });
    expect(hard.name).toBe('难题');
    await cache.updateMark(question, { favorite: true, tagIds: [hard.tagId], note: '注意符号', excerpt: '求极限' });
    expect(cache.readMark(question).mark).toMatchObject({ favorite: true, tagIds: [hard.tagId] });
    const [mark] = await db.annotations.listMarks('guest');
    expect(mark).toMatchObject({ favorite: true, tagIds: [hard.tagId], note: '注意符号', excerpt: '求极限' });
    expect(await db.annotations.listTags('guest')).toHaveLength(1);
  });

  it('rejects duplicate names case-insensitively and over-long notes before showing them', async () => {
    const cache = cacheFor(await openDatabase());
    await ready(cache);
    await cache.saveTag({ name: 'Hard', color: 'red' });
    await expect(cache.saveTag({ name: 'hard', color: 'blue' })).rejects.toBeInstanceOf(AnnotationError);
    await expect(cache.updateMark(question, { note: 'x'.repeat(4001) })).rejects.toBeInstanceOf(AnnotationError);
    expect(cache.readMark(question).mark).toBeNull();
  });

  it('removes a deleted tag from every question; guests drop emptied marks', async () => {
    const db = await openDatabase();
    const cache = cacheFor(db);
    await ready(cache);
    const tag = await cache.saveTag({ name: '二刷', color: 'blue' });
    await cache.updateMark(question, { tagIds: [tag.tagId] });
    await cache.deleteTag(tag.tagId);
    expect(cache.readMark(question).mark).toBeNull();
    expect(await db.annotations.listTags('guest')).toEqual([]);
    expect(await db.annotations.listMarks('guest')).toEqual([]);
  });

  it('ignores tag ids that do not exist', async () => {
    const cache = cacheFor(await openDatabase());
    await ready(cache);
    await cache.updateMark(question, { favorite: true, tagIds: [crypto.randomUUID()] });
    expect(cache.readMark(question).mark?.tagIds).toEqual([]);
  });

  it('rolls a guest change back when storage refuses it, but keeps an account change for the cloud', async () => {
    const db = await openDatabase();
    const guest = cacheFor(db);
    await ready(guest);
    vi.spyOn(db.annotations, 'putMark').mockRejectedValue(quota());
    await expect(guest.updateMark(question, { favorite: true })).rejects.toThrow();
    expect(guest.readMark(question).mark).toBeNull();

    const put = vi.fn();
    const account = cacheFor(db, ACCOUNT, { put, holds: () => false });
    await ready(account);
    await account.updateMark(question, { favorite: true });
    expect(account.readMark(question).mark?.favorite).toBe(true);
    expect(put).toHaveBeenCalledWith({ marks: [expect.objectContaining({ favorite: true })] });
  });

  it('merges guest marks into an account by tag name, once', async () => {
    const db = await openDatabase();
    const account = cacheFor(db, ACCOUNT);
    const guest = cacheFor(db);
    await ready(account);
    await ready(guest);
    const accountTag = await account.saveTag({ name: '难题', color: 'red' });
    const guestTag = await guest.saveTag({ name: '难题', color: 'amber' });
    await account.updateMark(question, { note: '账号注释' });
    await guest.updateMark(question, { favorite: true, note: '本机注释', tagIds: [guestTag.tagId] });
    expect((await db.importGuest(ACCOUNT)).marks).toBe(1);
    const [mark] = await db.annotations.listMarks(ACCOUNT);
    expect(mark).toMatchObject({ favorite: true, note: '账号注释\n\n本机注释', tagIds: [accountTag.tagId] });
    expect(await db.annotations.listTags(ACCOUNT)).toHaveLength(1);
    expect((await db.importGuest(ACCOUNT)).marks).toBe(0);
    // Another tab's import reaches the open cache.
    await until(() => account.readMark(question).mark?.favorite === true);
  });

  it('applies cloud rows in memory: newer marks, merged and deleted tags', () => {
    const cache = cacheFor(null, ACCOUNT);
    cache.subscribeMark(question, () => {});
    const tag = { tagId: crypto.randomUUID(), name: 'A', color: 'red' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted: false };
    const target = { ...tag, tagId: crypto.randomUUID(), name: 'B' };
    const later = new Date(Date.now() + 60_000).toISOString();
    cache.mergeRemote({ tags: [tag, target], marks: [{ ...question, favorite: true, note: '', excerpt: '', tagIds: [tag.tagId], updatedAt: later }], merged: [] });
    expect(cache.readMark(question).mark?.tagIds).toEqual([tag.tagId]);
    cache.mergeRemote({ tags: [], marks: [], merged: [{ from: tag.tagId, to: target.tagId }] });
    expect(cache.readMark(question).mark?.tagIds).toEqual([target.tagId]);
    expect(cache.readTags().tags.map((entry) => entry.name)).toEqual(['B']);
    cache.mergeRemote({ tags: [{ ...target, deleted: true, updatedAt: later }], marks: [], merged: [] });
    expect(cache.readMark(question).mark?.tagIds).toEqual([]);
    expect(cache.readTags().tags).toEqual([]);
  });
});
