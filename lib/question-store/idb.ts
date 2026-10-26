import type { QuestionNamespace } from './types';

/** Promise wrapper for one IndexedDB request. */
export const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error ?? new Error('Browser database request failed'));
});

/** Every row of one account namespace, through the store's `namespace` index. */
export const byNamespace = <T>(store: IDBObjectStore, namespace: QuestionNamespace) =>
  request(store.index('namespace').getAll(namespace)) as Promise<T[]>;

/**
 * Rows waiting for upload, through the store's sparse `outbox` index: a row
 * is in it only while its marker field is set, so finding pending work never
 * reads the rest of the store.
 */
export const outboxOf = <T>(store: IDBObjectStore, namespace: QuestionNamespace) =>
  request(store.index('outbox').getAll(IDBKeyRange.bound([namespace], [namespace, []]))) as Promise<T[]>;
