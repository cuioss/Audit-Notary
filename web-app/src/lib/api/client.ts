/**
 * The one client of the web app against same-origin `/api/v1` (AUN-WEB-1, AUN-WEB-8, AUN-WEB-9).
 *
 * The browser holds no token (AUN-AUTH-1): the session is a cookie the browser sends by itself. The client
 * adds the anti-CSRF header to every state-changing request, follows the login address of a `401` with
 * the current canonical address as `return`, and keeps one shared event stream.
 */
import { ApiError, isOutcome, type FieldError } from './errors';
import type {
  CatalogList,
  DirectoryEntry,
  DirectoryPrefill,
  DirectorySaved,
  DueList,
  LogoutAnswer,
  Session,
  Status,
} from './types';

/** The connection states of the event stream, which the live indicator shows. */
export type StreamState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

/** A listener of the event stream. */
export type EventListener = (event: string, data: unknown) => void;

/** The time a request may take before it fails with `TIMEOUT`. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** The pause between two attempts of a dropped event stream. */
export const STREAM_RETRY_DELAY_MS = 2_000;

/** The attempts after which the event stream reports `offline`. */
export const STREAM_RETRY_LIMIT = 10;

/** The anti-CSRF header of AUN-WEB-8. */
export const CSRF_HEADER = 'X-CSRF-Token';

/** The default login address, used when a `401` names none. */
const DEFAULT_LOGIN = '/api/v1/auth/login';

/**
 * Checks that a request path is a path of this origin.
 *
 * @param path the path
 * @throws Error for a path that could leave the origin
 */
function assertRequestPath(path: string): void {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (!path.startsWith('/api/') || path.startsWith('//') || /[\\\u0000-\u001f]/.test(path)) {
    throw new Error(`refused request path: ${path}`);
  }
}

/**
 * @param location the current location
 * @returns the address the login returns to: the current path and query
 */
function currentAddress(location: Pick<Location, 'pathname' | 'search'>): string {
  return `${location.pathname}${location.search}`;
}

/**
 * Parses one frame of the event stream.
 *
 * @param chunk the text between two blank lines
 * @returns the event and its data, or `null` for a comment or an empty frame
 */
export function parseSseChunk(chunk: string): { event: string; data: string } | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of chunk.split(/\r\n|\r|\n/)) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }
  return data.length > 0 ? { event, data: data.join('\n') } : null;
}

/**
 * The client. One instance, {@link apiClient}, serves the app; tests create their own.
 */
export class ApiClient {
  private csrfToken: string | null = null;
  private readonly listeners = new Set<EventListener>();
  private readonly stateListeners = new Set<(state: StreamState) => void>();
  private streamState: StreamState = 'offline';
  private stopStream: (() => void) | null = null;
  private retryStream: (() => void) | null = null;

  /**
   * @param navigate how the client leaves the app for the login; replaced in tests
   */
  constructor(
    private readonly navigate: (address: string) => void = (address) =>
      window.location.assign(address),
  ) {}

  /** @returns the application status (no login needed) */
  getStatus(): Promise<Status> {
    return this.request<Status>('GET', '/api/v1/status');
  }

  /**
   * @param locale the language
   * @returns the message catalogue (no login needed)
   */
  getMessages(locale: string): Promise<Record<string, string>> {
    return this.request<Record<string, string>>(
      'GET',
      `/api/v1/messages?lang=${encodeURIComponent(locale)}`,
    );
  }

  /** @returns the session; remembers its anti-CSRF token */
  async getSession(): Promise<Session> {
    const session = await this.request<Session>('GET', '/api/v1/session');
    this.csrfToken = session.csrfToken;
    return session;
  }

  /** @returns the entries of the Due lens */
  getDue(): Promise<DueList> {
    return this.request<DueList>('GET', '/api/v1/due');
  }

  /** @returns the prefill of the first-login form */
  getDirectoryMe(): Promise<DirectoryPrefill> {
    return this.request<DirectoryPrefill>('GET', '/api/v1/directory/me');
  }

  /**
   * @param catalog the catalog, `team` or `role`
   * @returns its entries
   */
  getCatalog(catalog: 'team' | 'role'): Promise<CatalogList> {
    return this.request<CatalogList>('GET', `/api/v1/catalogs/${catalog}`);
  }

  /**
   * @param entry the own directory entry
   * @returns the saved entry's pseudonym
   */
  putDirectoryMe(entry: DirectoryEntry): Promise<DirectorySaved> {
    return this.request<DirectorySaved>('PUT', '/api/v1/directory/me', entry);
  }

  /**
   * Ends the session at the server and leaves the app for the address the server names.
   */
  async logout(): Promise<void> {
    const answer = await this.request<LogoutAnswer>('POST', '/api/v1/auth/logout');
    this.csrfToken = null;
    this.closeEvents();
    this.navigate(answer.redirect);
  }

