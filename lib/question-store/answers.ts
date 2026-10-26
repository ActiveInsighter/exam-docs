import type { QuestionDatabase } from './database';
import { byNamespace, outboxOf, request } from './idb';
import {
  compareTime, isAnswered, questionKey, validateState,
  type AnswerState, type QuestionIdentity, type QuestionNamespace, type QuestionSummary,
  type RemoteAnswer, type RemoteAttempt,
} from './types';

/*
 * Persistence of answers and submissions (stores `answers` and `attempts`).
 * No caching and no network here: the memory cache decides what to write and
 * when, the sync engine decides what to upload. The transaction-level helpers
 * at the bottom let the database commit one sync exchange atomically.
 */

export interface AnswerRow extends QuestionIdentity {
  namespace: QuestionNamespace;
  key: string;
  /** What the reader sees: a local draft or the latest committed answer. */
  state: AnswerState;
  updatedAt: string;
  /** A committed answer (submit or reset) the cloud has not acknowledged yet. */
  outbox?: RemoteAnswer;
}

export interface AttemptRow extends RemoteAttempt {
  namespace: QuestionNamespace;
  /** Set while the submission has not reached the cloud. */
  pending?: 1;
  /** The guest attempt an imported attempt was copied from; makes imports repeatable. */
  sourceAttemptId?: string;
}

/** One write decided by the memory cache. */
export interface AnswerWrite {
  state: AnswerState;
  updatedAt: string;
  /** Submissions and resets are committed: the cloud receives them. Drafts stay local. */
  committed: boolean;
  /** Present on a submission. */
  attempt?: RemoteAttempt;
}

const identityOf = (value: QuestionIdentity): QuestionIdentity =>
  ({ documentPath: value.documentPath, questionId: value.questionId, questionRevision: value.questionRevision });

export const toRemoteAnswer = (row: { state: AnswerState; updatedAt: string } & QuestionIdentity): RemoteAnswer =>
  ({ ...identityOf(row), state: row.state, updatedAt: row.updatedAt });

const toRemoteAttempt = ({ documentPath, questionId, questionRevision, attemptId, state, createdAt }: AttemptRow): RemoteAttempt =>
  ({ documentPath, questionId, questionRevision, attemptId, state, createdAt });

export class AnswerStore {
  constructor(private readonly db: QuestionDatabase) {}

  /** Every saved answer of one page in a single indexed read; the page cache is filled from this. */
  listDocument(namespace: QuestionNamespace, documentPath: string): Promise<AnswerRow[]> {
    return this.db.transaction(['answers'], 'readonly', (tx) =>
      request(tx.objectStore('answers').index('document').getAll([namespace, documentPath])) as Promise<AnswerRow[]>);
  }

  getMany(namespace: QuestionNamespace, keys: readonly string[]): Promise<(AnswerRow | undefined)[]> {
    if (!keys.length) return Promise.resolve([]);
    return this.db.transaction(['answers'], 'readonly', (tx) => {
      const store = tx.objectStore('answers');
      return Promise.all(keys.map((key) => request<AnswerRow | undefined>(store.get([namespace, key]))));
    });
  }

  get(namespace: QuestionNamespace, identity: QuestionIdentity): Promise<AnswerRow | undefined> {
    return this.getMany(namespace, [questionKey(identity)]).then(([row]) => row);
  }

  list(namespace: QuestionNamespace): Promise<AnswerRow[]> {
    return this.db.transaction(['answers'], 'readonly', (tx) =>
      request(tx.objectStore('answers').getAll(IDBKeyRange.bound([namespace], [namespace, []]))) as Promise<AnswerRow[]>);
  }

  async listAttempts(namespace: QuestionNamespace, identity?: QuestionIdentity): Promise<AttemptRow[]> {
    const key = identity ? questionKey(identity) : undefined;
    const rows = await this.db.transaction(['attempts'], 'readonly', (tx) => byNamespace<AttemptRow>(tx.objectStore('attempts'), namespace));
    return rows.filter((row) => !key || questionKey(row) === key).sort((a, b) => compareTime(a.createdAt, b.createdAt));
  }

  async summary(namespace: QuestionNamespace): Promise<QuestionSummary> {
    return this.db.transaction(['answers', 'attempts'], 'readonly', async (tx) => {
      const rows = (await request(tx.objectStore('answers').getAll(IDBKeyRange.bound([namespace], [namespace, []])))) as AnswerRow[];
      const attempts = await request(tx.objectStore('attempts').index('namespace').count(namespace));
      return {
        answered: rows.filter((row) => isAnswered(row.state)).length,
        submitted: rows.filter((row) => row.state.submitted).length,
        attempts,
      };
    });
  }

