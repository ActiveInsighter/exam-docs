import { AnnotationError, type MarkPatch, type TagInput } from './annotations';
import type { QuestionDatabase } from './database';
import {
  ANNOTATION_LIMITS, emptyMark, isEmptyMark, markKey, normalizeTagName,
  type MarkIdentity, type QuestionMark, type QuestionNamespace, type UserTag,
} from './types';

/*
 * Memory cache of the reader's tags and question marks for one namespace,
 * mirroring QuestionAnswerCache: a page loads its marks with one indexed
 * read, every component reads memory synchronously, and writes update memory
 * first and persist right after (they are discrete clicks, not keystrokes).
 *
 * Without a database (tests, storage blocked) everything stays in memory.
 */

export interface MarkSnapshot {
  mark: QuestionMark | null;
  ready: boolean;
}

export interface TagsSnapshot {
  tags: readonly UserTag[];
  ready: boolean;
}

interface MarkEntry {
  identity: MarkIdentity;
  snapshot: MarkSnapshot;
  listeners: Set<() => void>;
  /** Writes in flight; a refresh must not replace the optimistic value meanwhile. */
  pending: number;
}

const PENDING_MARK: MarkSnapshot = Object.freeze({ mark: null, ready: false });
const READY_EMPTY: MarkSnapshot = Object.freeze({ mark: null, ready: true });

const byCreation = (a: UserTag, b: UserTag) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name);

export class QuestionAnnotationCache {
  private readonly marks = new Map<string, MarkEntry>();
  private readonly documents = new Map<string, Promise<void>>();
  private tagsSnapshot: TagsSnapshot;
  private readonly tagListeners = new Set<() => void>();
  private tagsLoading: Promise<void> | null = null;
  private readonly unsubscribe: (() => void) | undefined;
  private disposed = false;

