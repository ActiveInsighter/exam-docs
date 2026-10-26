import { buildMark, buildTag, type MarkPatch, type TagInput } from './annotations';
import type { QuestionDatabase } from './database';
import type { Outbox } from './outbox';
import {
  compareTime, emptyMark, isEmptyMark, markKey, nextTimestamp,
  type MarkIdentity, type QuestionMark, type QuestionNamespace, type SyncResponse, type UserTag,
} from './types';

/*
 * Memory cache of the reader's tags and question marks for one namespace,
 * mirroring QuestionAnswerCache: a page loads its marks with one indexed
 * read and every component reads memory synchronously.
 *
 * Writes are discrete clicks: the new value is checked and shown at once,
 * stored and then handed to the sync outbox (accounts). If the browser
 * database refuses it, a guest's change is rolled back with an error; an
 * account's change stays, because the cloud still receives it.
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
  /** Write time of the shown mark (also of an emptied one). */
  updatedAt: string;
  listeners: Set<() => void>;
  /** Writes in flight; a refresh must not replace the optimistic value meanwhile. */
  pending: number;
}

const PENDING_MARK: MarkSnapshot = Object.freeze({ mark: null, ready: false });
const READY_EMPTY: MarkSnapshot = Object.freeze({ mark: null, ready: true });

const byCreation = (a: UserTag, b: UserTag) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name);

export interface QuestionAnnotationCacheOptions {
  /** Receives an account's changed tags and marks. */
  outbox?: Outbox | null;
}

export class QuestionAnnotationCache {
  private readonly marks = new Map<string, MarkEntry>();
  private readonly documents = new Map<string, Promise<void>>();
  private tagsSnapshot: TagsSnapshot;
  private readonly tagListeners = new Set<() => void>();
  private tagsLoading: Promise<void> | null = null;
  private readonly unsubscribe: (() => void) | undefined;
  private readonly outbox: Outbox | null;
  private disposed = false;
  private pruneQueued = false;