  /** Saves what the reader sees; a committed write of an account also enters the outbox. */
  async save(namespace: QuestionNamespace, identity: QuestionIdentity, write: AnswerWrite): Promise<void> {
    // Reserve space for PostgreSQL JSONB rendering whitespace inside its 16 KiB limit.
    validateState(write.state, 15 * 1024);
    const key = questionKey(identity);
    const account = namespace !== 'guest';
    await this.db.transaction(['answers', 'attempts'], 'readwrite', async (tx) => {
      const store = tx.objectStore('answers');
      const previous = await request<AnswerRow | undefined>(store.get([namespace, key]));
      if (write.attempt) {
        const attempt: AttemptRow = { ...write.attempt, namespace, ...(account ? { pending: 1 as const } : {}) };
        await request(tx.objectStore('attempts').put(attempt));
      }
      // A newer row (the cloud's, or another tab's) already won; a slow older write must not undo it.
      if (previous && compareTime(previous.updatedAt, write.updatedAt) > 0) return;
      const outbox = account && write.committed
        ? toRemoteAnswer({ ...identity, state: write.state, updatedAt: write.updatedAt })
        // A draft typed after a reset must not cancel the reset's upload.
        : previous?.outbox;
      const row: AnswerRow = { ...identityOf(identity), namespace, key, state: structuredClone(write.state), updatedAt: write.updatedAt };
      await request(store.put(outbox ? { ...row, outbox } : row));
    });
    this.db.emit({ namespace, scope: 'answers', keys: [key], origin: 'write' });
  }
}

/* ------------------------------------------------------------------------
 * Transaction-level helpers for one sync exchange (see QuestionDatabase).
 * ---------------------------------------------------------------------- */

export async function pendingAnswers(tx: IDBTransaction, namespace: QuestionNamespace) {
  const answers = (await outboxOf<AnswerRow>(tx.objectStore('answers'), namespace)).flatMap((row) => (row.outbox ? [row.outbox] : []));
  const attempts = (await outboxOf<AttemptRow>(tx.objectStore('attempts'), namespace)).map(toRemoteAttempt);
  return { answers, attempts };
}

/** Clears outbox entries the cloud acknowledged, unless they were replaced meanwhile. */
export async function acknowledgeAnswers(tx: IDBTransaction, namespace: QuestionNamespace,
  answers: readonly RemoteAnswer[], attempts: readonly RemoteAttempt[]): Promise<void> {
  const answerStore = tx.objectStore('answers');
  for (const sent of answers) {
    const row = await request<AnswerRow | undefined>(answerStore.get([namespace, questionKey(sent)]));
    if (row?.outbox && row.outbox.updatedAt === sent.updatedAt) {
      const { outbox: _sent, ...rest } = row;
      await request(answerStore.put(rest));
    }
  }
  const attemptStore = tx.objectStore('attempts');
  for (const sent of attempts) {
    const row = await request<AttemptRow | undefined>(attemptStore.get([namespace, sent.attemptId]));
    if (row?.pending) {
      const { pending: _sent, ...rest } = row;
      await request(attemptStore.put(rest));
    }
  }
}

/** Last writer wins: a cloud answer replaces the local one unless the local one is newer. Returns changed keys. */
export async function applyRemoteAnswers(tx: IDBTransaction, namespace: QuestionNamespace,
  answers: readonly RemoteAnswer[], attempts: readonly RemoteAttempt[]): Promise<string[]> {
  const changed: string[] = [];
  const answerStore = tx.objectStore('answers');
  for (const remote of answers) {
    const key = questionKey(remote);
    const local = await request<AnswerRow | undefined>(answerStore.get([namespace, key]));
    if (local && compareTime(local.updatedAt, remote.updatedAt) > 0) continue;
    // An unsent commit older than the cloud's answer would lose anyway: the cloud keeps the newer one.
    const outbox = local?.outbox && compareTime(local.outbox.updatedAt, remote.updatedAt) > 0 ? local.outbox : undefined;
    const row: AnswerRow = { ...identityOf(remote), namespace, key, state: remote.state, updatedAt: remote.updatedAt };
    await request(answerStore.put(outbox ? { ...row, outbox } : row));
    changed.push(key);
  }
  const attemptStore = tx.objectStore('attempts');
  for (const attempt of attempts) {
    const existing = await request(attemptStore.getKey([namespace, attempt.attemptId]));
    if (existing === undefined) await request(attemptStore.add({ ...attempt, namespace } satisfies AttemptRow));
  }
  return changed;
}

/** Copies guest answers and submissions into an account; the account's own newer answers win. */
export async function importGuestAnswers(tx: IDBTransaction, namespace: QuestionNamespace) {
  const answers = tx.objectStore('answers');
  const attempts = tx.objectStore('attempts');
  const guests = (await request(answers.getAll(IDBKeyRange.bound(['guest'], ['guest', []])))) as AnswerRow[];
  const keys: string[] = [];
  for (const guest of guests) {
    const current = await request<AnswerRow | undefined>(answers.get([namespace, guest.key]));
    // Existing account answers take precedence; importing never overwrites them.
    if (current) continue;
    const committed = guest.state.submitted || !isAnswered(guest.state);
    const row: AnswerRow = { ...identityOf(guest), namespace, key: guest.key, state: guest.state, updatedAt: guest.updatedAt };
    await request(answers.put(committed ? { ...row, outbox: toRemoteAnswer(row) } : row));
    keys.push(guest.key);
  }
  const imported = new Set((await byNamespace<AttemptRow>(attempts, namespace)).map((row) => row.sourceAttemptId));
  let attemptCount = 0;
  for (const guest of await byNamespace<AttemptRow>(attempts, 'guest')) {
    if (imported.has(guest.attemptId)) continue;
    await request(attempts.add({
      ...toRemoteAttempt(guest), attemptId: crypto.randomUUID(), namespace, pending: 1, sourceAttemptId: guest.attemptId,
    } satisfies AttemptRow));
    attemptCount++;
  }
  return { keys, records: keys.length, attempts: attemptCount };
}