  constructor(private readonly database: QuestionDatabase | null, readonly namespace: QuestionNamespace) {
    this.tagsSnapshot = { tags: [], ready: !database };
    this.unsubscribe = database?.subscribe((change) => {
      if (change.namespace !== namespace || change.scope !== 'annotations' || this.disposed) return;
      void this.refreshTags();
      if (change.keys?.length) void this.refreshMarks(change.keys);
      else if (!change.keys) for (const path of this.documents.keys()) void this.refreshDocument(path);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
  }

  /* -------------------------------- tags -------------------------------- */

  readTags(): TagsSnapshot {
    return this.tagsSnapshot;
  }

  subscribeTags(listener: () => void): () => void {
    this.tagListeners.add(listener);
    if (!this.tagsSnapshot.ready) void this.loadTags();
    return () => { this.tagListeners.delete(listener); };
  }

  private publishTags(tags: readonly UserTag[]): void {
    this.tagsSnapshot = { tags: [...tags].filter((tag) => !tag.deleted).sort(byCreation), ready: true };
    for (const listener of this.tagListeners) listener();
  }

  private loadTags(): Promise<void> {
    return this.tagsLoading ??= this.refreshTags().finally(() => { this.tagsLoading = null; });
  }

  private async refreshTags(): Promise<void> {
    if (!this.database) return;
    try {
      const tags = await this.database.annotations.listTags(this.namespace);
      if (!this.disposed) this.publishTags(tags);
    } catch {
      if (!this.disposed && !this.tagsSnapshot.ready) this.publishTags([]);
    }
  }

  async saveTag(input: TagInput): Promise<UserTag> {
    if (this.database) {
      const saved = await this.database.annotations.saveTag(this.namespace, input);
      this.publishTags([...this.tagsSnapshot.tags.filter((tag) => tag.tagId !== saved.tagId), saved]);
      return saved;
    }
    const name = normalizeTagName(input.name);
    if (!name) throw new AnnotationError('标签名不能为空');
    if ([...name].length > ANNOTATION_LIMITS.tagName) throw new AnnotationError(`标签名最多 ${ANNOTATION_LIMITS.tagName} 个字`);
    if (this.tagsSnapshot.tags.some((tag) => tag.tagId !== input.tagId && tag.name.toLowerCase() === name.toLowerCase())) {
      throw new AnnotationError(`已有名为「${name}」的标签`);
    }
    const previous = this.tagsSnapshot.tags.find((tag) => tag.tagId === input.tagId);
    const now = new Date().toISOString();
    const saved: UserTag = { tagId: previous?.tagId ?? crypto.randomUUID(), name, color: input.color,
      createdAt: previous?.createdAt ?? now, updatedAt: now, deleted: false };
    this.publishTags([...this.tagsSnapshot.tags.filter((tag) => tag.tagId !== saved.tagId), saved]);
    return saved;
  }

  async deleteTag(tagId: string): Promise<void> {
    if (this.database) await this.database.annotations.deleteTag(this.namespace, tagId);
    this.publishTags(this.tagsSnapshot.tags.filter((tag) => tag.tagId !== tagId));
    for (const entry of this.marks.values()) {
      const mark = entry.snapshot.mark;
      if (mark?.tagIds.includes(tagId)) this.publishMark(entry, { ...mark, tagIds: mark.tagIds.filter((id) => id !== tagId) });
    }
  }

  /* -------------------------------- marks ------------------------------- */

  private entry(identity: MarkIdentity): MarkEntry {
    const key = markKey(identity);
    let entry = this.marks.get(key);
    if (!entry) {
      entry = {
        identity: { documentPath: identity.documentPath, questionId: identity.questionId },
        snapshot: this.database ? PENDING_MARK : READY_EMPTY,
        listeners: new Set(),
        pending: 0,
      };
      this.marks.set(key, entry);
    }
    return entry;
  }

  private publishMark(entry: MarkEntry, mark: QuestionMark | null): void {
    const next = mark && isEmptyMark(mark) ? null : mark;
    if (entry.snapshot.ready && entry.snapshot.mark === next) return;
    entry.snapshot = { mark: next, ready: true };
    for (const listener of entry.listeners) listener();
  }

  readMark(identity: MarkIdentity): MarkSnapshot {
    return this.marks.get(markKey(identity))?.snapshot ?? (this.database ? PENDING_MARK : READY_EMPTY);
  }

  subscribeMark(identity: MarkIdentity, listener: () => void): () => void {
    const entry = this.entry(identity);
    entry.listeners.add(listener);
    if (!entry.snapshot.ready) void this.loadDocument(identity.documentPath);
    return () => { entry.listeners.delete(listener); };
  }

  private loadDocument(documentPath: string): Promise<void> {
    let loading = this.documents.get(documentPath);
    if (!loading) {
      loading = this.refreshDocument(documentPath);
      this.documents.set(documentPath, loading);
      loading.catch(() => { if (this.documents.get(documentPath) === loading) this.documents.delete(documentPath); });
    }
    return loading;
  }

  private async refreshDocument(documentPath: string): Promise<void> {
    if (!this.database) return;
    const marks = await this.database.annotations.listDocumentMarks(this.namespace, documentPath).catch(() => [] as QuestionMark[]);
    if (this.disposed) return;
    const saved = new Map(marks.map((mark) => [markKey(mark), mark]));
    for (const [key, entry] of this.marks) {
      if (entry.identity.documentPath !== documentPath || entry.pending) continue;
      this.publishMark(entry, saved.get(key) ?? null);
    }
  }

  private async refreshMarks(keys: readonly string[]): Promise<void> {
    if (!this.database) return;
    const targets = keys.flatMap((key) => {
      const entry = this.marks.get(key);
      return entry && entry.snapshot.ready && !entry.pending ? [[key, entry] as const] : [];
    });
    if (!targets.length) return;
    try {
      const marks = await this.database.annotations.getMarks(this.namespace, targets.map(([key]) => key));
      if (this.disposed) return;
      targets.forEach(([, entry], index) => { if (!entry.pending) this.publishMark(entry, marks[index] ?? null); });
    } catch { /* keep the memory value; the next change reads again */ }
  }

  /** Optimistic: memory changes now, and is restored if the write fails. */
  async updateMark(identity: MarkIdentity, patch: MarkPatch): Promise<void> {
    const entry = this.entry(identity);
    const previous = entry.snapshot.mark;
    const base = previous ?? emptyMark(identity);
    const optimistic: QuestionMark = {
      ...base,
      ...patch,
      tagIds: patch.tagIds ? [...new Set(patch.tagIds)] : base.tagIds,
      excerpt: patch.excerpt || base.excerpt,
      updatedAt: new Date().toISOString(),
    };
    this.publishMark(entry, optimistic);
    if (!this.database) return;
    entry.pending++;
    try {
      const saved = await this.database.annotations.updateMark(this.namespace, identity, patch);
      entry.pending--;
      if (!entry.pending && !this.disposed) this.publishMark(entry, saved);
    } catch (error) {
      entry.pending--;
      if (!this.disposed) this.publishMark(entry, previous);
      throw error;
    }
  }

  /** Every non-empty mark of the namespace, for the favourites and tags overview. */
  async listMarks(): Promise<QuestionMark[]> {
    if (this.database) return this.database.annotations.listMarks(this.namespace);
    return [...this.marks.values()].flatMap((entry) => (entry.snapshot.mark ? [entry.snapshot.mark] : []));
  }
}
