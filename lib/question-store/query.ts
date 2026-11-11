/** A transient, subscribed view of one source. Persistence stays in QuestionDatabase. */
export interface QuestionQuerySnapshot<T> {
  data: T | null;
  error: string | null;
}

export interface QuestionQuery<T> {
  getSnapshot(): QuestionQuerySnapshot<T>;
  subscribe(listener: () => void): () => void;
  refresh(): void;
}

export const PENDING_QUERY = Object.freeze({ data: null, error: null });

/**
 * Create a new query for each database/namespace or cache identity. Subscribe
 * before reading, ignore superseded reads, and release results when unused.
 */
export function createQuestionQuery<T>({ load, subscribe, errorMessage, delay = 0 }: {
  load(): Promise<T>;
  subscribe(listener: () => void): () => void;
  errorMessage: string;
  delay?: number;
}): QuestionQuery<T> {
  let snapshot: QuestionQuerySnapshot<T> = PENDING_QUERY;
  const listeners = new Set<() => void>();
  let revision = 0;
  let detach: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const publish = (next: QuestionQuerySnapshot<T>) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const refresh = async () => {
    const request = ++revision;
    try {
      const data = await load();
      if (listeners.size && request === revision) publish({ data, error: null });
    } catch {
      if (listeners.size && request === revision) publish({ data: snapshot.data, error: errorMessage });
    }
  };
  const changed = () => {
    // Invalidate immediately, including while a debounced reload is waiting.
    revision++;
    clearTimeout(timer);
    if (delay) timer = setTimeout(() => { void refresh(); }, delay);
    else void refresh();
  };

  return {
    getSnapshot: () => snapshot,
    refresh: () => { if (listeners.size) void refresh(); },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        detach = subscribe(changed);
        void refresh();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        revision++;
        clearTimeout(timer);
        detach?.();
        detach = undefined;
        snapshot = PENDING_QUERY;
      };
    },
  };
}
