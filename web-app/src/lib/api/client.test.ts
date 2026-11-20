import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClient,
  CSRF_HEADER,
  STREAM_RETRY_LIMIT,
  parseSseChunk,
  type StreamState,
} from './client';
import { ApiError } from './errors';

/** A JSON answer. */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** An event-stream answer that sends the given frames and stays open until aborted. */
function stream(frames: string[], signal?: AbortSignal | null): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      signal?.addEventListener('abort', () =>
        controller.error(new DOMException('aborted', 'AbortError')),
      );
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const SESSION = {
  user: { pseudonym: 'p-1', name: 'Alex' },
  rights: [],
  csrfToken: 'token-1',
  firstLoginRequired: false,
};

let fetchMock: ReturnType<typeof vi.fn>;
let navigate: ReturnType<typeof vi.fn>;
let client: ApiClient;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  navigate = vi.fn();
  client = new ApiClient(navigate as unknown as (address: string) => void);
  window.history.replaceState(null, '', '/samm/payments?x=1');
});

afterEach(() => {
  client.closeEvents();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('requests', () => {
  it('reads the status, the texts, the due list, the prefill and the catalogs with GET', async () => {
    fetchMock.mockImplementation(async () => json(200, { ok: true }));
    await client.getStatus();
    await client.getMessages('de');
    await client.getDue();
    await client.getDirectoryMe();
    await client.getCatalog('team');
    const paths = fetchMock.mock.calls.map((call) => call[0]);
    expect(paths).toEqual([
      '/api/v1/status',
      '/api/v1/messages?lang=de',
      '/api/v1/due',
      '/api/v1/directory/me',
      '/api/v1/catalogs/team',
    ]);
    for (const call of fetchMock.mock.calls) {
      expect(call[1].method).toBe('GET');
      expect(call[1].headers[CSRF_HEADER]).toBeUndefined();
    }
  });

  it('reads the session first and sends its token with a state-changing request', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, SESSION))
      .mockResolvedValueOnce(json(200, { outcome: 'SAVED', pseudonym: 'p-2' }));
    const saved = await client.putDirectoryMe({ name: 'Alex', team: 't', role: 'r' });
    expect(saved.pseudonym).toBe('p-2');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/session');
    const [path, init] = fetchMock.mock.calls[1];
    expect(path).toBe('/api/v1/directory/me');
    expect(init.method).toBe('PUT');
    expect(init.headers[CSRF_HEADER]).toBe('token-1');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ name: 'Alex', team: 't', role: 'r' });
  });

  it('follows the login address of a 401 with the current address as return', async () => {
    fetchMock.mockResolvedValue(
      json(401, { outcome: 'UNAUTHENTICATED', login: '/api/v1/auth/login' }),
    );
    await expect(client.getDue()).rejects.toMatchObject({ outcome: 'UNAUTHENTICATED' });
    expect(navigate).toHaveBeenCalledWith(
      `/api/v1/auth/login?return=${encodeURIComponent('/samm/payments?x=1')}`,
    );
  });

  it('never follows a login address of another origin', () => {
    expect(client.loginAddress('https://evil.example/login')).toMatch(
      /^\/api\/v1\/auth\/login\?return=/,
    );
    expect(client.loginAddress('/login?x=1')).toMatch(/^\/login\?x=1&return=/);
  });

  it('reports refusals by their outcome with the field errors', async () => {
    fetchMock.mockResolvedValueOnce(json(200, SESSION)).mockResolvedValueOnce(
      json(422, {
        outcome: 'VALIDATION',
        errors: [{ pointer: '/team', code: 'REFERENCE_NOT_FOUND' }],
      }),
    );
    const error = (await client
      .putDirectoryMe({ name: 'a', team: 'x', role: 'y' })
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.outcome).toBe('VALIDATION');
    expect(error.status).toBe(422);
    expect(error.errors).toEqual([{ pointer: '/team', code: 'REFERENCE_NOT_FOUND' }]);
  });

  it('reads the session again after a CSRF refusal', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, SESSION))
      .mockResolvedValueOnce(json(403, { outcome: 'CSRF_REJECTED' }))
      .mockResolvedValueOnce(json(200, { ...SESSION, csrfToken: 'token-2' }))
      .mockResolvedValueOnce(json(200, { outcome: 'SAVED', pseudonym: 'p' }));
    await expect(client.putDirectoryMe({ name: 'a', team: 'b', role: 'c' })).rejects.toMatchObject({
      outcome: 'CSRF_REJECTED',
    });
    await client.putDirectoryMe({ name: 'a', team: 'b', role: 'c' });
    expect(fetchMock.mock.calls[3][1].headers[CSRF_HEADER]).toBe('token-2');
  });

  it('names an answer without an outcome UNEXPECTED, and a missing network NETWORK', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 500 }));
    await expect(client.getDue()).rejects.toMatchObject({ outcome: 'UNEXPECTED', status: 500 });
    fetchMock.mockRejectedValueOnce(new TypeError('failed'));
    await expect(client.getDue()).rejects.toMatchObject({ outcome: 'NETWORK', status: 0 });
    fetchMock.mockRejectedValueOnce(new DOMException('slow', 'TimeoutError'));
    await expect(client.getDue()).rejects.toMatchObject({ outcome: 'TIMEOUT' });
  });

  it('answers null for an empty body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    await expect(client.getDue()).resolves.toBeNull();
  });

  it('refuses a path that could leave the origin', async () => {
    await expect(client.request('GET', '//evil.example/x')).rejects.toThrow('refused request path');
    await expect(client.request('GET', '/other')).rejects.toThrow('refused request path');
  });

  it('logs out and leaves for the address the server names', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, SESSION))
      .mockResolvedValueOnce(json(200, { redirect: 'https://idp.example/logout' }));
    await client.logout();
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(navigate).toHaveBeenCalledWith('https://idp.example/logout');
  });
});

describe('the event stream', () => {
  it('parses frames, comments and multi-line data', () => {
    expect(parseSseChunk('event: status\ndata: {"a":1}')).toEqual({
      event: 'status',
      data: '{"a":1}',
    });
    expect(parseSseChunk('data: a\ndata: b')).toEqual({ event: 'message', data: 'a\nb' });
    expect(parseSseChunk(': keepalive')).toBeNull();
  });

  it('shares one stream, dispatches parsed events and reports its state', async () => {
    fetchMock.mockImplementation(async (_path: string, init: RequestInit) =>
      stream(
        ['id: 1\nevent: document-saved\ndata: {"id":"x"}\n\n', 'event: note\ndata: text\n\n'],
        init.signal,
      ),
    );
    const states: StreamState[] = [];
    client.subscribeStreamState((state) => states.push(state));
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = client.subscribeEvents(first);
    client.subscribeEvents(second);
    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith('document-saved', { id: 'x' });
    expect(first).toHaveBeenCalledWith('note', 'text');
    expect(states).toEqual(['offline', 'connecting', 'connected']);
    stopFirst();
  });

  it('leaves for the login when the stream is refused with 401', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    client.subscribeEvents(() => {});
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it('reconnects a dropped stream and reports offline after the retry limit', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    const states: StreamState[] = [];
    client.subscribeStreamState((state) => states.push(state));
    const stop = client.subscribeEvents(() => {});
    for (let attempt = 0; attempt < STREAM_RETRY_LIMIT; attempt++) {
      await vi.advanceTimersByTimeAsync(2_000);
    }
    expect(states.at(-1)).toBe('offline');
    expect(states).toContain('reconnecting');
    const calls = fetchMock.mock.calls.length;
    client.retryEvents();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.calls).toHaveLength(calls + 1);
    stop();
  });
});
