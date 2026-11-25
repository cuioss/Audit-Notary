import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { Session, Status } from '../api/types';
import {
  boot,
  bootPhase,
  completeFirstLogin,
  keepStreamAlive,
  peek,
  session,
  status,
  STREAM_RECOVERY_MS,
  streamState,
} from './app';

const STATUS: Status = { version: '1.0', degraded: false, repositories: [] };
const SESSION: Session = {
  user: { pseudonym: null, name: 'Robin' },
  rights: [],
  csrfToken: 't',
  firstLoginRequired: true,
};

function fakeClient(overrides: Partial<ApiClient>): ApiClient {
  const client = new ApiClient(() => {});
  vi.spyOn(client, 'getMessages').mockResolvedValue({});
  vi.spyOn(client, 'subscribeEvents').mockReturnValue(() => {});
  vi.spyOn(client, 'subscribeStreamState').mockReturnValue(() => {});
  Object.assign(client, overrides);
  return client;
}

describe('boot', () => {
  it('reads status, texts and session, then opens the stream', async () => {
    let listener: ((event: string, data: unknown) => void) | undefined;
    const client = fakeClient({
      getStatus: vi.fn().mockResolvedValue(STATUS),
      getSession: vi.fn().mockResolvedValue(SESSION),
    });
    vi.spyOn(client, 'subscribeEvents').mockImplementation((fn) => {
      listener = fn;
      return () => {};
    });
    const result = await boot(client);
    expect(result.firstLoginRequired).toBe(true);
    expect(get(bootPhase)).toBe('ready');
    expect(get(status)).toEqual(STATUS);
    listener?.('status', { ...STATUS, degraded: true });
    expect(get(status)?.degraded).toBe(true);
    result.stop();
  });

  it('waits for the login on a 401', async () => {
    const client = fakeClient({
      getStatus: vi.fn().mockRejectedValue(new Error('down')),
      getSession: vi.fn().mockRejectedValue(new ApiError('UNAUTHENTICATED', 401)),
    });
    await boot(client);
    expect(get(bootPhase)).toBe('signing-in');
    expect(get(status)).toBeNull();
  });

  it('fails on any other refusal of the session', async () => {
    const client = fakeClient({
      getStatus: vi.fn().mockResolvedValue(STATUS),
      getSession: vi.fn().mockRejectedValue(new ApiError('NETWORK', 0)),
    });
    await boot(client);
    expect(get(bootPhase)).toBe('failed');
  });
});

describe('completeFirstLogin', () => {
  it('ends the first login and keeps the pseudonym', () => {
    session.set(SESSION);
    completeFirstLogin('p-9');
    expect(peek(session)).toMatchObject({ firstLoginRequired: false, user: { pseudonym: 'p-9' } });
    session.set(null);
    completeFirstLogin('p-9');
    expect(peek(session)).toBeNull();
  });
});

describe('keepStreamAlive', () => {
  function client() {
    const fake = new ApiClient(() => {});
    let setState:
      ((state: 'connecting' | 'connected' | 'reconnecting' | 'offline') => void) | undefined;
    vi.spyOn(fake, 'subscribeStreamState').mockImplementation((listener) => {
      setState = listener;
      return () => {};
    });
    const retry = vi.spyOn(fake, 'retryEvents').mockImplementation(() => {});
    return {
      fake,
      retry,
      state: (value: Parameters<NonNullable<typeof setState>>[0]) => setState?.(value),
    };
  }

  it('retries an offline stream every 30 s until it is connected again', () => {
    vi.useFakeTimers();
    try {
      const { fake, retry, state } = client();
      const stop = keepStreamAlive(fake);
      state('offline');
      expect(get(streamState)).toBe('offline');
      vi.advanceTimersByTime(STREAM_RECOVERY_MS);
      expect(retry).toHaveBeenCalledTimes(1);
      state('connected');
      vi.advanceTimersByTime(STREAM_RECOVERY_MS * 3);
      expect(retry).toHaveBeenCalledTimes(1);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries at once when the browser is online again or the page becomes visible', () => {
    const { fake, retry, state } = client();
    const stop = keepStreamAlive(fake);
    state('offline');
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(retry).toHaveBeenCalledTimes(2);
    state('connected');
    window.dispatchEvent(new Event('online'));
    expect(retry).toHaveBeenCalledTimes(2);
    stop();
    state('offline');
    window.dispatchEvent(new Event('online'));
    expect(retry).toHaveBeenCalledTimes(2);
  });
});