  constructor(private readonly database: QuestionDatabase | null, readonly namespace: QuestionNamespace,
    options: QuestionAnnotationCacheOptions = {}) {
    this.outbox = namespace === 'guest' ? null : options.outbox ?? null;
    this.tagsSnapshot = { tags: [], ready: !database };
    this.unsubscribe = database?.subscribe((change) => {
      if (change.namespace !== namespace || change.scope !== 'annotations' || this.disposed ||
        (change.tab === database.tab && change.origin !== 'import')) return;
      void this.refreshTags();
      if (change.keys?.length) void this.refreshMarks(change.keys);
      else if (!change.keys) for (const path of new Set([...this.marks.values()].map((entry) => entry.identity.documentPath))) void this.loadDocument(path);
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
    this.tagsSnapshot = { tags: tags.filter((tag) => !tag.deleted).sort(byCreation), ready: true };
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

  /** Stores a tag change; on failure a guest's change is undone and the error rethrown. */
  private async persistTag(tag: UserTag, undo: () => void): Promise<void> {
    try {
      await this.database?.annotations.putTag(this.namespace, tag);
    } catch (error) {
      if (!this.outbox) {
        if (!this.disposed) undo();
        throw error;
      }
    }
    // Stored first, then uploaded; a refused local write of an account still uploads.
    this.outbox?.put({ tags: [tag] });
  }

  async saveTag(input: TagInput): Promise<UserTag> {
    if (!this.tagsSnapshot.ready) await this.loadTags();
    const before = this.tagsSnapshot.tags;
    const saved = buildTag(input, before);
    this.publishTags([...before.filter((tag) => tag.tagId !== saved.tagId), saved]);
    await this.persistTag(saved, () => this.publishTags(before));
    return saved;
  }

  async deleteTag(tagId: string): Promise<void> {
    if (!this.tagsSnapshot.ready) await this.loadTags();
    const before = this.tagsSnapshot.tags;
    const tag = before.find((entry) => entry.tagId === tagId);
    if (!tag) return;
    const removed = new Map<MarkEntry, QuestionMark>();
    this.publishTags(before.filter((entry) => entry.tagId !== tagId));
    for (const entry of this.marks.values()) {
      const mark = entry.snapshot.mark;
      if (!mark?.tagIds.includes(tagId)) continue;
      removed.set(entry, mark);
      this.publishMark(entry, { ...mark, tagIds: mark.tagIds.filter((id) => id !== tagId) }, entry.updatedAt);
    }
    await this.persistTag({ ...tag, deleted: true, updatedAt: nextTimestamp(tag.updatedAt) }, () => {
      this.publishTags(before);
      for (const [entry, mark] of removed) this.publishMark(entry, mark, entry.updatedAt);
    });
  }

  /* -------------------------------- marks ------------------------------- */

  private entry(identity: MarkIdentity): MarkEntry {
    const key = markKey(identity);
    let entry = this.marks.get(key);
    if (!entry) {
      entry = {
        identity: { documentPath: identity.documentPath, questionId: identity.questionId },
        snapshot: this.database ? PENDING_MARK : READY_EMPTY,
        updatedAt: '',
        listeners: new Set(),
        pending: 0,
      };
      this.marks.set(key, entry);
    }
    return entry;
  }

  private publishMark(entry: MarkEntry, mark: QuestionMark | null, updatedAt: string): void {
    entry.updatedAt = updatedAt;
    const next = mark && isEmptyMark(mark) ? null : mark;
    if (entry.snapshot.ready && entry.snapshot.mark === next) return;
    entry.snapshot = { mark: next, ready: true };
    for (const listener of entry.listeners) listener();
  }

  /** Takes a stored or cloud mark unless the shown one is newer. */
  private adoptMark(entry: MarkEntry, mark: QuestionMark | null): void {
    if (entry.pending) return;
    if (mark && entry.snapshot.ready && entry.updatedAt && compareTime(entry.updatedAt, mark.updatedAt) > 0) return;
    this.publishMark(entry, mark, mark?.updatedAt ?? entry.updatedAt);
  }

  readMark(identity: MarkIdentity): MarkSnapshot {
    return this.marks.get(markKey(identity))?.snapshot ?? (this.database ? PENDING_MARK : READY_EMPTY);
  }

  private prune(): void {
    if (!this.database || this.pruneQueued) return;
    this.pruneQueued = true;
    queueMicrotask(() => {
      this.pruneQueued = false;
      for (const [key, entry] of this.marks) {
        if (!entry.listeners.size && !entry.pending) this.marks.delete(key);
      }
    });
  }

  subscribeMark(identity: MarkIdentity, listener: () => void): () => void {
    const entry = this.entry(identity);
    entry.listeners.add(listener);
    if (!entry.snapshot.ready) void this.loadDocument(identity.documentPath);
    return () => { entry.listeners.delete(listener); this.prune(); };
  }

  private loadDocument(documentPath: string): Promise<void> {
    let loading = this.documents.get(documentPath);
    if (!loading) {
      loading = this.readDocument(documentPath);
      this.documents.set(documentPath, loading);
      void loading.finally(() => {
        if (this.documents.get(documentPath) === loading) this.documents.delete(documentPath);
        this.prune();
      });
    }
    return loading;
  }

  private async readDocument(documentPath: string): Promise<void> {
    if (!this.database) return;
    const marks = await this.database.annotations.listDocumentMarks(this.namespace, documentPath).catch(() => [] as QuestionMark[]);
    if (this.disposed) return;
    const saved = new Map(marks.map((mark) => [markKey(mark), mark]));
    for (const [key, entry] of this.marks) {
      if (entry.identity.documentPath !== documentPath) continue;
      const mark = saved.get(key);
      if (mark) this.adoptMark(entry, mark);
      else if (!entry.snapshot.ready) this.publishMark(entry, null, '');
    }
  }

  private async refreshMarks(keys: readonly string[]): Promise<void> {
    if (!this.database) return;
    const targets = keys.flatMap((key) => {
      const entry = this.marks.get(key);
      return entry && entry.snapshot.ready && !entry.pending ? [entry] : [];
    });
    if (!targets.length) return;
    try {
      const marks = await this.database.annotations.getMarks(this.namespace, targets.map((entry) => markKey(entry.identity)));
      if (this.disposed) return;
      targets.forEach((entry, index) => { if (marks[index]) this.adoptMark(entry, marks[index]); });
    } catch { /* keep the memory value; the next change reads again */ }
  }

  /** Cloud rows, straight from the sync engine; last writer wins against what is shown. */
  mergeRemote(response: Pick<SyncResponse, 'tags' | 'marks' | 'merged'>): void {
    if (this.disposed) return;
    const remap = new Map<string, string | null>(response.merged.map((entry) => [entry.from, entry.to]));
    if (this.tagsSnapshot.ready && (response.tags.length || remap.size)) {
      const tags = new Map(this.tagsSnapshot.tags.map((tag) => [tag.tagId, tag]));
      for (const from of remap.keys()) tags.delete(from);
      for (const tag of response.tags) {
        const current = tags.get(tag.tagId);
        if (current && compareTime(current.updatedAt, tag.updatedAt) > 0) continue;
        if (tag.deleted) { tags.delete(tag.tagId); remap.set(tag.tagId, null); } else tags.set(tag.tagId, tag);
      }
      this.publishTags([...tags.values()]);
    } else {
      for (const tag of response.tags) if (tag.deleted) remap.set(tag.tagId, null);
    }
    if (remap.size) {
      for (const entry of this.marks.values()) {
        const mark = entry.snapshot.mark;
        if (!mark?.tagIds.some((id) => remap.has(id))) continue;
        const tagIds = [...new Set(mark.tagIds.flatMap((id) => { const to = remap.has(id) ? remap.get(id) : id; return to ? [to] : []; }))];
        this.publishMark(entry, { ...mark, tagIds }, entry.updatedAt);
      }
    }
    for (const mark of response.marks) {
      const entry = this.marks.get(markKey(mark));
      if (entry) this.adoptMark(entry, mark);
    }
  }

  /** Optimistic: memory changes now; a guest's change is restored if storing it fails. */
  async updateMark(identity: MarkIdentity, patch: MarkPatch): Promise<void> {
    const entry = this.entry(identity);
    const previous = entry.snapshot.mark;
    const previousAt = entry.updatedAt;
    const base = previous ?? { ...emptyMark(identity), ...(previousAt ? { updatedAt: previousAt } : {}) };
    const live = this.tagsSnapshot.ready ? new Set(this.tagsSnapshot.tags.map((tag) => tag.tagId)) : null;
    const next = buildMark(base, patch, live);
    this.publishMark(entry, next, next.updatedAt);
    entry.pending++;
    try {
      await this.database?.annotations.putMark(this.namespace, next);
    } catch (error) {
      if (!this.outbox) {
        if (!this.disposed) this.publishMark(entry, previous, previousAt);
        throw error;
      }
    } finally {
      entry.pending--;
      this.prune();
    }
    // Stored first, then uploaded; a refused local write of an account still uploads.
    this.outbox?.put({ marks: [next] });
  }

  /** Every non-empty mark of the namespace, for the favourites and tags overview. */
  async listMarks(): Promise<QuestionMark[]> {
    if (this.database) return this.database.annotations.listMarks(this.namespace);
    return [...this.marks.values()].flatMap((entry) => (entry.snapshot.mark ? [entry.snapshot.mark] : []));
  }
}
