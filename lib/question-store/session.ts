import { QuestionAnnotationCache } from './annotation-cache';
import { QuestionAnswerCache, type QuestionAnswerCacheOptions } from './cache';
import type { QuestionDatabase } from './database';
import { QuestionSyncEngine, type QuestionSyncOptions } from './sync';
import type { QuestionNamespace } from './types';

export interface QuestionSessionOptions {
  answers?: Pick<QuestionAnswerCacheOptions, 'draftDelayMs'>;
  sync?: QuestionSyncOptions;
}

/**
 * Everything one reader identity (guest or account) needs on a page: the
 * answer and annotation caches and, for an account, the sync engine that
 * feeds them cloud rows and receives their commits. The UI talks to the
 * caches only; the engine is connected once a verified session exists.
 */
export class QuestionSession {
  readonly answers: QuestionAnswerCache;
  readonly annotations: QuestionAnnotationCache;
  readonly sync: QuestionSyncEngine | null;
  private readonly detach: () => void;

  constructor(readonly database: QuestionDatabase | null, readonly namespace: QuestionNamespace, options: QuestionSessionOptions = {}) {
    this.sync = namespace === 'guest' ? null : new QuestionSyncEngine(database, namespace, options.sync);
    const sync = this.sync;
    this.answers = new QuestionAnswerCache(database, namespace, {
      ...options.answers, outbox: sync, onRead: sync ? () => sync.refreshIfStale() : undefined,
    });
    this.annotations = new QuestionAnnotationCache(database, namespace, { outbox: sync });
    this.detach = sync?.onRemote((response) => {
      this.answers.mergeRemote(response.answers);
      this.annotations.mergeRemote(response);
    }) ?? (() => {});
    sync?.start();
  }

  dispose(): void {
    this.detach();
    this.answers.dispose();
    this.annotations.dispose();
    this.sync?.stop();
  }
}
