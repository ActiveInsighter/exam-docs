import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQuestionQuery } from '@/lib/question-store/query';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

describe('scoped question queries', () => {
  function setup(delay = 0) {
    const reads: ReturnType<typeof deferred<string[]>>[] = [];
    let changed = () => {};
    const detach = vi.fn();
    const query = createQuestionQuery({
      load: () => { const read = deferred<string[]>(); reads.push(read); return read.promise; },
      subscribe: (listener) => { changed = listener; return detach; },
      errorMessage: 'read failed', delay,
    });
    return { query, reads, changed: () => changed(), detach };
  }

  it('ignores an earlier read that finishes after its replacement', async () => {
    const { query, reads, changed } = setup();
    const off = query.subscribe(() => {});
    changed();
    reads[1].resolve(['latest']); await flush();
    reads[0].resolve(['obsolete']); await flush();
    expect(query.getSnapshot().data).toEqual(['latest']); off();
  });

  it('invalidates an in-flight result immediately, before the debounce expires', async () => {
    vi.useFakeTimers();
    const { query, reads, changed } = setup(120);
    const off = query.subscribe(() => {});
    changed(); changed(); changed();
    reads[0].resolve(['before write']); await flush();
    expect(query.getSnapshot().data).toBeNull();
    await vi.advanceTimersByTimeAsync(120);
    expect(reads).toHaveLength(2);
    reads[1].resolve(['after write']); await flush();
    expect(query.getSnapshot().data).toEqual(['after write']); off();
  });

  it('retains only this source\'s data on refresh failure and supports retry', async () => {
    const { query, reads } = setup();
    const off = query.subscribe(() => {});
    reads[0].resolve(['saved']); await flush();
    query.refresh(); reads[1].reject(new Error('storage failed')); await flush();
    expect(query.getSnapshot()).toEqual({ data: ['saved'], error: 'read failed' });
    query.refresh(); reads[2].resolve(['recovered']); await flush();
    expect(query.getSnapshot()).toEqual({ data: ['recovered'], error: null }); off();
  });

  it('releases results, listeners and delayed work when the last reader leaves', async () => {
    vi.useFakeTimers();
    const { query, reads, changed, detach } = setup(120);
    const listener = vi.fn();
    const off = query.subscribe(listener);
    changed(); off();
    reads[0].resolve(['left behind']); await flush();
    await vi.advanceTimersByTimeAsync(500);
    expect(reads).toHaveLength(1);
    expect(listener).not.toHaveBeenCalled();
    expect(detach).toHaveBeenCalledOnce();
    expect(query.getSnapshot()).toEqual({ data: null, error: null });
  });

  it('shares a read between simultaneous subscribers and reloads on remount', async () => {
    const { query, reads, detach } = setup();
    const a = query.subscribe(() => {}); const b = query.subscribe(() => {});
    expect(reads).toHaveLength(1);
    a(); expect(detach).not.toHaveBeenCalled();
    b(); const c = query.subscribe(() => {});
    reads[0].resolve(['unmounted']); await flush();
    expect(query.getSnapshot().data).toBeNull();
    reads[1].resolve(['remounted']); await flush();
    expect(query.getSnapshot().data).toEqual(['remounted']); c();
  });

  it('attaches the change feed before the initial read starts', async () => {
    const order: string[] = [];
    const query = createQuestionQuery({
      load: async () => { order.push('read'); return []; },
      subscribe: () => { order.push('subscribe'); return () => {}; }, errorMessage: 'failed',
    });
    const off = query.subscribe(() => {});
    expect(order).toEqual(['subscribe', 'read']); await flush(); off();
  });
});
