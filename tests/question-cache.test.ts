import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  QuestionAnswerCache, QuestionSession, questionKey,
  type Outbox, type QuestionDatabase, type QuestionNamespace, type SyncChanges,
} from '../lib/question-store';
import {
  ACCOUNT, FakeServer, draft, onCleanup, openDatabase as open, question, quota, runCleanup, submitted, tick as settle, until,
} from './helpers/question-store';

function recorder(): Outbox & { changes: Partial<SyncChanges>[]; held: Set<string> } {
  const changes: Partial<SyncChanges>[] = [];
  const held = new Set<string>();
  return { changes, held, put: (value) => { changes.push(value); }, holds: (key) => held.has(key) };
}

function cacheFor(db: QuestionDatabase | null, draftDelayMs = 0, outbox: Outbox | null = null, namespace: QuestionNamespace = ACCOUNT) {
  const cache = new QuestionAnswerCache(db, namespace, { draftDelayMs, outbox });
  onCleanup(() => cache.dispose());
  return cache;
}

afterEach(runCleanup);

describe('question answer memory cache', () => {
  it('fills every question of a page from one indexed read and then reads memory synchronously', async () => {
    const db = await open();
    const writer = cacheFor(db);
    writer.write(question('q1'), draft('one'));
    writer.write(question('q2'), submitted('two'), 'submit');
    await until(async () => (await db.answers.listDocument(ACCOUNT, '/docs/math')).length === 2);
    const reads = vi.spyOn(db.answers, 'listDocument');
    const cache = cacheFor(db);
    const ids = ['q1', 'q2', 'q3'].map((id) => question(id));
    for (const id of ids) cache.subscribe(id, () => {});
    expect(cache.read(ids[0]).ready).toBe(false);
    await until(() => ids.every((id) => cache.read(id).ready));
    expect(reads).toHaveBeenCalledOnce();
    expect(ids.map((id) => cache.read(id).state.values[0] ?? null)).toEqual(['one', 'two', null]);
    // Stable snapshots: useSyncExternalStore must not see a new object without a change.
    expect(cache.read(ids[0])).toBe(cache.read(ids[0]));
  });

  it('hands commits to the outbox after the local save and never uploads drafts', async () => {
    const db = await open();
    const outbox = recorder();
    const cache = cacheFor(db, 40, outbox);
    const id = question();
    cache.subscribe(id, () => {});
    await until(() => cache.read(id).ready);
    cache.write(id, draft('a'));
    cache.write(id, draft('ab'));
    expect(outbox.changes).toEqual([]);
    cache.write(id, submitted('ab'), 'submit');
    await until(() => outbox.changes.length === 1);
    expect((await db.pending(ACCOUNT)).answers).toHaveLength(1);
    expect(outbox.changes[0].answers?.[0].state).toEqual(submitted('ab'));
    expect(outbox.changes[0].attempts?.[0]).toMatchObject({ state: submitted('ab') });
    cache.write(id, { ...draft(''), values: [], attempt: 1 }, 'reset');
    await until(() => outbox.changes.length === 2);
    expect(outbox.changes[1]).toMatchObject({ answers: [{ state: { values: [], submitted: false } }], attempts: [] });
    // Each write is strictly newer than the one before, so last-writer-wins keeps their order.
    expect(Date.parse(outbox.changes[1].answers![0].updatedAt)).toBeGreaterThan(Date.parse(outbox.changes[0].answers![0].updatedAt));
  });

  it('gives guests no outbox even if one is passed', () => {
    const outbox = recorder();
    const cache = cacheFor(null, 0, outbox, 'guest');
    cache.write(question(), submitted('x'), 'submit');
    expect(outbox.changes).toEqual([]);
  });

  it('collapses queued drafts but never a commit, and stores the newest value', async () => {
    const db = await open();
    const save = vi.spyOn(db.answers, 'save');
    const cache = cacheFor(db);
    const id = question();
    cache.subscribe(id, () => {});
    await until(() => cache.read(id).ready);
    for (const text of ['a', 'ab', 'abc']) cache.write(id, draft(text));
    cache.write(id, submitted('abc'), 'submit');
    cache.write(id, draft('x'));
    cache.write(id, draft('xy'));
    expect(cache.read(id).state.values).toEqual(['xy']);
    await until(() => save.mock.calls.length >= 4 && !cache.hasUnsaved());
    await settle();
    // "a" was already being written; "ab" collapsed into "abc"; "x" into "xy".
    expect(save.mock.calls.map(([, , write]) => `${write.state.values[0]}${write.committed ? '!' : ''}`)).toEqual(['a', 'abc', 'abc!', 'xy']);
    expect((await db.answers.get(ACCOUNT, id))?.state.values).toEqual(['xy']);
    expect(await db.answers.listAttempts(ACCOUNT)).toHaveLength(1);
  });

  it('persists a burst of drafts once after input pauses, and a commit immediately', async () => {
    const db = await open();
    const save = vi.spyOn(db.answers, 'save');
    const cache = cacheFor(db, 40);
    const id = question();
    cache.subscribe(id, () => {});
    await until(() => cache.read(id).ready);
    for (const text of ['a', 'ab', 'abc']) cache.write(id, draft(text));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(save).not.toHaveBeenCalled();
    await until(() => save.mock.calls.length === 1);
    cache.write(id, draft('abcd'));
    cache.write(id, submitted('abcd'), 'submit');
    await until(() => save.mock.calls.length === 3);
    expect(save.mock.calls.map(([, , write]) => `${write.state.values[0]}${write.committed ? '!' : ''}`)).toEqual(['abc', 'abcd', 'abcd!']);
  });

  it('writes a waiting draft at once when the page is hidden or the cache is disposed', async () => {
    const db = await open();
    const save = vi.spyOn(db.answers, 'save');
    const cache = cacheFor(db, 60_000);
    const id = question();
    cache.subscribe(id, () => {});
    await until(() => cache.read(id).ready);
    cache.write(id, draft('hidden'));
    expect(save).not.toHaveBeenCalled();
    cache.persistNow();
    await until(() => save.mock.calls.length === 1 && !cache.hasUnsaved());
    cache.write(id, draft('last'));
    cache.dispose();
    await until(async () => (await db.answers.get(ACCOUNT, id))?.state.values[0] === 'last');
  });

  it('keeps an unsaved draft in memory after a storage failure and stores it on retry', async () => {
    const db = await open();
    const cache = cacheFor(db, 0, recorder());
    const id = question();
    cache.subscribe(id, () => {});
    await until(() => cache.read(id).ready);
    const failure = vi.spyOn(db.answers, 'save').mockRejectedValueOnce(quota());
    cache.write(id, draft('keep me'));
    await until(() => cache.read(id).error !== null);
    expect(cache.read(id).error).toContain('存储空间不足');
    expect(cache.read(id).state.values).toEqual(['keep me']);
    expect(cache.hasUnsaved()).toBe(true);
    failure.mockRestore();
    cache.retry(id);
    await until(() => cache.read(id).error === null && !cache.hasUnsaved());
    expect((await db.answers.get(ACCOUNT, id))?.state.values).toEqual(['keep me']);
  });

  it('treats a commit the local database refused as safe once the cloud has it', async () => {
    const db = await open();
    const outbox = recorder();
    const cache = cacheFor(db, 0, outbox);
    const id = question();
    cache.subscribe(id, () => {});
    await until(() => cache.read(id).ready);
    vi.spyOn(db.answers, 'save').mockRejectedValue(quota());
    outbox.held.add(questionKey(id));
    cache.write(id, submitted('graded'), 'submit');
    await until(() => cache.read(id).error !== null);
    // The refused commit still went to the outbox.
    expect(outbox.changes).toHaveLength(1);
    expect(cache.read(id).error).toContain('正在同步到云端');
    expect(cache.hasUnsaved()).toBe(true);
    outbox.held.clear(); // acknowledged by the cloud
    expect(cache.hasUnsaved()).toBe(false);
  });

  it('shows cloud rows straight away, last writer wins against what is shown', () => {
    const cache = cacheFor(null);
    const id = question();
    cache.subscribe(id, () => {});
    cache.write(id, draft('mine'));
    cache.mergeRemote([{ ...id, state: submitted('older'), updatedAt: '2020-01-01T00:00:00Z' }]);
    expect(cache.read(id).state.values).toEqual(['mine']);
    cache.mergeRemote([{ ...id, state: submitted('newer'), updatedAt: new Date(Date.now() + 60_000).toISOString() }]);
    expect(cache.read(id).state).toEqual(submitted('newer'));
  });

  it('refreshes only keys another tab changed and never this tab\'s own writes', async () => {
    const factory = new IDBFactory();
    const name = crypto.randomUUID();
    const db = await open(factory, name, true);
    const otherTab = await open(factory, name, true);
    const cache = cacheFor(db);
    const [first, second] = [question('q1'), question('q2')];
    cache.subscribe(first, () => {});
    cache.subscribe(second, () => {});
    await until(() => cache.read(first).ready && cache.read(second).ready);
    const many = vi.spyOn(db.answers, 'getMany');
    cache.write(second, draft('mine'));
    await until(() => !cache.hasUnsaved());
    await settle();
    expect(many).not.toHaveBeenCalled();
    await otherTab.answers.save(ACCOUNT, first, { state: draft('other tab'), updatedAt: new Date(Date.now() + 1000).toISOString(), committed: false });
    await until(() => cache.read(first).state.values[0] === 'other tab');
    expect(many).toHaveBeenCalledWith(ACCOUNT, [questionKey(first)]);
  });

  it('works without a browser database as a memory-only cache', () => {
    const cache = cacheFor(null);
    const id = question();
    expect(cache.read(id).ready).toBe(true);
    cache.write(id, draft('memory'));
    expect(cache.read(id).state.values).toEqual(['memory']);
    expect(cache.hasUnsaved()).toBe(false);
  });
});

describe('question session', () => {
  it('submits through the cache to the cloud and shows another device\'s answer after a pull', async () => {
    const db = await open();
    const server = new FakeServer();
    const session = new QuestionSession(db, ACCOUNT, { answers: { draftDelayMs: 0 }, sync: { urgentMs: 0 } });
    onCleanup(() => session.dispose());
    session.sync!.connect(server);
    const [mine, theirs] = [question('mine'), question('theirs')];
    session.answers.subscribe(mine, () => {});
    session.answers.subscribe(theirs, () => {});
    await until(() => session.answers.read(mine).ready && session.answers.read(theirs).ready);
    session.answers.write(mine, draft('thinking'));
    await settle();
    session.answers.write(mine, submitted('final'), 'submit');
    server.edit(submitted('from phone'), theirs);
    await until(() => session.sync!.status.pending === 0 && server.answers.size === 2 && session.answers.read(theirs).state.values[0] === 'from phone');
    expect(server.requests.flatMap((request) => request.changes.answers).map((row) => row.state.values[0])).not.toContain('thinking');
    expect(session.answers.read(theirs).state).toEqual(submitted('from phone'));
    expect((await db.pending(ACCOUNT)).answers).toEqual([]);
  });
});
