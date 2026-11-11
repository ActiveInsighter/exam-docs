import { describe, expect, it, vi } from 'vitest';
import { until } from './helpers/question-store';

describe('asynchronous test polling', () => {
  it('keeps a successful observation when background work immediately changes the state again', async () => {
    const check = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    await until(check);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('waits through unsuccessful observations before accepting success', async () => {
    const check = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
    await until(check);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('still fails when no successful state is observed before the deadline', async () => {
    await expect(until(() => false, 0)).rejects.toThrow();
  });
});
