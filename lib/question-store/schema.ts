import type { AnswerState, QuestionNamespace } from './types';

/*
 * IndexedDB layout of `exam-docs-questions`.
 *
 * v4 (current):
 *   answers   [namespace, key]        what the reader sees for each question (draft or
 *                                     committed); `outbox` holds a committed answer
 *                                     until the cloud has it. Indexes: document, outbox.
 *   attempts  [namespace, attemptId]  every submission; `pending: 1` until uploaded.
 *   tags      [namespace, tagId]      the reader's tags; `dirty: 1` until uploaded.
 *   marks     [namespace, key]        favourite / note / tags per question; `dirty: 1`.
 *   meta      [namespace, key]        the sync cursor.
 *
 * The `outbox` indexes are sparse: a row is in one only while it waits for
 * upload, so the sync engine finds pending work without reading every row.
 *
 * v1–v3 used a CAS outbox (operations), conflict rows and lease metadata. The
 * v4 upgrade keeps every answer, attempt, tag and mark, turns unsent committed
 * answers and attempts into outbox entries, drops unsent drafts' upload (drafts
 * stay local now) and restarts the cloud feed, which the server renumbered.
 */

export const DATABASE_NAME = 'exam-docs-questions';
export const SCHEMA_VERSION = 4;
export const STORES = ['answers', 'attempts', 'tags', 'marks', 'meta'] as const;
export type StoreName = typeof STORES[number];

interface LegacyRecord {
  namespace: QuestionNamespace;
  key: string;
  documentPath: string;
  questionId: string;
  questionRevision: string;
  state: AnswerState;
  updatedAt: string;
  dirty?: boolean;
}

interface LegacyOperation {
  namespace: QuestionNamespace;
  attempt?: { attemptId: string };
}

const isCommitted = (state: AnswerState) =>
  state.submitted || (state.selected.length === 0 && state.values.every((value) => value === ''));

export function upgrade(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
  if (oldVersion < 1) {
    // A fresh database: create v4 directly.
    const answers = db.createObjectStore('answers', { keyPath: ['namespace', 'key'] });
    answers.createIndex('document', ['namespace', 'documentPath']);
    answers.createIndex('outbox', ['namespace', 'outbox.updatedAt']);
    const attempts = db.createObjectStore('attempts', { keyPath: ['namespace', 'attemptId'] });
    attempts.createIndex('namespace', 'namespace');
    attempts.createIndex('outbox', ['namespace', 'pending']);
    createAnnotationStores(db);
    db.createObjectStore('meta', { keyPath: ['namespace', 'key'] });
    return;
  }
  if (oldVersion < 3) createAnnotationStores(db);
  migrateToV4(db, tx);
}

function createAnnotationStores(db: IDBDatabase): void {
  const tags = db.createObjectStore('tags', { keyPath: ['namespace', 'tagId'] });
  tags.createIndex('namespace', 'namespace');
  tags.createIndex('outbox', ['namespace', 'dirty']);
  const marks = db.createObjectStore('marks', { keyPath: ['namespace', 'key'] });
  marks.createIndex('namespace', 'namespace');
  marks.createIndex('document', ['namespace', 'documentPath']);
  marks.createIndex('outbox', ['namespace', 'dirty']);
}

/** Rewrites v1–v3 rows inside the version-change transaction (callbacks only: no awaits). */
function migrateToV4(db: IDBDatabase, tx: IDBTransaction): void {
  const answers = db.createObjectStore('answers', { keyPath: ['namespace', 'key'] });
  answers.createIndex('document', ['namespace', 'documentPath']);
  answers.createIndex('outbox', ['namespace', 'outbox.updatedAt']);
  db.createObjectStore('meta', { keyPath: ['namespace', 'key'] });

  const attempts = tx.objectStore('attempts');
  attempts.createIndex('outbox', ['namespace', 'pending']);
  for (const name of ['tags', 'marks'] as const) {
    const store = tx.objectStore(name);
    if (!store.indexNames.contains('outbox')) store.createIndex('outbox', ['namespace', 'dirty']);
    // Booleans are not valid IndexedDB keys: dirty rows get 1, clean rows lose the field.
    store.openCursor().onsuccess = function () {
      const cursor = this.result;
      if (!cursor) return;
      const { dirty, ...row } = cursor.value as { dirty?: boolean | number };
      cursor.update(dirty ? { ...row, dirty: 1 } : row);
      cursor.continue();
    };
  }

  tx.objectStore('records').getAll().onsuccess = function () {
    for (const record of this.result as LegacyRecord[]) {
      const { namespace, key, documentPath, questionId, questionRevision, state, updatedAt } = record;
      // Unsent drafts stay local now; only an unsent committed answer is uploaded.
      const outbox = record.dirty && namespace !== 'guest' && isCommitted(state)
        ? { documentPath, questionId, questionRevision, state, updatedAt } : undefined;
      answers.put({ namespace, key, documentPath, questionId, questionRevision, state, updatedAt, ...(outbox ? { outbox } : {}) });
    }
    tx.objectStore('operations').getAll().onsuccess = function () {
      for (const operation of this.result as LegacyOperation[]) {
        if (!operation.attempt || operation.namespace === 'guest') continue;
        attempts.get([operation.namespace, operation.attempt.attemptId]).onsuccess = function () {
          if (this.result) attempts.put({ ...this.result, pending: 1 });
        };
      }
      for (const name of ['records', 'operations', 'conflicts', 'metadata']) db.deleteObjectStore(name);
    };
  };
}
