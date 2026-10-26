import {
  validateAnswer, validateAttempt, validateMark, validateTag,
  type SyncResponse,
} from './types';

/** Checks a cloud response completely before any of it reaches memory or IndexedDB. */
export function validateSyncResponse(value: unknown): asserts value is SyncResponse {
  const data = value as SyncResponse;
  if (!data || typeof data !== 'object' || !Array.isArray(data.answers) || !Array.isArray(data.attempts) ||
    !Array.isArray(data.tags) || !Array.isArray(data.marks) || !Array.isArray(data.merged) ||
    typeof data.cursor !== 'string' || !/^\d+$/.test(data.cursor) || typeof data.hasMore !== 'boolean' ||
    (data.reset !== undefined && typeof data.reset !== 'boolean')) {
    throw new Error('云同步返回格式有误');
  }
  try {
    data.answers.forEach(validateAnswer);
    data.attempts.forEach(validateAttempt);
    data.tags.forEach(validateTag);
    data.marks.forEach(validateMark);
  } catch {
    throw new Error('云同步返回的记录格式有误');
  }
  for (const entry of data.merged) {
    if (!entry || typeof entry.from !== 'string' || typeof entry.to !== 'string') throw new Error('标签合并信息格式有误');
  }
}
