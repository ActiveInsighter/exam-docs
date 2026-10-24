import { describe, expect, it } from 'vitest';
import { formatDuration } from '@/components/question-dock/stopwatch';

describe('question dock stopwatch', () => {
  it('formats elapsed time as mm:ss, adding hours past the hour', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(999)).toBe('00:00');
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('00:00');
  });
});