  /**
   * Sends one request.
   *
   * A state-changing request carries the anti-CSRF header; without a token the session is read first.
   * A `401` leaves the app for the login and returns to the current address.
   *
   * @param method the HTTP method
   * @param path the path below `/api/`
   * @param body the JSON body, if any
   * @returns the parsed answer
   * @throws ApiError for every refusal and failure
   */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    assertRequestPath(path);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (method !== 'GET') {
      headers[CSRF_HEADER] = await this.ensureCsrfToken();
    }
    let response: Response;
    try {
      response = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      throw new ApiError(timedOut ? 'TIMEOUT' : 'NETWORK', 0);
    }
    const parsed = await readJson(response);
    if (response.ok) {
      return parsed as T;
    }
    throw this.refusal(response.status, parsed);
  }

  private async ensureCsrfToken(): Promise<string> {
    if (this.csrfToken === null) {
      await this.getSession();
    }
    return this.csrfToken ?? '';
  }

  private refusal(status: number, body: unknown): ApiError {
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const outcome = isOutcome(record.outcome) ? record.outcome : 'UNEXPECTED';
    if (status === 401 || outcome === 'UNAUTHENTICATED') {
      this.csrfToken = null;
      const login = typeof record.login === 'string' ? record.login : DEFAULT_LOGIN;
      this.navigate(this.loginAddress(login));
      return new ApiError('UNAUTHENTICATED', status);
    }
    if (outcome === 'CSRF_REJECTED') {
      // The session's token may have changed (a new login in another tab): read it again next time.
      this.csrfToken = null;
    }
    const errors = Array.isArray(record.errors) ? (record.errors as FieldError[]) : [];
    return new ApiError(outcome, status, errors);
  }

  /**
   * @param login the login address the server named
   * @returns the login address with the current address as `return`
   */
  loginAddress(login: string): string {
    const target = login.startsWith('/') && !login.startsWith('//') ? login : DEFAULT_LOGIN;
    const separator = target.includes('?') ? '&' : '?';
    const here = typeof window === 'undefined' ? '/' : currentAddress(window.location);
    return `${target}${separator}return=${encodeURIComponent(here)}`;
  }

  /**
   * Subscribes to the shared event stream; the first subscriber opens it.
   *
   * @param listener called for every event with its parsed data
   * @returns the unsubscribe function; the last one closes the stream
   */
  subscribeEvents(listener: EventListener): () => void {
    this.listeners.add(listener);
    this.stopStream ??= this.openStream();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.closeEvents();
      }
    };
  }

  /**
   * @param listener called with every change of the stream state, and once with the current one
   * @returns the unsubscribe function
   */
  subscribeStreamState(listener: (state: StreamState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.streamState);
    return () => this.stateListeners.delete(listener);
  }

  /** Reconnects an `offline` stream at once (the shell's recovery, `keepStreamAlive`). */
  retryEvents(): void {
    this.retryStream?.();
  }

  /** Closes the event stream. */
  closeEvents(): void {
    this.stopStream?.();
    this.stopStream = null;
    this.retryStream = null;
    this.setStreamState('offline');
  }

  private setStreamState(state: StreamState): void {
    this.streamState = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  private dispatch(event: string, data: string): void {
    let parsed: unknown = data;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Not JSON: the listener gets the text.
    }
    for (const listener of this.listeners) {
      listener(event, parsed);
    }
  }

  /**
   * Reads the frames of an event stream until it ends or the stream is closed, and dispatches each event.
   *
   * @param reader the reader of the response body
   * @param isActive whether the stream is still wanted
   */
  private async readFrames(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    isActive: () => boolean,
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = '';
    while (isActive()) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/(?:\r\n|\r|\n){2}/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const parsed = parseSseChunk(frame);
        if (parsed) this.dispatch(parsed.event, parsed.data);
      }
    }
  }

  private openStream(): () => void {
    let active = true;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const schedule = (): void => {
      failures += 1;
      if (failures >= STREAM_RETRY_LIMIT) {
        this.setStreamState('offline');
        return;
      }
      this.setStreamState('reconnecting');
      timer = setTimeout(() => {
        timer = null;
        void connect();
      }, STREAM_RETRY_DELAY_MS);
    };

    const connect = async (): Promise<void> => {
      if (!active) return;
      controller = new AbortController();
      this.setStreamState(failures === 0 ? 'connecting' : 'reconnecting');
      try {
        const response = await fetch('/api/v1/events', {
          headers: { Accept: 'text/event-stream' },
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (response.status === 401) {
          active = false;
          this.setStreamState('offline');
          this.navigate(this.loginAddress(DEFAULT_LOGIN));
          return;
        }
        if (!response.ok || !response.body) {
          throw new Error(`event stream refused: ${response.status}`);
        }
        this.setStreamState('connected');
        failures = 0;
        await this.readFrames(response.body.getReader(), () => active);
        if (active) schedule();
      } catch {
        if (active) schedule();
      }
    };

    this.retryStream = () => {
      if (!active || this.streamState !== 'offline') return;
      failures = 0;
      void connect();
    };

    void connect();

    return () => {
      active = false;
      if (timer !== null) clearTimeout(timer);
      controller?.abort();
    };
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The client of the app. */
export const apiClient = new ApiClient();
