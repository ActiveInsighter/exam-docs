import type { QuestionDatabase } from './database';
import { byNamespace, outboxOf, request } from './idb';
import {
  ANNOTATION_LIMITS, TAG_COLORS, compareTime, isEmptyMark, markKey, normalizeTagName, nextTimestamp, validateMark, validateTag,
  type QuestionMark, type QuestionNamespace, type TagColor, type UserTag,
} from './types';

/*
 * Persistence of the reader's own tags, favourites and notes (stores `tags`
 * and `marks`). Each row carries its write time; sync is last writer wins
 * per tag and per question. `dirty: 1` marks a row the cloud has not
 * acknowledged yet. Rules that need the reader's input (names, limits) are
 * checked by `buildTag` / `buildMark`, which the memory cache calls before it
 * shows or stores anything.
 */

export class AnnotationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnnotationError';
  }
}

export interface TagRow extends UserTag {
  namespace: QuestionNamespace;
  dirty?: 1;
}

export interface MarkRow extends QuestionMark {
  namespace: QuestionNamespace;
  key: string;
  dirty?: 1;
}

export type MarkPatch = Partial<Pick<QuestionMark, 'favorite' | 'note' | 'tagIds' | 'excerpt'>>;

export interface TagInput {
  tagId?: string;
  name: string;
  color: TagColor;
}

export const toTag = ({ tagId, name, color, createdAt, updatedAt, deleted }: UserTag): UserTag =>
  ({ tagId, name, color, createdAt, updatedAt, deleted });

export const toMark = ({ documentPath, questionId, favorite, note, tagIds, excerpt, updatedAt }: QuestionMark): QuestionMark =>
  ({ documentPath, questionId, favorite, note, tagIds: [...tagIds], excerpt, updatedAt });

const byCreation = (a: UserTag, b: UserTag) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name);

/** The next version of a question's mark, or an AnnotationError the reader can act on. */
export function buildMark(previous: QuestionMark, patch: MarkPatch, liveTags: ReadonlySet<string> | null): QuestionMark {
  const tagIds = [...new Set(patch.tagIds ?? previous.tagIds)].filter((id) => !liveTags || liveTags.has(id));
  if (tagIds.length > ANNOTATION_LIMITS.tagsPerQuestion) throw new AnnotationError(`一道题最多 ${ANNOTATION_LIMITS.tagsPerQuestion} 个标签`);
  const note = (patch.note ?? previous.note).replace(/\r\n?/gu, '\n');
  if (note.length > ANNOTATION_LIMITS.note) throw new AnnotationError(`注释最多 ${ANNOTATION_LIMITS.note} 字`);
  const next: QuestionMark = {
    documentPath: previous.documentPath, questionId: previous.questionId,
    favorite: patch.favorite ?? previous.favorite,
    note: note.trim() === '' ? '' : note,
    tagIds,
    excerpt: (patch.excerpt || previous.excerpt).slice(0, ANNOTATION_LIMITS.excerpt),
    updatedAt: nextTimestamp(previous.updatedAt),
  };
  validateMark(next);
  return next;
}

/** A new or renamed / recoloured tag, checked against the account's live tags. */
export function buildTag(input: TagInput, tags: readonly UserTag[]): UserTag {
  const name = normalizeTagName(input.name);
  if (!name) throw new AnnotationError('标签名不能为空');
  if ([...name].length > ANNOTATION_LIMITS.tagName) throw new AnnotationError(`标签名最多 ${ANNOTATION_LIMITS.tagName} 个字`);
  if (!(TAG_COLORS as readonly string[]).includes(input.color)) throw new AnnotationError('未知的标签颜色');
  const live = tags.filter((tag) => !tag.deleted);
  const previous = input.tagId ? tags.find((tag) => tag.tagId === input.tagId) : undefined;
  if (input.tagId && (!previous || previous.deleted)) throw new AnnotationError('标签已被删除');
  if (live.some((tag) => tag.tagId !== input.tagId && tag.name.toLowerCase() === name.toLowerCase())) {
    throw new AnnotationError(`已有名为「${name}」的标签`);
  }
  if (!previous && live.length >= ANNOTATION_LIMITS.tagsPerAccount) {
    throw new AnnotationError(`最多创建 ${ANNOTATION_LIMITS.tagsPerAccount} 个标签`);
  }
  const now = nextTimestamp(previous?.updatedAt);
  const tag: UserTag = {
    tagId: previous?.tagId ?? crypto.randomUUID(), name, color: input.color,
    createdAt: previous?.createdAt ?? now, updatedAt: now, deleted: false,
  };
  validateTag(tag);
  return tag;
}

