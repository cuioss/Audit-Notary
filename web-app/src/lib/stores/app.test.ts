import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, type StreamState } from '../api/client';
import { ApiError } from '../api/errors';
import type { Session, Status } from '../api/types';
import { scenarioFetch } from '../test/scenarioFetch';
import {
  boot,
  bootOutsideShell,
  bootPhase,
  completeFirstLogin,
  keepStreamAlive,
  peek,
  session,
  status,
  STREAM_RECOVERY_MS,
  streamState,
  watchSession,
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
    let setState: ((state: StreamState) => void) | undefined;
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

describe('bootOutsideShell', () => {
  it('reads the status and the texts and never the session', async () => {
    const getSession = vi.fn();
    const client = fakeClient({ getStatus: vi.fn().mockResolvedValue(STATUS), getSession });
    await bootOutsideShell(client);
    expect(get(bootPhase)).toBe('outside');
    expect(get(status)).toEqual(STATUS);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('starts without a status too', async () => {
    const client = fakeClient({ getStatus: vi.fn().mockRejectedValue(new Error('down')) });
    await bootOutsideShell(client);
    expect(get(bootPhase)).toBe('outside');
    expect(get(status)).toBeNull();
  });
});

describe('a session that is replaced or ended (UC-ACC-6), against workshop', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    session.set(null);
  });

  /**
   * Starts the app against the workshop profile with an event stream the test closes by hand.
   *
   * @returns the scenario, the client, the navigation and reload spies and the function that closes the stream
   */
  async function start() {
    const scenario = scenarioFetch('workshop');
    let closeStream: () => void = () => {};
    const events = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          closeStream = () => controller.close();
        },
      });
      return new Response(body, { status: 200 });
    });
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input) === '/api/v1/events' ? events() : scenario.fetch(input, init),
    );
    const navigate = vi.fn();
    const client = new ApiClient(navigate);
    const reload = vi.fn();
    const result = await boot(client, reload);
    await vi.waitFor(() => expect(events).toHaveBeenCalled());
    return { scenario, client, navigate, reload, result, events, close: () => closeStream() };
  }

  it('reloads the tab when the stream closes and the session has another anti-CSRF token', async () => {
    const { scenario, reload, result, close } = await start();
    expect(peek(session)?.csrfToken).toBe('scenario-token');
    scenario.goto('session-replaced');
    close();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    result.stop();
  });

  it('goes on with the same session when the token is the one the tab started with', async () => {
    const { reload, result, events, close } = await start();
    close();
    await vi.waitFor(() => expect(events).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reload).not.toHaveBeenCalled();
    expect(peek(session)?.user.name).toBe('Alex Example');
    result.stop();
  });

  it('leaves for the login when the session ended', async () => {
    const { scenario, navigate, reload, result, close } = await start();
    scenario.goto('session-ended');
    close();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(navigate.mock.calls[0][0]).toMatch(/^\/api\/v1\/auth\/login\?return=/);
    expect(reload).not.toHaveBeenCalled();
    result.stop();
  });

  it('reads the session once at a time and ignores a read that fails', async () => {
    const client = new ApiClient(() => {});
    let end: () => void = () => {};
    vi.spyOn(client, 'subscribeStreamEnd').mockImplementation((listener) => {
      end = listener;
      return () => {};
    });
    const getSession = vi
      .spyOn(client, 'getSession')
      .mockRejectedValueOnce(new ApiError('NETWORK', 0))
      .mockResolvedValue({ ...SESSION, csrfToken: 'again' });
    session.set(SESSION);
    const reload = vi.fn();
    watchSession(client, reload);
    end();
    end();
    await vi.waitFor(() => expect(getSession).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    end();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(getSession).toHaveBeenCalledTimes(2);
  });
});
