// @vitest-environment happy-dom
import { act, createElement, Fragment, memo, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountIdentity } from '@/lib/account/types';
import { QuestionDatabase, type QuestionNamespace } from '@/lib/question-store';
import { QuestionDatabaseProvider } from '@/components/question/database-provider';
import { useQuestionDatabase, useQuestionStorage, type QuestionDatabaseContext } from '@/components/question/database-context';
import { useQuestionRecords, type QuestionRecordsState } from '@/components/question/use-question-records';
import { useLibraryMarks } from '@/components/question/marks/use-library-marks';
import { useUserTags } from '@/components/question/marks/use-marks';
import { ACCOUNT, OTHER, draft, openDatabase, question, runCleanup, tick } from './helpers/question-store';

const account = vi.hoisted(() => ({
  user: null as AccountIdentity | null, cachedUser: null as AccountIdentity | null, error: null,
}));
vi.mock('@/components/account', () => ({ useAccount: () => account, useAccountMenuSection: () => {} }));
vi.mock('@/components/question/account-section', () => ({ questionAccountSection: {} }));
vi.mock('@/lib/diagnostics', () => ({ diag: () => {} }));
vi.mock('@/lib/question-supabase', () => ({
  getQuestionSupabaseClient: () => new Promise(() => {}), createQuestionTransport: vi.fn(),
}));

type Capture = {
  context: QuestionDatabaseContext;
  records: QuestionRecordsState;
  marks: ReturnType<typeof useLibraryMarks>;
  tags: ReturnType<typeof useUserTags>;
};
let root: Root;
let container: HTMLDivElement;
let captures: Capture[];
let storageRenders: number;
let recordsEnabled = true;
let marksEnabled = true;
let mirrorEnabled = false;

function Probe() {
  const context = useQuestionDatabase()!;
  const records = useQuestionRecords(recordsEnabled);
  const marks = useLibraryMarks(marksEnabled);
  const tags = useUserTags();
  captures.push({ context, records, marks, tags });
  return null;
}
const StorageProbe = memo(function StorageProbe() {
  useQuestionStorage(); storageRenders++; return null;
});
function LibraryMirror() { useLibraryMarks(); return null; }
const render = (strict = false) => act(async () => {
  const children = createElement(Fragment, null, createElement(Probe), createElement(StorageProbe), mirrorEnabled ? createElement(LibraryMirror) : null);
  const provider = createElement(QuestionDatabaseProvider, null, children);
  root.render(strict ? createElement(StrictMode, null, provider) : provider);
});
async function settle(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await act(async () => { await tick(); });
  expect(check()).toBe(true);
}
const latest = () => captures.at(-1)!;
function identity(id: string | null) {
  account.user = id ? { id } : null; account.cachedUser = account.user;
}
async function seed(database: QuestionDatabase, namespace: QuestionNamespace, label: string) {
  await database.answers.save(namespace, question(label), { state: draft(label), updatedAt: new Date().toISOString(), committed: false });
  await database.annotations.putMark(namespace, { documentPath: '/docs/math', questionId: label, favorite: true, note: label, excerpt: label, tagIds: [], updatedAt: new Date().toISOString() });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  identity(null); captures = []; storageRenders = 0; recordsEnabled = true; marksEnabled = true; mirrorEnabled = false;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); runCleanup(); });

