/** Browser storage and wire format intentionally contain answers, never answer keys. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QuestionNamespace = 'guest' | `user:${string}`;

export interface QuestionIdentity {
  documentPath: string;
  questionId: string;
  questionRevision: string;
}

export interface AnswerState {
  selected: string[];
  values: string[];
  submitted: boolean;
  attempt: number;
}

/** A committed answer as the cloud stores it: last writer (by `updatedAt`) wins. */
export interface RemoteAnswer extends QuestionIdentity {
  state: AnswerState;
  updatedAt: string;
}

/** One graded submission; immutable, identified by `attemptId`. */
export interface RemoteAttempt extends QuestionIdentity {
  attemptId: string;
  state: AnswerState;
  createdAt: string;
}

/** Everything a device uploads in one exchange, and everything it receives back. */
export interface SyncChanges {
  answers: RemoteAnswer[];
  attempts: RemoteAttempt[];
  tags: UserTag[];
  marks: QuestionMark[];
}

export interface SyncRequest {
  changes: SyncChanges;
  cursor: string | null;
  limit: number;
}

export interface SyncResponse extends SyncChanges {
  /** A tag created on two devices with the same name: `from` was folded into `to`. */
  merged: { from: string; to: string }[];
  cursor: string;
  hasMore: boolean;
  /** The server restarted the feed from zero because the sent cursor was ahead of the account. */
  reset?: boolean;
}

export interface QuestionSyncTransport {
  sync(request: SyncRequest): Promise<SyncResponse>;
}

export interface DatabaseChange {
  namespace: QuestionNamespace;
  scope: 'answers' | 'annotations';
  /** Keys whose rows may have changed; absent means "any". */
  keys?: string[];
  /** The tab that made the change. */
  tab: string;
  /**
   * write: a cache stored what it already shows; sync: rows the engine already
   * handed to this tab's caches; import: copied data no cache has seen.
   */
  origin: 'write' | 'sync' | 'import';
}

export type SyncPhase = 'local' | 'idle' | 'syncing' | 'offline' | 'error';

export interface QuestionSyncStatus {
  phase: SyncPhase;
  /** Committed changes not yet acknowledged by the cloud. */
  pending: number;
  lastSyncedAt: string | null;
  error: string | null;
}

/** Counts shown in the account menu. */
export interface QuestionSummary {
  /** Questions with a non-empty current answer. */
  answered: number;
  /** Questions whose current answer is submitted. */
  submitted: number;
  /** Immutable submission history entries. */
  attempts: number;
}

export function namespaceForUser(userId?: string | null): QuestionNamespace {
  if (!userId) return 'guest';
  if (!UUID.test(userId)) {
    throw new Error('Invalid account identifier');
  }
  return `user:${userId.toLowerCase()}`;
}

export function questionKey(identity: QuestionIdentity): string {
  validateIdentity(identity);
  return JSON.stringify([identity.documentPath, identity.questionId, identity.questionRevision]);
}

export function validateIdentity(identity: QuestionIdentity): void {
  const limits = { documentPath: 2048, questionId: 200, questionRevision: 128 };
  for (const [field, limit] of Object.entries(limits)) {
    const value = identity[field as keyof QuestionIdentity];
    if (typeof value !== 'string' || !value.trim() || value.length > limit || value.includes('\u0000')) {
      throw new Error(`Invalid question ${field}`);
    }
  }
}

export function validateState(state: AnswerState, maxBytes = 16384): void {
  if (!state || typeof state.submitted !== 'boolean' || !Number.isSafeInteger(state.attempt) || state.attempt < 0 || state.attempt > 2147483647) {
    throw new Error('Invalid answer state');
  }
  if (Object.keys(state).sort().join(',') !== 'attempt,selected,submitted,values') throw new Error('Unexpected answer state fields');
  for (const field of ['selected', 'values'] as const) {
    if (!Array.isArray(state[field]) || state[field].length > 64 ||
      Array.from(state[field]).some((value) => typeof value !== 'string' || value.includes('\u0000') || value.length > (field === 'selected' ? 128 : 8192))) {
      throw new Error(`Invalid answer ${field}`);
    }
  }
  if (new TextEncoder().encode(JSON.stringify(state)).length > maxBytes) throw new Error('Answer exceeds storage size limit');
}

export const validTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** Instants, not strings: the server spells timestamps differently. */
export const compareTime = (left: string, right: string) => Date.parse(left) - Date.parse(right);