export class AnnotationStore {
  constructor(private readonly db: QuestionDatabase) {}

  async listTags(namespace: QuestionNamespace): Promise<UserTag[]> {
    const rows = await this.db.transaction(['tags'], 'readonly', (tx) => byNamespace<TagRow>(tx.objectStore('tags'), namespace));
    return rows.filter((tag) => !tag.deleted).sort(byCreation).map(toTag);
  }

  /** Every non-empty mark of the namespace, newest first. */
  async listMarks(namespace: QuestionNamespace): Promise<QuestionMark[]> {
    const rows = await this.db.transaction(['marks'], 'readonly', (tx) => byNamespace<MarkRow>(tx.objectStore('marks'), namespace));
    return rows.filter((mark) => !isEmptyMark(mark)).sort((a, b) => compareTime(b.updatedAt, a.updatedAt)).map(toMark);
  }

  listDocumentMarks(namespace: QuestionNamespace, documentPath: string): Promise<QuestionMark[]> {
    return this.db.transaction(['marks'], 'readonly', async (tx) =>
      ((await request(tx.objectStore('marks').index('document').getAll([namespace, documentPath]))) as MarkRow[]).map(toMark));
  }

  getMarks(namespace: QuestionNamespace, keys: readonly string[]): Promise<(QuestionMark | undefined)[]> {
    if (!keys.length) return Promise.resolve([]);
    return this.db.transaction(['marks'], 'readonly', (tx) => {
      const store = tx.objectStore('marks');
      return Promise.all(keys.map(async (key) => {
        const row = await request<MarkRow | undefined>(store.get([namespace, key]));
        return row ? toMark(row) : undefined;
      }));
    });
  }

  async putMark(namespace: QuestionNamespace, mark: QuestionMark): Promise<void> {
    validateMark(mark);
    const key = markKey(mark);
    await this.db.transaction(['marks'], 'readwrite', async (tx) => {
      const store = tx.objectStore('marks');
      // Guests have nothing to sync: an emptied mark is simply removed.
      if (namespace === 'guest' && isEmptyMark(mark)) await request(store.delete([namespace, key]));
      else await request(store.put({ ...toMark(mark), namespace, key, ...(namespace === 'guest' ? {} : { dirty: 1 as const }) } satisfies MarkRow));
    });
    this.db.emit({ namespace, scope: 'annotations', keys: [key], origin: 'write' });
  }

  async putTag(namespace: QuestionNamespace, tag: UserTag): Promise<void> {
    validateTag(tag);
    await this.db.transaction(['tags', 'marks'], 'readwrite', async (tx) => {
      const tags = tx.objectStore('tags');
      if (namespace === 'guest' && tag.deleted) await request(tags.delete([namespace, tag.tagId]));
      else await request(tags.put({ ...toTag(tag), namespace, ...(namespace === 'guest' ? {} : { dirty: 1 as const }) } satisfies TagRow));
      // The cloud removes a deleted tag from every question itself; locally it goes now.
      if (tag.deleted) await removeTagsFromMarks(tx, namespace, new Map([[tag.tagId, null]]));
    });
    this.db.emit({ namespace, scope: 'annotations', origin: 'write' });
  }
}

/** Replaces (or, mapped to null, removes) tag ids in every mark of the namespace, without marking them for upload. */
async function removeTagsFromMarks(tx: IDBTransaction, namespace: QuestionNamespace, remap: Map<string, string | null>): Promise<string[]> {
  const marks = tx.objectStore('marks');
  const changed: string[] = [];
  for (const mark of await byNamespace<MarkRow>(marks, namespace)) {
    if (!mark.tagIds.some((id) => remap.has(id))) continue;
    const tagIds = [...new Set(mark.tagIds.flatMap((id) => {
      const target = remap.has(id) ? remap.get(id) : id;
      return target ? [target] : [];
    }))];
    const next = { ...mark, tagIds };
    if (namespace === 'guest' && isEmptyMark(next)) await request(marks.delete([namespace, mark.key]));
    else await request(marks.put(next));
    changed.push(mark.key);
  }
  return changed;
}

/* ------------------------------------------------------------------------
 * Transaction-level helpers for one sync exchange (see QuestionDatabase).
 * ---------------------------------------------------------------------- */

export async function pendingAnnotations(tx: IDBTransaction, namespace: QuestionNamespace) {
  return {
    tags: (await outboxOf<TagRow>(tx.objectStore('tags'), namespace)).map(toTag),
    marks: (await outboxOf<MarkRow>(tx.objectStore('marks'), namespace)).map(toMark),
  };
}

