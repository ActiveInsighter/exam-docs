/** Browser storage and wire format intentionally contain answers, never answer keys. */
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

export interface RemoteQuestionRecord extends QuestionIdentity {
  state: AnswerState;
  version: number;
  updatedAt: string;
}

export interface QuestionRecord extends QuestionIdentity {
  namespace: QuestionNamespace;
  key: string;
  state: AnswerState;
  generation: number;
  remoteVersion: number;
  updatedAt: string;
  dirty: boolean;
}

export interface AttemptPayload {
  attemptId: string;
  state: AnswerState;
  createdAt: string;
}

export interface QuestionAttempt extends QuestionIdentity, AttemptPayload {
  namespace: QuestionNamespace;
  /** Used to make guest imports repeatable without changing the source history. */
  sourceAttemptId?: string;
}

export interface RemoteAttempt extends QuestionIdentity, AttemptPayload {}

export interface SyncOperation extends QuestionIdentity {
  operationId: string;
  state: AnswerState;
  baseVersion: number;
  attempt?: AttemptPayload;
}

export interface OutboxOperation extends SyncOperation {
  namespace: QuestionNamespace;
  key: string;
  generation: number;
  createdAt: string;
  inFlight: boolean;
}

export interface QuestionConflict extends QuestionIdentity {
  namespace: QuestionNamespace;
  conflictId: string;
  key: string;
  localState: AnswerState;
  remote: RemoteQuestionRecord;
  createdAt: string;
  resolvedAt?: string;
  resolution?: 'local' | 'remote';
}

export interface SyncReceipt {
  operationId: string;
  status: 'applied' | 'conflict';
  record: RemoteQuestionRecord;
}

export interface SyncRequest {
  operations: SyncOperation[];
  cursor: string | null;
  limit: number;
}

export interface SyncResponse {
  receipts: SyncReceipt[];
  changes: RemoteQuestionRecord[];
  attempts: RemoteAttempt[];
  cursor: string;
  hasMore: boolean;
  /** The server restarted the feed from zero because the sent cursor was ahead of the account. */
  reset?: boolean;
}

export interface QuestionSyncTransport {
  sync(request: SyncRequest): Promise<SyncResponse>;
  /** Tags, favourites and notes; resolves null while the server does not offer them yet. */
  syncAnnotations?(request: AnnotationSyncRequest): Promise<AnnotationSyncResponse | null>;
}

export interface DatabaseChange {
  namespace: QuestionNamespace;
  kind: 'local' | 'sync';
  /** Which data changed: answers (default) or the reader's tags, favourites and notes. */
  scope?: 'answers' | 'annotations';
  /** Question keys whose current record may have changed; absent means "any". */
  keys?: string[];
  /** A submission or explicit choice that should reach the cloud without debounce. */
  urgent?: boolean;
}

export interface SyncMetadata {
  cursor: string | null;
  lastSyncedAt: string | null;
  retryCount: number;
  nextRetryAt: number;
}

export type SyncPhase = 'local' | 'idle' | 'syncing' | 'offline' | 'error';

export interface QuestionSyncStatus {
  phase: SyncPhase;
  pending: number;
  conflicts: number;
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
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

export function validateRemote(record: RemoteQuestionRecord): void {
  validateIdentity(record);
  validateState(record.state);
  // Version zero is the explicit missing-record snapshot in a CAS conflict receipt.
  if (!Number.isSafeInteger(record.version) || record.version < 0 || !Number.isFinite(Date.parse(record.updatedAt))) {
    throw new Error('Invalid remote question record');
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

export interface StoredUserTag extends UserTag {
  namespace: QuestionNamespace;
  dirty: boolean;
}

export interface StoredQuestionMark extends QuestionMark {
  namespace: QuestionNamespace;
  key: string;
  dirty: boolean;
}

export interface AnnotationSyncRequest {
  tags: UserTag[];
  marks: QuestionMark[];
  cursor: string | null;
  limit: number;
}

export interface AnnotationSyncResponse {
  tags: UserTag[];
  marks: QuestionMark[];
  /** A tag created on two devices with the same name: `from` was folded into `to`. */
  merged: { from: string; to: string }[];
  cursor: string;
  hasMore: boolean;
  reset?: boolean;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeTagName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function validateTag(tag: UserTag): void {
  const name = normalizeTagName(tag.name);
  if (!UUID.test(tag.tagId) || name !== tag.name || !name || [...name].length > ANNOTATION_LIMITS.tagName ||
    !(TAG_COLORS as readonly string[]).includes(tag.color) || typeof tag.deleted !== 'boolean' ||
    !Number.isFinite(Date.parse(tag.updatedAt)) || !Number.isFinite(Date.parse(tag.createdAt))) {
    throw new Error('Invalid tag');
  }
}

export function validateMark(mark: QuestionMark): void {
  validateIdentity({ ...mark, questionRevision: 'mark' });
  if (typeof mark.favorite !== 'boolean' || typeof mark.note !== 'string' || mark.note.length > ANNOTATION_LIMITS.note ||
    typeof mark.excerpt !== 'string' || mark.excerpt.length > ANNOTATION_LIMITS.excerpt ||
    !Array.isArray(mark.tagIds) || mark.tagIds.length > ANNOTATION_LIMITS.tagsPerQuestion ||
    mark.tagIds.some((id) => typeof id !== 'string' || !UUID.test(id)) || new Set(mark.tagIds).size !== mark.tagIds.length ||
    !Number.isFinite(Date.parse(mark.updatedAt))) {
    throw new Error('Invalid question mark');
  }
}
