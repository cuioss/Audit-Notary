import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { Session, Status } from '../api/types';
import { boot, bootPhase, completeFirstLogin, peek, session, status } from './app';

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
