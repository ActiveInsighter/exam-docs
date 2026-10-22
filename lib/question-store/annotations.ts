import type { QuestionDatabase } from './database';
import { byNamespace, request } from './idb';
import {
  ANNOTATION_LIMITS, TAG_COLORS, isEmptyMark, markKey, normalizeTagName, validateMark, validateTag,
  type AnnotationSyncResponse, type MarkIdentity, type QuestionMark, type QuestionNamespace,
  type StoredQuestionMark, type StoredUserTag, type TagColor, type UserTag,
} from './types';

/*
 * The reader's own tags, favourites and notes, in the same IndexedDB as the
 * answers (stores `tags` and `marks`).
 *
 * Unlike answers there is no outbox: each row carries a dirty flag and a
 * timestamp. Sync sends dirty rows, the server keeps the newer of two writes
 * (last writer wins) and returns its current rows, and a row stays dirty only
 * if it was edited again while the exchange was in flight.
 */

const uuid = () => crypto.randomUUID();
const META_KEY = 'annotations';

export class AnnotationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnnotationError';
  }
}

export const ANNOTATION_BATCH = { marks: 100, bytes: 512 * 1024 } as const;

/** Keeps one upload well inside the server's 200-row / 1 MiB request limit. */
function boundBatch(marks: QuestionMark[]): QuestionMark[] {
  const batch: QuestionMark[] = [];
  let bytes = 0;
  for (const mark of marks) {
    const size = new TextEncoder().encode(JSON.stringify(mark)).length;
    if (batch.length >= ANNOTATION_BATCH.marks || (batch.length && bytes + size > ANNOTATION_BATCH.bytes)) break;
    batch.push(mark);
    bytes += size;
  }
  return batch;
}

/** Each write is strictly newer than the row it replaces, even within one millisecond. */
function nextTimestamp(previous?: string): string {
  const now = Date.now();
  const last = previous ? Date.parse(previous) : 0;
  return new Date(Math.max(now, last + 1)).toISOString();
}

function toTag(stored: StoredUserTag): UserTag {
  const { tagId, name, color, createdAt, updatedAt, deleted } = stored;
  return { tagId, name, color, createdAt, updatedAt, deleted };
}

function toMark(stored: StoredQuestionMark): QuestionMark {
  const { documentPath, questionId, favorite, note, tagIds, excerpt, updatedAt } = stored;
  return { documentPath, questionId, favorite, note, tagIds: [...tagIds], excerpt, updatedAt };
}

export type MarkPatch = Partial<Pick<QuestionMark, 'favorite' | 'note' | 'tagIds' | 'excerpt'>>;

export interface TagInput {
  tagId?: string;
  name: string;
  color: TagColor;
}

export class QuestionAnnotationStore {
  constructor(private readonly db: QuestionDatabase) {}

  /** @internal Dirty rows count as pending uploads in the sync status. */
  async countDirty(tx: IDBTransaction, namespace: QuestionNamespace): Promise<number> {
    if (namespace === 'guest') return 0;
    const tags = await byNamespace<StoredUserTag>(tx.objectStore('tags'), namespace);
    const marks = await byNamespace<StoredQuestionMark>(tx.objectStore('marks'), namespace);
    return tags.filter((tag) => tag.dirty).length + marks.filter((mark) => mark.dirty).length;
  }

