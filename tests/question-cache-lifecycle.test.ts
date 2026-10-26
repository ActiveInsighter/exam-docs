import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionAnnotationCache, QuestionAnswerCache } from '../lib/question-store';
import { openDatabase, quota, runCleanup, tick, until, onCleanup } from './helpers/question-store';

const id = (page: number, questionId = 'q1') => ({ documentPath: `/docs/page-${page}`, questionId, questionRevision: 'r1' });
const draft = { selected: [], values: ['草稿'], submitted: false, attempt: 0 };

async function open() {
  const db = await openDatabase();
  const answers = new QuestionAnswerCache(db, 'guest', { draftDelayMs: 10 });
  const marks = new QuestionAnnotationCache(db, 'guest');
  onCleanup(() => { answers.dispose(); marks.dispose(); });
  return { db, answers, marks };
}

/** Writes through a separate cache, as an earlier visit would have. */
async function seed(db: Awaited<ReturnType<typeof open>>['db'], identity: ReturnType<typeof id>, note?: string) {
  const answers = new QuestionAnswerCache(db, 'guest', { draftDelayMs: 0 });
  const marks = new QuestionAnnotationCache(db, 'guest');
  answers.write(identity, draft);
  if (note !== undefined) {
    marks.subscribeMark(identity, () => {});
    await until(() => marks.readMark(identity).ready);
    await marks.updateMark(identity, { favorite: true, note });
  }
  await until(async () => Boolean(await db.answers.get('guest', identity)));
  answers.dispose();
  marks.dispose();
}

afterEach(runCleanup);

describe('question cache page lifecycle', () => {
  it('releases saved pages and restores answers and notes when returning', async () => {
    const { db, answers, marks } = await open();
    for (let page = 0; page < 20; page++) {
      const identity = id(page);
      await seed(db, identity, `笔记 ${page}`);
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
    await seed(db, id(0, 'later'), '');
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
    vi.spyOn(db.answers, 'save').mockRejectedValueOnce(quota());
    answers.write(id(0), draft);
    off();
    await until(() => answers.hasUnsaved());
    expect(answers.read(id(0)).state).toEqual(draft);
    answers.retry(id(0));
    await until(() => !answers.hasUnsaved() && !answers.read(id(0)).ready);
    expect((await db.answers.get('guest', id(0)))?.state).toEqual(draft);
  });

  it('does not evict an entry during immediate unsubscribe/resubscribe (Strict Mode)', async () => {
    const { db, answers } = await open();
    const read = vi.spyOn(db.answers, 'listDocument');
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