export async function acknowledgeAnnotations(tx: IDBTransaction, namespace: QuestionNamespace,
  tags: readonly UserTag[], marks: readonly QuestionMark[]): Promise<void> {
  const tagStore = tx.objectStore('tags');
  for (const sent of tags) {
    const row = await request<TagRow | undefined>(tagStore.get([namespace, sent.tagId]));
    if (row?.dirty && row.updatedAt === sent.updatedAt) {
      const { dirty: _sent, ...rest } = row;
      await request(tagStore.put(rest));
    }
  }
  const markStore = tx.objectStore('marks');
  for (const sent of marks) {
    const row = await request<MarkRow | undefined>(markStore.get([namespace, markKey(sent)]));
    if (row?.dirty && row.updatedAt === sent.updatedAt) {
      const { dirty: _sent, ...rest } = row;
      await request(markStore.put(rest));
    }
  }
}

/** Last writer wins per tag and mark; merged and deleted tags leave every local mark. Returns changed mark keys. */
export async function applyRemoteAnnotations(tx: IDBTransaction, namespace: QuestionNamespace,
  response: { tags: readonly UserTag[]; marks: readonly QuestionMark[]; merged: readonly { from: string; to: string }[] }): Promise<string[]> {
  const tags = tx.objectStore('tags');
  const marks = tx.objectStore('marks');
  const changed = new Set<string>();
  const remap = new Map<string, string | null>(response.merged.map((entry) => [entry.from, entry.to]));
  for (const from of remap.keys()) await request(tags.delete([namespace, from]));

  for (const tag of response.tags) {
    const local = await request<TagRow | undefined>(tags.get([namespace, tag.tagId]));
    if (local && compareTime(local.updatedAt, tag.updatedAt) > 0) continue;
    await request(tags.put({ ...toTag(tag), namespace } satisfies TagRow));
    if (tag.deleted) remap.set(tag.tagId, null);
  }
  if (remap.size) for (const key of await removeTagsFromMarks(tx, namespace, remap)) changed.add(key);

  for (const mark of response.marks) {
    const key = markKey(mark);
    const local = await request<MarkRow | undefined>(marks.get([namespace, key]));
    if (local && compareTime(local.updatedAt, mark.updatedAt) > 0) continue;
    await request(marks.put({ ...toMark(mark), namespace, key } satisfies MarkRow));
    changed.add(key);
  }
  return [...changed];
}

/** Copies guest tags (matched by name) and marks into an account, merging with what it has. */
export async function importGuestAnnotations(tx: IDBTransaction, namespace: QuestionNamespace): Promise<number> {
  const tags = tx.objectStore('tags');
  const marks = tx.objectStore('marks');
  const accountTags = (await byNamespace<TagRow>(tags, namespace)).filter((tag) => !tag.deleted);
  const mapping = new Map<string, string>();
  for (const guest of (await byNamespace<TagRow>(tags, 'guest')).filter((tag) => !tag.deleted)) {
    const existing = accountTags.find((tag) => tag.name.toLowerCase() === guest.name.toLowerCase());
    if (existing) { mapping.set(guest.tagId, existing.tagId); continue; }
    if (accountTags.length >= ANNOTATION_LIMITS.tagsPerAccount) continue;
    const created: TagRow = { ...toTag(guest), namespace, tagId: crypto.randomUUID(), updatedAt: nextTimestamp(), dirty: 1 };
    await request(tags.put(created));
    accountTags.push(created);
    mapping.set(guest.tagId, created.tagId);
  }
  let count = 0;
  for (const guest of await byNamespace<MarkRow>(marks, 'guest')) {
    if (isEmptyMark(guest)) continue;
    const current = await request<MarkRow | undefined>(marks.get([namespace, guest.key]));
    const guestTags = guest.tagIds.flatMap((id) => mapping.get(id) ?? []);
    // Repeated imports are no-ops: a note already carried over is not appended again.
    const note = current?.note && guest.note && !current.note.includes(guest.note)
      ? `${current.note}\n\n${guest.note}`.slice(0, ANNOTATION_LIMITS.note)
      : current?.note || guest.note;
    const tagIds = [...new Set([...(current?.tagIds ?? []), ...guestTags])].slice(0, ANNOTATION_LIMITS.tagsPerQuestion);
    const favorite = Boolean(current?.favorite || guest.favorite);
    if (current && current.favorite === favorite && current.note === note && current.tagIds.length === tagIds.length) continue;
    await request(marks.put({
      ...toMark(guest), namespace, key: guest.key, favorite, note, tagIds,
      excerpt: current?.excerpt || guest.excerpt, updatedAt: nextTimestamp(current?.updatedAt), dirty: 1,
    } satisfies MarkRow));
    count++;
  }
  return count;
}
