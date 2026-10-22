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
}

export interface DatabaseChange {
  namespace: QuestionNamespace;
  kind: 'local' | 'sync';
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