/** Each write is strictly newer than the row it replaces, even within one millisecond. */
export function nextTimestamp(previous?: string): string {
  const last = previous ? Date.parse(previous) : 0;
  return new Date(Math.max(Date.now(), Number.isFinite(last) ? last + 1 : 0)).toISOString();
}

export const emptyAnswer = (): AnswerState => ({ selected: [], values: [], submitted: false, attempt: 0 });

export const isAnswered = (state: AnswerState) => state.selected.length > 0 || state.values.some((value) => value.trim() !== '');

export function validateAnswer(answer: RemoteAnswer): void {
  validateIdentity(answer);
  validateState(answer.state);
  if (!validTime(answer.updatedAt)) throw new Error('Invalid answer timestamp');
}

export function validateAttempt(attempt: RemoteAttempt): void {
  validateIdentity(attempt);
  validateState(attempt.state);
  if (!UUID.test(attempt.attemptId) || !attempt.state.submitted || attempt.state.attempt < 1 || !validTime(attempt.createdAt)) {
    throw new Error('Invalid submission attempt');
  }
}

export function sameState(left: AnswerState, right: AnswerState): boolean {
  return left.attempt === right.attempt && left.submitted === right.submitted &&
    JSON.stringify(left.selected) === JSON.stringify(right.selected) && JSON.stringify(left.values) === JSON.stringify(right.values);
}

/* ---------------------------------------------------------------------------
 * Annotations: the reader's own tags, favourites and notes.
 *
 * They belong to a question, not to one revision of it, so a corrected typo
 * keeps the reader's note. Sync is last-writer-wins per tag and per question.
 * ------------------------------------------------------------------------- */

export const TAG_COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'] as const;
export type TagColor = typeof TAG_COLORS[number];

export const ANNOTATION_LIMITS = {
  tagName: 24,
  tagsPerAccount: 200,
  tagsPerQuestion: 20,
  note: 4000,
  excerpt: 160,
} as const;

export interface MarkIdentity {
  documentPath: string;
  questionId: string;
}

export interface UserTag {
  tagId: string;
  name: string;
  color: TagColor;
  createdAt: string;
  updatedAt: string;
  /** Tombstone, kept so the deletion reaches other devices. */
  deleted: boolean;
}

export interface QuestionMark extends MarkIdentity {
  favorite: boolean;
  note: string;
  tagIds: string[];
  /** Start of the question text, so lists of marks can be read without opening every page. */
  excerpt: string;
  updatedAt: string;
}

export function markKey(identity: MarkIdentity): string {
  validateIdentity({ ...identity, questionRevision: 'mark' });
  return JSON.stringify([identity.documentPath, identity.questionId]);
}

export function emptyMark(identity: MarkIdentity): QuestionMark {
  return { documentPath: identity.documentPath, questionId: identity.questionId, favorite: false, note: '', tagIds: [], excerpt: '', updatedAt: new Date(0).toISOString() };
}

export function isEmptyMark(mark: Pick<QuestionMark, 'favorite' | 'note' | 'tagIds'>): boolean {
  return !mark.favorite && mark.note.trim() === '' && mark.tagIds.length === 0;
}

export function normalizeTagName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function validateTag(tag: UserTag): void {
  const name = normalizeTagName(tag.name);
  if (!UUID.test(tag.tagId) || name !== tag.name || !name || [...name].length > ANNOTATION_LIMITS.tagName ||
    !(TAG_COLORS as readonly string[]).includes(tag.color) || typeof tag.deleted !== 'boolean' ||
    !validTime(tag.updatedAt) || !validTime(tag.createdAt)) {
    throw new Error('Invalid tag');
  }
}

export function validateMark(mark: QuestionMark): void {
  validateIdentity({ ...mark, questionRevision: 'mark' });
  if (typeof mark.favorite !== 'boolean' || typeof mark.note !== 'string' || mark.note.length > ANNOTATION_LIMITS.note ||
    typeof mark.excerpt !== 'string' || mark.excerpt.length > ANNOTATION_LIMITS.excerpt ||
    !Array.isArray(mark.tagIds) || mark.tagIds.length > ANNOTATION_LIMITS.tagsPerQuestion ||
    mark.tagIds.some((id) => typeof id !== 'string' || !UUID.test(id)) || new Set(mark.tagIds).size !== mark.tagIds.length ||
    !validTime(mark.updatedAt)) {
    throw new Error('Invalid question mark');
  }
}
