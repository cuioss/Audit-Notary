import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOCK_TICK_MS, now } from './clock';

afterEach(() => vi.useRealTimers());

describe('now', () => {
  it('ticks every minute while subscribed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-25T09:00:00Z'));
    const seen: Date[] = [];
    const stop = now.subscribe((value) => seen.push(value));
    vi.advanceTimersByTime(CLOCK_TICK_MS);
    expect(seen.at(-1)?.toISOString()).toBe('2026-11-25T09:01:00.000Z');
    stop();
  });

  it('gives the present to a one-off read', () => {
    expect(get(now)).toBeInstanceOf(Date);
  });
});