  async listTags(namespace: QuestionNamespace): Promise<UserTag[]> {
    return this.db.transaction(['tags'], 'readonly', async (tx) =>
      (await byNamespace<StoredUserTag>(tx.objectStore('tags'), namespace))
        .filter((tag) => !tag.deleted)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name))
        .map(toTag));
  }

  /** Every non-empty mark of the namespace, newest first. */
  async listMarks(namespace: QuestionNamespace): Promise<QuestionMark[]> {
    return this.db.transaction(['marks'], 'readonly', async (tx) =>
      (await byNamespace<StoredQuestionMark>(tx.objectStore('marks'), namespace))
        .filter((mark) => !isEmptyMark(mark))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(toMark));
  }

  async listDocumentMarks(namespace: QuestionNamespace, documentPath: string): Promise<QuestionMark[]> {
    return this.db.transaction(['marks'], 'readonly', async (tx) =>
      ((await request(tx.objectStore('marks').index('document').getAll([namespace, documentPath]))) as StoredQuestionMark[]).map(toMark));
  }

  async getMarks(namespace: QuestionNamespace, keys: readonly string[]): Promise<(QuestionMark | undefined)[]> {
    if (!keys.length) return [];
    return this.db.transaction(['marks'], 'readonly', (tx) => {
      const store = tx.objectStore('marks');
      return Promise.all(keys.map(async (key) => {
        const stored = await request<StoredQuestionMark | undefined>(store.get([namespace, key]));
        return stored ? toMark(stored) : undefined;
      }));
    });
  }

  /** Applies a partial change to one question's mark and returns the saved mark. */
  async updateMark(namespace: QuestionNamespace, identity: MarkIdentity, patch: MarkPatch): Promise<QuestionMark> {
    const key = markKey(identity);
    const saved = await this.db.transaction(['marks', 'tags'], 'readwrite', async (tx) => {
      const store = tx.objectStore('marks');
      const previous = await request<StoredQuestionMark | undefined>(store.get([namespace, key]));
      const live = new Set((await byNamespace<StoredUserTag>(tx.objectStore('tags'), namespace))
        .filter((tag) => !tag.deleted).map((tag) => tag.tagId));
      const tagIds = [...new Set(patch.tagIds ?? previous?.tagIds ?? [])].filter((id) => live.has(id));
      if (tagIds.length > ANNOTATION_LIMITS.tagsPerQuestion) {
        throw new AnnotationError(`一道题最多 ${ANNOTATION_LIMITS.tagsPerQuestion} 个标签`);
      }
      const note = (patch.note ?? previous?.note ?? '').replace(/\r\n?/gu, '\n');
      if (note.length > ANNOTATION_LIMITS.note) throw new AnnotationError(`注释最多 ${ANNOTATION_LIMITS.note} 字`);
      const next: StoredQuestionMark = {
        namespace, key, documentPath: identity.documentPath, questionId: identity.questionId,
        favorite: patch.favorite ?? previous?.favorite ?? false,
        note: note.trim() === '' ? '' : note,
        tagIds,
        excerpt: (patch.excerpt || previous?.excerpt || '').slice(0, ANNOTATION_LIMITS.excerpt),
        updatedAt: nextTimestamp(previous?.updatedAt),
        dirty: namespace !== 'guest',
      };
      validateMark(next);
      // Guests have nothing to sync: an emptied mark is simply removed.
      if (namespace === 'guest' && isEmptyMark(next)) await request(store.delete([namespace, key]));
      else await request(store.put(next));
      return toMark(next);
    });
    this.db.emit({ namespace, kind: 'local', scope: 'annotations', keys: [key], urgent: true });
    return saved;
  }

  /** Creates a tag, or renames / recolours one when `tagId` is given. */
  async saveTag(namespace: QuestionNamespace, input: TagInput): Promise<UserTag> {
    const name = normalizeTagName(input.name);
    if (!name) throw new AnnotationError('标签名不能为空');
    if ([...name].length > ANNOTATION_LIMITS.tagName) throw new AnnotationError(`标签名最多 ${ANNOTATION_LIMITS.tagName} 个字`);
    if (!(TAG_COLORS as readonly string[]).includes(input.color)) throw new AnnotationError('未知的标签颜色');
    const saved = await this.db.transaction(['tags'], 'readwrite', async (tx) => {
      const store = tx.objectStore('tags');
      const all = await byNamespace<StoredUserTag>(store, namespace);
      const live = all.filter((tag) => !tag.deleted);
      const previous = input.tagId ? all.find((tag) => tag.tagId === input.tagId) : undefined;
      if (input.tagId && (!previous || previous.deleted)) throw new AnnotationError('标签已被删除');
      if (live.some((tag) => tag.tagId !== input.tagId && tag.name.toLowerCase() === name.toLowerCase())) {
        throw new AnnotationError(`已有名为「${name}」的标签`);
      }
      if (!previous && live.length >= ANNOTATION_LIMITS.tagsPerAccount) {
        throw new AnnotationError(`最多创建 ${ANNOTATION_LIMITS.tagsPerAccount} 个标签`);
      }
      const now = nextTimestamp(previous?.updatedAt);
      const next: StoredUserTag = {
        namespace, tagId: previous?.tagId ?? uuid(), name, color: input.color,
        createdAt: previous?.createdAt ?? now, updatedAt: now, deleted: false, dirty: namespace !== 'guest',
      };
      validateTag(next);
      await request(store.put(next));
      return toTag(next);
    });
    this.db.emit({ namespace, kind: 'local', scope: 'annotations', urgent: true });
    return saved;
  }

  /** Deletes a tag everywhere; accounts keep a tombstone so other devices learn about it. */
  async deleteTag(namespace: QuestionNamespace, tagId: string): Promise<void> {
    await this.db.transaction(['tags', 'marks'], 'readwrite', async (tx) => {
      const tags = tx.objectStore('tags');
      const previous = await request<StoredUserTag | undefined>(tags.get([namespace, tagId]));
      if (!previous || previous.deleted) return;
      if (namespace === 'guest') await request(tags.delete([namespace, tagId]));
      else await request(tags.put({ ...previous, deleted: true, updatedAt: nextTimestamp(previous.updatedAt), dirty: true }));
      const marks = tx.objectStore('marks');
      for (const mark of await byNamespace<StoredQuestionMark>(marks, namespace)) {
        if (!mark.tagIds.includes(tagId)) continue;
        const next = { ...mark, tagIds: mark.tagIds.filter((id) => id !== tagId), updatedAt: nextTimestamp(mark.updatedAt), dirty: namespace !== 'guest' };
        if (namespace === 'guest' && isEmptyMark(next)) await request(marks.delete([namespace, mark.key]));
        else await request(marks.put(next));
      }
    });
    this.db.emit({ namespace, kind: 'local', scope: 'annotations', urgent: true });
  }

  /** Dirty rows to upload, bounded per exchange. Tags always travel before the marks that use them. */
  async batch(namespace: QuestionNamespace): Promise<{ tags: UserTag[]; marks: QuestionMark[] }> {
    if (namespace === 'guest') return { tags: [], marks: [] };
    return this.db.transaction(['tags', 'marks'], 'readonly', async (tx) => ({
      tags: (await byNamespace<StoredUserTag>(tx.objectStore('tags'), namespace)).filter((tag) => tag.dirty).map(toTag),
      marks: boundBatch((await byNamespace<StoredQuestionMark>(tx.objectStore('marks'), namespace))
        .filter((mark) => mark.dirty)
        .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
        .map(toMark)),
    }));
  }

  async cursor(namespace: QuestionNamespace): Promise<string | null> {
    return this.db.transaction(['metadata'], 'readonly', async (tx) => {
      const saved = await request<{ value?: { cursor: string | null } } | undefined>(tx.objectStore('metadata').get([namespace, META_KEY]));
      return saved?.value?.cursor ?? null;
    });
  }

  /** Commits one exchange: merged tags, the server's rows and the new cursor, atomically. */
  async apply(namespace: QuestionNamespace, response: AnnotationSyncResponse,
    sent: { tags: UserTag[]; marks: QuestionMark[] }): Promise<void> {
    validateAnnotationResponse(response);
    const sentTags = new Map(sent.tags.map((tag) => [tag.tagId, tag.updatedAt]));
    const sentMarks = new Map(sent.marks.map((mark) => [markKey(mark), mark.updatedAt]));
    const changed = new Set<string>();
    await this.db.transaction(['tags', 'marks', 'metadata'], 'readwrite', async (tx) => {
      changed.clear();
      const tags = tx.objectStore('tags');
      const marks = tx.objectStore('marks');
      const metadata = tx.objectStore('metadata');
      const previous = await request<{ value?: { cursor: string | null } } | undefined>(metadata.get([namespace, META_KEY]));
      const cursor = previous?.value?.cursor;
      if (!response.reset && cursor && BigInt(response.cursor) < BigInt(cursor)) throw new Error('Annotation cursor moved backwards');

      if (response.merged.length) {
        const remap = new Map(response.merged.map((entry) => [entry.from, entry.to]));
        for (const from of remap.keys()) await request(tags.delete([namespace, from]));
        for (const mark of await byNamespace<StoredQuestionMark>(marks, namespace)) {
          if (!mark.tagIds.some((id) => remap.has(id))) continue;
          await request(marks.put({ ...mark, tagIds: [...new Set(mark.tagIds.map((id) => remap.get(id) ?? id))] }));
          changed.add(mark.key);
        }
      }

      // The server's row wins unless the local one was edited after it was sent and is newer.
      // Timestamps are compared as instants: the server spells them differently.
      const keepLocal = (local: { dirty: boolean; updatedAt: string } | undefined, sentAt: string | undefined, remoteAt: string) =>
        Boolean(local?.dirty && local.updatedAt !== sentAt && Date.parse(local.updatedAt) > Date.parse(remoteAt));

      for (const tag of response.tags) {
        const local = await request<StoredUserTag | undefined>(tags.get([namespace, tag.tagId]));
        if (keepLocal(local, sentTags.get(tag.tagId), tag.updatedAt)) continue;
        await request(tags.put({ ...tag, namespace, dirty: false } satisfies StoredUserTag));
      }
      for (const mark of response.marks) {
        const key = markKey(mark);
        const local = await request<StoredQuestionMark | undefined>(marks.get([namespace, key]));
        if (keepLocal(local, sentMarks.get(key), mark.updatedAt)) continue;
        await request(marks.put({ ...mark, namespace, key, dirty: false } satisfies StoredQuestionMark));
        changed.add(key);
      }
      // Sent rows the server already had in a newer form are answered in the lists above;
      // anything sent and untouched since is now clean.
      for (const [tagId, sentAt] of sentTags) {
        const local = await request<StoredUserTag | undefined>(tags.get([namespace, tagId]));
        if (local?.dirty && local.updatedAt === sentAt) await request(tags.put({ ...local, dirty: false }));
      }
      for (const [key, sentAt] of sentMarks) {
        const local = await request<StoredQuestionMark | undefined>(marks.get([namespace, key]));
        if (local?.dirty && local.updatedAt === sentAt) await request(marks.put({ ...local, dirty: false }));
      }
      await request(metadata.put({ namespace, key: META_KEY, value: { cursor: response.cursor } }));
    });
    this.db.emit({ namespace, kind: 'sync', scope: 'annotations', keys: [...changed] });
  }

  /** Copies guest tags (matched by name) and marks into an account, merging with what it has. */
  async importGuest(namespace: QuestionNamespace): Promise<number> {
    if (namespace === 'guest') throw new Error('Choose an account before importing');
    let count = 0;
    await this.db.transaction(['tags', 'marks'], 'readwrite', async (tx) => {
      count = 0;
      const tags = tx.objectStore('tags');
      const marks = tx.objectStore('marks');
      const accountTags = (await byNamespace<StoredUserTag>(tags, namespace)).filter((tag) => !tag.deleted);
      const mapping = new Map<string, string>();
      for (const guest of (await byNamespace<StoredUserTag>(tags, 'guest')).filter((tag) => !tag.deleted)) {
        const existing = accountTags.find((tag) => tag.name.toLowerCase() === guest.name.toLowerCase());
        if (existing) { mapping.set(guest.tagId, existing.tagId); continue; }
        if (accountTags.length >= ANNOTATION_LIMITS.tagsPerAccount) continue;
        const created: StoredUserTag = { ...guest, namespace, tagId: uuid(), updatedAt: nextTimestamp(), dirty: true };
        await request(tags.put(created));
        accountTags.push(created);
        mapping.set(guest.tagId, created.tagId);
      }
      for (const guest of await byNamespace<StoredQuestionMark>(marks, 'guest')) {
        if (isEmptyMark(guest)) continue;
        const current = await request<StoredQuestionMark | undefined>(marks.get([namespace, guest.key]));
        const guestTags = guest.tagIds.flatMap((id) => mapping.get(id) ?? []);
        // Repeated imports are no-ops: a note already carried over is not appended again.
        const note = current?.note && guest.note && !current.note.includes(guest.note)
          ? `${current.note}\n\n${guest.note}`.slice(0, ANNOTATION_LIMITS.note)
          : current?.note || guest.note;
        const next: StoredQuestionMark = {
          ...guest, namespace,
          favorite: Boolean(current?.favorite || guest.favorite),
          note,
          tagIds: [...new Set([...(current?.tagIds ?? []), ...guestTags])].slice(0, ANNOTATION_LIMITS.tagsPerQuestion),
          excerpt: current?.excerpt || guest.excerpt,
          updatedAt: nextTimestamp(current?.updatedAt),
          dirty: true,
        };
        if (current && current.favorite === next.favorite && current.note === next.note &&
          current.tagIds.length === next.tagIds.length) continue;
        await request(marks.put(next));
        count++;
      }
    });
    if (count) this.db.emit({ namespace, kind: 'local', scope: 'annotations', urgent: true });
    return count;
  }
}

export function validateAnnotationResponse(value: unknown): asserts value is AnnotationSyncResponse {
  const data = value as AnnotationSyncResponse;
  if (!data || typeof data !== 'object' || !Array.isArray(data.tags) || !Array.isArray(data.marks) || !Array.isArray(data.merged) ||
    typeof data.cursor !== 'string' || !/^\d+$/.test(data.cursor) || typeof data.hasMore !== 'boolean' ||
    (data.reset !== undefined && typeof data.reset !== 'boolean')) {
    throw new Error('标签与收藏同步返回格式有误');
  }
  for (const tag of data.tags) validateTag(tag);
  for (const mark of data.marks) validateMark(mark);
  for (const entry of data.merged) {
    if (!entry || typeof entry.from !== 'string' || typeof entry.to !== 'string') throw new Error('标签合并信息格式有误');
  }
}
