'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { QuestionAnnotationCache, type MarkPatch } from '@/lib/question-store';
import type { MarkIdentity, QuestionMark, UserTag } from '@/lib/question-store/types';
import { useQuestionStorage } from '../database-context';

/** Questions rendered outside the site provider (tests, previews) keep marks in memory only. */
let memoryAnnotations: QuestionAnnotationCache | undefined;

export function useAnnotationCache(): QuestionAnnotationCache | null {
  const storage = useQuestionStorage();
  return storage ? storage.annotations : (memoryAnnotations ??= new QuestionAnnotationCache(null, 'guest'));
}

const NO_TAGS: readonly UserTag[] = [];

export function useUserTags() {
  const cache = useAnnotationCache();
  const subscribe = useCallback((listener: () => void) => cache?.subscribeTags(listener) ?? (() => {}), [cache]);
  const snapshot = useSyncExternalStore(subscribe, () => cache?.readTags() ?? null, () => null);
  return { tags: snapshot?.tags ?? NO_TAGS, ready: snapshot?.ready ?? false, cache };
}

export function useQuestionMark(documentPath: string, questionId: string) {
  const cache = useAnnotationCache();
  const identity = useMemo<MarkIdentity>(() => ({ documentPath, questionId }), [documentPath, questionId]);
  const subscribe = useCallback((listener: () => void) => cache?.subscribeMark(identity, listener) ?? (() => {}), [cache, identity]);
  const snapshot = useSyncExternalStore(subscribe, () => cache?.readMark(identity) ?? null, () => null);
  const update = useCallback((patch: MarkPatch) => {
    if (!cache) return Promise.reject(new Error('收藏与注释暂不可用'));
    return cache.updateMark(identity, { excerpt: questionExcerpt(questionId), ...patch });
  }, [cache, identity, questionId]);
  return { mark: snapshot?.mark ?? null, ready: snapshot?.ready ?? false, update };
}

/** First words of the question as shown on the page, so lists of marks are readable. */
export function questionExcerpt(questionId: string): string {
  if (typeof document === 'undefined') return '';
  const body = document.getElementById(`question-${questionId}`)?.querySelector('[data-exam-question-body]');
  if (!body) return '';
  // The stem only: answer controls would add "正确错误" or option letters.
  const copy = body.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[data-exam-choice-group], [data-exam-boolean], [data-blank-index]').forEach((element) => element.remove());
  copy.querySelectorAll('[data-question-blank]').forEach((element) => element.replaceWith('＿＿'));
  return (copy.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 160);
}

export function liveTagsOf(mark: QuestionMark | null, tags: readonly UserTag[]): UserTag[] {
  if (!mark?.tagIds.length) return [];
  const assigned = new Set(mark.tagIds);
  return tags.filter((tag) => assigned.has(tag.tagId));
}
