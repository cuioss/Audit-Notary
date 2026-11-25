/**
 * The state the shell shares: the session, the application status and the state of the event stream.
 */
import { writable, type Readable } from 'svelte/store';
import { apiClient, type ApiClient, type StreamState } from '../api/client';
import { isApiError } from '../api/errors';
import type { Session, Status } from '../api/types';
import { initI18n } from '../i18n';

/** The session; `null` until it is read. */
export const session = writable<Session | null>(null);

/** The application status; `null` until it is read or when it cannot be read. */
export const status = writable<Status | null>(null);

/** The state of the shared event stream. */
export const streamState = writable<StreamState>('offline');

/** The phases of the start. */
export type BootPhase = 'starting' | 'ready' | 'signing-in' | 'failed' | 'outside';

/** Where the start is. */
export const bootPhase = writable<BootPhase>('starting');

/** The result of {@link boot}. */
export interface BootResult {
  /** Whether the user must save the own directory entry first (AUN-DIR-2). */
  firstLoginRequired: boolean;
  /** Ends the subscriptions the start opened. */
  stop: () => void;
}

/**
 * Reads the status and the texts, which need no login.
 *
 * @param client the client
 */
async function readStatusAndTexts(client: ApiClient): Promise<void> {
  let version: string | null = null;
  try {
    const current = await client.getStatus();
    status.set(current);
    version = current.version;
  } catch {
    status.set(null);
  }
  await initI18n(version);
}

/**
 * Starts an address outside the shell (`/login`, `/signed-out`, `/login-problem`): only the status and the texts are
 * read, never the session, so opening the page neither needs nor creates one
 * (doc/specification/rest-api.adoc, Addresses Outside the Shell).
 *
 * @param client the client, {@link apiClient} by default
 */
export async function bootOutsideShell(client: ApiClient = apiClient): Promise<void> {
  bootPhase.set('starting');
  await readStatusAndTexts(client);
  bootPhase.set('outside');
}

/**
 * Starts the app: status, texts, session, event stream (AUN-WEB-9).
 *
 * The status and the texts need no login, so the login screen of a `401` is never without texts.
 *
 * @param client the client, {@link apiClient} by default
 * @param reload reloads the tab at its address, replaced in tests
 * @returns what the shell needs to route the first view
 */
export async function boot(
  client: ApiClient = apiClient,
  reload: () => void = () => window.location.reload(),
): Promise<BootResult> {
  bootPhase.set('starting');
  await readStatusAndTexts(client);
  try {
    const current = await client.getSession();
    session.set(current);
  } catch (error) {
    bootPhase.set(
      isApiError(error) && error.outcome === 'UNAUTHENTICATED' ? 'signing-in' : 'failed',
    );
    return { firstLoginRequired: false, stop: () => {} };
  }
  const stopState = keepStreamAlive(client);
  const stopWatch = watchSession(client, reload);
  const stopEvents = client.subscribeEvents((event, data) => {
    if (event === 'status' && data && typeof data === 'object') {
      status.set(data as Status);
    }
  });
  bootPhase.set('ready');
  let firstLoginRequired = false;
  session.subscribe((value) => {
    firstLoginRequired = value?.firstLoginRequired ?? false;
  })();
  return {
    firstLoginRequired,
    stop: () => {
      stopEvents();
      stopWatch();
      stopState();
    },
  };
}

/** The pause before a failed session read is repeated while the event stream is connected. */
export const SESSION_RETRY_MS = 5_000;

/**
 * Reads the session again after the event stream closed, and reloads the tab when it is another session (UC-ACC-6,
 * doc/specification/rest-api.adoc, A Session That Is Replaced): the stream belongs to its session and closes with it.
 *
 * - `401`: the client leaves for the login by itself.
 * - The same `csrfToken` the tab started with: a transient break, the stream opens again by itself.
 * - Another `csrfToken`: a new login in the same browser replaced the session (PROVISIONAL: the token is the
 *   identity of a session), so the tab reloads at its address and shows the new session.
 * - A read that fails otherwise (network, timeout) is repeated once the stream is `connected` again, or after
 *   {@link SESSION_RETRY_MS} when it is connected already: a reconnecting stream emits no end, so nothing else would
 *   read the session of the tab again.
 *
 * @param client the client
 * @param reload reloads the tab at its address
 * @returns the function that stops watching
 */
export function watchSession(client: ApiClient, reload: () => void): () => void {
  let reading = false;
  let stopped = false;
  let retryPending = false;
  let state: StreamState = 'offline';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const read = (): void => {
    if (reading || stopped) return;
    reading = true;
    retryPending = false;
    clearTimer();
    const known = peek(session)?.csrfToken;
    client
      .getSession()
      .then((current) => {
        if (known !== undefined && current.csrfToken !== known) {
          reload();
        } else {
          session.set(current);
        }
      })
      .catch((error: unknown) => {
        // `401` already led to the login; any other failure is read again once the stream is back.
        if (stopped || (isApiError(error) && error.outcome === 'UNAUTHENTICATED')) return;
        retryPending = true;
        if (state === 'connected') timer = setTimeout(read, SESSION_RETRY_MS);
      })
      .finally(() => {
        reading = false;
      });
  };

  const stopEnd = client.subscribeStreamEnd(read);
  const stopState = client.subscribeStreamState((next) => {
    state = next;
    if (next === 'connected' && retryPending) read();
  });
  return () => {
    stopped = true;
    clearTimer();
    stopEnd();
    stopState();
  };
}

/** The pause between two attempts to bring an `offline` event stream back. */
export const STREAM_RECOVERY_MS = 30_000;

/**
 * Follows the state of the event stream and brings an `offline` stream back by itself: every
 * {@link STREAM_RECOVERY_MS}, when the browser is online again and when the page becomes visible. The shell shows no
 * connection state (owner's decision), so nobody would press a "Try again"; saves by others (AUN-WEB-5) and the
 * status events must arrive again without a reload.
 *
 * @param client the client
 * @returns the function that stops following
 */
export function keepStreamAlive(client: ApiClient): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let offline = false;
  const retry = () => {
    if (offline) client.retryEvents();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') retry();
  };
  const stopState = client.subscribeStreamState((state) => {
    streamState.set(state);
    offline = state === 'offline';
    if (offline && timer === null) {
      timer = setInterval(retry, STREAM_RECOVERY_MS);
    } else if (!offline && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  });
  window.addEventListener('online', retry);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopState();
    if (timer !== null) clearInterval(timer);
    window.removeEventListener('online', retry);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/**
 * Marks the first login as done after the own entry was saved.
 *
 * @param pseudonym the pseudonym of the saved entry
 */
export function completeFirstLogin(pseudonym: string): void {
  session.update((value) =>
    value ? { ...value, firstLoginRequired: false, user: { ...value.user, pseudonym } } : value,
  );
}

/**
 * @param store a store
 * @returns its current value
 */
export function peek<T>(store: Readable<T>): T {
  let value!: T;
  store.subscribe((current) => {
    value = current;
  })();
  return value;
}
