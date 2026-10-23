import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionAnswerCache, QuestionAnnotationCache, QuestionDatabase } from '../lib/question-store';

const id = (page: number, questionId = 'q1') => ({ documentPath: `/docs/page-${page}`, questionId, questionRevision: 'r1' });
const draft = { selected: [], values: ['草稿'], submitted: false, attempt: 0 };
const cleanup: (() => void)[] = [];
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await tick();
  expect(check()).toBe(true);
}
async function open() {
  const db = await QuestionDatabase.open({ indexedDB: new IDBFactory(), name: crypto.randomUUID(), broadcast: false });
  const answers = new QuestionAnswerCache(db, 'guest', { draftDelayMs: 10 });
  const marks = new QuestionAnnotationCache(db, 'guest');
  cleanup.push(() => { answers.dispose(); marks.dispose(); db.close(); });
  return { db, answers, marks };
}
afterEach(() => cleanup.splice(0).reverse().forEach((close) => close()));

describe('question cache page lifecycle', () => {
  it('releases saved pages and restores answers and notes when returning', async () => {
    const { db, answers, marks } = await open();
    for (let page = 0; page < 20; page++) {
      const identity = id(page);
      await db.save('guest', identity, draft);
      await db.annotations.updateMark('guest', identity, { favorite: true, note: `笔记 ${page}` });
      const offAnswer = answers.subscribe(identity, () => {});
      const offMark = marks.subscribeMark(identity, () => {});
      await until(() => answers.read(identity).ready && marks.readMark(identity).ready);
      offAnswer(); offMark();
      await tick();
      expect(answers.read(identity).ready).toBe(false);
      expect(marks.readMark(identity).ready).toBe(false);
    }
    answers.subscribe(id(0), () => {});
    marks.subscribeMark(id(0), () => {});
    await until(() => answers.read(id(0)).ready && marks.readMark(id(0)).ready);
    expect(answers.read(id(0)).state).toEqual(draft);
    expect(marks.readMark(id(0)).mark?.note).toBe('笔记 0');
  });

  it('loads questions subscribed after the first document read has completed', async () => {
    const { db, answers, marks } = await open();
    await db.save('guest', id(0, 'later'), draft);
    await db.annotations.updateMark('guest', id(0, 'later'), { favorite: true });
    answers.subscribe(id(0), () => {});
    marks.subscribeMark(id(0), () => {});
    await until(() => answers.read(id(0)).ready && marks.readMark(id(0)).ready);
    await tick();
    answers.subscribe(id(0, 'later'), () => {});
    marks.subscribeMark(id(0, 'later'), () => {});
    await until(() => answers.read(id(0, 'later')).ready && marks.readMark(id(0, 'later')).ready);
    expect(answers.read(id(0, 'later')).state).toEqual(draft);
    expect(marks.readMark(id(0, 'later')).mark?.favorite).toBe(true);
  });

  it('preserves a failed draft after leaving and releases it only after retry succeeds', async () => {
    const { db, answers } = await open();
    const off = answers.subscribe(id(0), () => {});
    await until(() => answers.read(id(0)).ready);
    vi.spyOn(db, 'save').mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
    answers.write(id(0), draft);
    off();
    await until(() => answers.hasUnsaved());
    expect(answers.read(id(0)).state).toEqual(draft);
    answers.retry(id(0));
    await until(() => !answers.hasUnsaved() && !answers.read(id(0)).ready);
    expect((await db.get('guest', id(0)))?.state).toEqual(draft);
  });

  it('does not evict an entry during immediate unsubscribe/resubscribe (Strict Mode)', async () => {
    const { db, answers } = await open();
    const read = vi.spyOn(db, 'listDocument');
    const off = answers.subscribe(id(0), () => {});
    await until(() => answers.read(id(0)).ready);
    off();
    answers.subscribe(id(0), () => {});
    await tick();
    expect(answers.read(id(0)).ready).toBe(true);
    expect(read).toHaveBeenCalledOnce();
  });

  it('returns a stable snapshot in memory-only mode', () => {
    const answers = new QuestionAnswerCache(null, 'guest');
    expect(answers.read(id(0))).toBe(answers.read(id(0)));
    answers.dispose();
  });
});