describe('identity-scoped question UI', () => {
  it('never renders another identity\'s session, answers, marks or tags during login, account switch and logout', async () => {
    const db = await openDatabase();
    for (const [namespace, label] of [[ACCOUNT, 'A'], [OTHER, 'B'], ['guest', 'guest']] as const) await seed(db, namespace, label);
    vi.spyOn(QuestionDatabase, 'open').mockResolvedValue(db);
    await render(); await settle(() => latest()?.marks.marks?.[0]?.note === 'guest');
    for (const [id, namespace, label] of [
      ['11111111-1111-4111-8111-111111111111', ACCOUNT, 'A'],
      ['22222222-2222-4222-8222-222222222222', OTHER, 'B'],
      [null, 'guest', 'guest'],
    ] as const) {
      const before = captures.length;
      identity(id); await render();
      await settle(() => latest()?.marks.marks?.[0]?.note === label && latest()?.records.records?.[0]?.questionId === label);
      for (const capture of captures.slice(before)) {
        expect(capture.context.namespace).toBe(namespace);
        expect(capture.context.cache?.namespace ?? namespace).toBe(namespace);
        expect(capture.context.annotations?.namespace ?? namespace).toBe(namespace);
        expect(capture.context.engine?.namespace ?? namespace).toBe(namespace);
        expect(capture.records.records?.every((record) => record.questionId === label) ?? true).toBe(true);
        expect(capture.marks.marks?.every((mark) => mark.note === label) ?? true).toBe(true);
        expect(capture.tags.cache?.namespace ?? namespace).toBe(namespace);
      }
    }
  });

  it('does not publish a slow account A record read after account B becomes active', async () => {
    const db = await openDatabase(); await seed(db, ACCOUNT, 'A'); await seed(db, OTHER, 'B');
    const list = db.answers.list.bind(db.answers);
    let resolveA!: (rows: Awaited<ReturnType<typeof list>>) => void;
    vi.spyOn(db.answers, 'list').mockImplementation((namespace) => namespace === ACCOUNT ? new Promise((resolve) => { resolveA = resolve; }) : list(namespace));
    vi.spyOn(QuestionDatabase, 'open').mockResolvedValue(db);
    identity('11111111-1111-4111-8111-111111111111'); await render();
    await settle(() => typeof resolveA === 'function');
    identity('22222222-2222-4222-8222-222222222222'); await render();
    await settle(() => latest()?.records.records?.[0]?.questionId === 'B');
    await act(async () => resolveA(await list(ACCOUNT)));
    expect(latest().records.records?.[0]?.questionId).toBe('B');
  });

  it('masks records and marks while disabled and reads current values on re-enable', async () => {
    const db = await openDatabase(); await seed(db, 'guest', 'guest');
    vi.spyOn(QuestionDatabase, 'open').mockResolvedValue(db);
    await render(); await settle(() => latest()?.records.records?.length === 1 && latest()?.marks.marks?.length === 1);
    recordsEnabled = false; marksEnabled = false; await render();
    expect(latest().records.records).toBeNull(); expect(latest().marks.marks).toBeNull();
    await seed(db, 'guest', 'new');
    recordsEnabled = true; marksEnabled = true; await render();
    await settle(() => latest()?.records.records?.length === 2 && latest()?.marks.marks?.length === 2);
  });

  it('does not publish a slow account A library read after logout', async () => {
    const db = await openDatabase(); await seed(db, ACCOUNT, 'A'); await seed(db, 'guest', 'guest');
    const list = db.annotations.listMarks.bind(db.annotations);
    let resolveA!: (rows: Awaited<ReturnType<typeof list>>) => void;
    vi.spyOn(db.annotations, 'listMarks').mockImplementation((namespace) => namespace === ACCOUNT ? new Promise((resolve) => { resolveA = resolve; }) : list(namespace));
    vi.spyOn(QuestionDatabase, 'open').mockResolvedValue(db);
    identity('11111111-1111-4111-8111-111111111111'); await render(); await settle(() => typeof resolveA === 'function');
    identity(null); await render(); await settle(() => latest()?.marks.marks?.[0]?.note === 'guest');
    await act(async () => resolveA(await list(ACCOUNT)));
    expect(latest().marks.marks?.[0]?.note).toBe('guest');
  });

  it('shares one library read between settings and another mounted consumer', async () => {
    const db = await openDatabase(); const list = vi.spyOn(db.annotations, 'listMarks');
    vi.spyOn(QuestionDatabase, 'open').mockResolvedValue(db); mirrorEnabled = true;
    await render(); await settle(() => latest()?.marks.marks !== null);
    expect(list).toHaveBeenCalledOnce();
    await act(async () => { await seed(db, 'guest', 'saved'); });
    await settle(() => latest()?.marks.marks?.[0]?.note === 'saved');
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('updates an open library after writes and retries a read error instead of showing an empty library', async () => {
    const db = await openDatabase(); vi.spyOn(QuestionDatabase, 'open').mockResolvedValue(db);
    const list = vi.spyOn(db.annotations, 'listMarks').mockRejectedValueOnce(new Error('read failed'));
    await render(); await settle(() => Boolean(latest()?.marks.error));
    expect(latest().marks.marks).toBeNull();
    await act(async () => latest().marks.retry()); await settle(() => latest()?.marks.marks?.length === 0);
    expect(latest().marks.error).toBeNull(); expect(list).toHaveBeenCalledTimes(2);
    await act(async () => { await seed(db, 'guest', 'saved'); });
    await settle(() => latest()?.marks.marks?.[0]?.note === 'saved');
  });

  it('does not rerender question storage consumers when sync status changes', async () => {
    const db = await openDatabase(); vi.spyOn(QuestionDatabase, 'open').mockResolvedValue(db);
    identity('11111111-1111-4111-8111-111111111111'); await render();
    await settle(() => latest()?.context.ready && latest()?.context.engine !== null);
    const before = storageRenders;
    await act(async () => latest().context.engine!.put({ answers: [{ ...question(), state: { ...draft('sync'), submitted: true }, updatedAt: new Date().toISOString() }] }));
    expect(latest().context.status.pending).toBeGreaterThan(0);
    expect(storageRenders).toBe(before);
  });

  it('survives Strict Mode and keeps a namespace-matched memory session when IndexedDB is blocked', async () => {
    vi.spyOn(QuestionDatabase, 'open').mockRejectedValue(new Error('IndexedDB blocked'));
    await render(true); await settle(() => latest()?.context.ready === true);
    expect(latest().context.database).toBeNull();
    expect(latest().context.cache?.namespace).toBe('guest');
    expect(latest().records.error).toContain('浏览器数据库无法打开');
  });
});
