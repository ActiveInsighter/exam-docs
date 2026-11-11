'use client';

import type { QuestionAnnotationCache, QuestionMark } from '@/lib/question-store';
import { createQuestionQuery, type QuestionQuery } from '@/lib/question-store/query';
import { useQuestionQuery } from '../use-question-query';
import { useAnnotationCache } from './use-marks';

const idle = () => {};
// Settings and an open library share one transient read. The query drops its
// rows and subscription when its last consumer leaves; the cache owns identity.
const queries = new WeakMap<QuestionAnnotationCache, QuestionQuery<QuestionMark[]>>();

function libraryQuery(cache: QuestionAnnotationCache) {
  let query = queries.get(cache);
  if (!query) {
    query = createQuestionQuery({
      load: () => cache.listMarks(),
      subscribe: (changed) => cache.subscribeLibrary(changed),
      errorMessage: '读取收藏与标签失败，请重试。',
      delay: 80,
    });
    queries.set(cache, query);
  }
  return query;
}

/** One namespace-scoped read/subscription policy for the library and settings. */
export function useLibraryMarks(enabled = true) {
  const cache = useAnnotationCache();
  const query = cache ? libraryQuery(cache) : null;
  const { data, error } = useQuestionQuery(query, enabled);
  return { marks: data, error, cache, retry: query?.refresh ?? idle };
}
