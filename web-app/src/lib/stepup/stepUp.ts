/**
 * The step-up handler (UC-ACC-3, AUN-AUTH-4, doc/specification/rest-api.adoc, The Step-Up Handler): the one module
 * through which every request that can ask for step-up is sent — a release, a transition a workflow declares, the
 * completion of a stage, the save of the configuration, the activation of a category. No view has its own handling.
 *
 * The method comes from `status.stepUp`, read before the control is pressed:
 *
 * - `mfa`: the request is sent; on `403 STEP_UP_REQUIRED` with an address the app leaves for it and keeps nothing
 *   across the redirect — the user chooses the act again after the return (PROVISIONAL; Token Sheriff's planned
 *   pending action, SESSION-8, replaces this).
 * - `password`: a dialog asks first and the password travels as the member `password` of the request's body (PROVISIONAL
 *   generalisation). `401 INVALID_CREDENTIALS` keeps the dialog open; the password is never kept, logged or shown.
 * - `off`: the request is sent.
 *
 * The handler owns `STEP_UP_REQUIRED`, `INVALID_CREDENTIALS`, `TOO_MANY_LOGINS` (a notice; nothing was written) and
 * `UNAUTHENTICATED`. Every other refusal is the view's: it is handed back untouched.
 */
import { get, writable, type Readable } from 'svelte/store';
import { apiClient, type ApiClient } from '../api/client';
import { ApiError, isApiError } from '../api/errors';
import type { StepUpMethod } from '../api/types';
import { stepUpMethodOf } from '../access/access';
import { status } from '../stores/app';

/**
 * What a run came to.
 *
 * - `done`: the request was answered; its value.
 * - `refused`: the request was refused with an outcome that is the view's (`CHANGED_SINCE_REVIEW`, `FORBIDDEN`,
 *   `MANDATORY_FIELDS_MISSING`, `REJECTED`, …). Nothing was written.
 * - `handled`: the handler dealt with it and nothing more is the view's: the app left for the identity provider, the
 *   dialog was cancelled, the notice of too many logins is shown, or the session ended (the client leaves for the login).
 */
export type StepUpResult<T> =
  { status: 'done'; value: T } | { status: 'refused'; error: ApiError } | { status: 'handled' };

/** What the handler's views show. */
export interface StepUpState {
  /** Whether the password dialog is open. */
  asking: boolean;
  /** Whether the request is running behind the dialog. */
  sending: boolean;
  /** The catalogue key of the error in the dialog, `null` for none. */
  dialogError: string | null;
  /** The catalogue key of the notice above the view, `null` for none. */
  notice: { tone: 'attention' | 'danger'; key: string } | null;
  /** Whether a request runs without a dialog: the act is busy. */
  working: boolean;
}

const IDLE: StepUpState = {
  asking: false,
  sending: false,
  dialogError: null,
  notice: null,
  working: false,
};

/**
 * @param error a `STEP_UP_REQUIRED` refusal
 * @returns the step-up address it names, `null` when it names none
 */
function stepUpAddress(error: ApiError): string | null {
  return typeof error.details.stepUp === 'string' ? error.details.stepUp : null;
}

/** A request the handler sends: with the password when the dialog collected one. */
export type StepUpRequest<T> = (password?: string) => Promise<T>;

/** The handler of one view. */
export class StepUpHandler {
  private readonly store = writable<StepUpState>({ ...IDLE });
  private pending: {
    request: StepUpRequest<unknown>;
    resolve: (result: StepUpResult<unknown>) => void;
  } | null = null;

  /**
   * @param client the client, for the redirect to the identity provider
   * @param method how step-up confirms now; reads the status by default
   * @param beforeLeave what the view keeps before the app leaves for the identity provider, which keeps nothing
   *   across the redirect (PROVISIONAL): a view with unsaved changes keeps them as its draft
   */
  constructor(
    private readonly client: ApiClient = apiClient,
    private readonly method: () => StepUpMethod = () => stepUpMethodOf(get(status)),
    private readonly beforeLeave: () => Promise<void> = () => Promise.resolve(),
  ) {}

  /** @returns the state the views render */
  get state(): Readable<StepUpState> {
    return { subscribe: this.store.subscribe };
  }

  private patch(change: Partial<StepUpState>): void {
    this.store.update((current) => ({ ...current, ...change }));
  }

  /**
   * Sends a request that can ask for step-up.
   *
   * @param request the request; it gets the password when the method is `password`
   * @returns what came of it
   */
  run<T>(request: StepUpRequest<T>): Promise<StepUpResult<T>> {
    this.patch({ notice: null });
    if (this.method() === 'password') {
      return this.ask(request);
    }
    return this.attempt(request);
  }

  /** Sends the request without a dialog: `mfa` and `off`. */
  private async attempt<T>(request: StepUpRequest<T>): Promise<StepUpResult<T>> {
    this.patch({ working: true });
    try {
      return { status: 'done', value: await request() };
    } catch (error) {
      return await this.classify<T>(error);
    } finally {
      this.patch({ working: false });
    }
  }

  /** Opens the dialog and waits for the password, the cancel or the end of the request. */
  private ask<T>(request: StepUpRequest<T>): Promise<StepUpResult<T>> {
    this.pending?.resolve({ status: 'handled' });
    this.patch({ asking: true, dialogError: null, sending: false });
    return new Promise<StepUpResult<T>>((resolve) => {
      this.pending = {
        request: request as StepUpRequest<unknown>,
        resolve: resolve as (result: StepUpResult<unknown>) => void,
      };
    });
  }

  /**
   * Sends the request with the password the dialog collected.
   *
   * @param password the password; never kept
   */
  async submit(password: string): Promise<void> {
    const current = this.pending;
    if (!current || get(this.store).sending) return;
    this.patch({ sending: true, dialogError: null });
    try {
      const value = await current.request(password);
      this.finish({ status: 'done', value });
    } catch (error) {
      if (isApiError(error) && error.outcome === 'INVALID_CREDENTIALS') {
        // A wrong password is no lost session: the dialog stays open, nothing was written.
        this.patch({ sending: false, dialogError: 'error.invalid-credentials' });
        return;
      }
      if (isApiError(error) && error.outcome === 'STEP_UP_REQUIRED' && !stepUpAddress(error)) {
        // A server that asks without an address is answered by the dialog, which stays open.
        this.patch({ sending: false, dialogError: 'error.unexpected' });
        return;
      }
      this.finish(await this.classify(error));
    }
  }

  /** Closes the dialog without a request: the user cancelled. */
  cancel(): void {
    if (this.pending) this.finish({ status: 'handled' });
  }

  private finish(result: StepUpResult<unknown>): void {
    const current = this.pending;
    this.pending = null;
    this.patch({ asking: false, sending: false, dialogError: null });
    current?.resolve(result);
  }

  /**
   * Sorts a refusal into the handler's and the view's.
   *
   * @param error what the request threw
   * @returns the result
   */
  private async classify<T>(error: unknown): Promise<StepUpResult<T>> {
    if (!isApiError(error)) return { status: 'refused', error: new ApiError('UNEXPECTED', 0) };
    switch (error.outcome) {
      case 'STEP_UP_REQUIRED': {
        const address = stepUpAddress(error);
        if (address) {
          // A failed keep must not hold the user back from the step-up.
          await this.beforeLeave().catch(() => undefined);
          this.client.stepUp(address);
        } else {
          // No address and no dialog: a user of the identity provider has no password to give.
          this.patch({ notice: { tone: 'danger', key: 'error.unexpected' } });
        }
        return { status: 'handled' };
      }
      case 'TOO_MANY_LOGINS':
        // Every place of pending logins is taken, so no step-up can start; the view and the draft stay as they were.
        this.patch({ notice: { tone: 'attention', key: 'error.too-many-logins' } });
        return { status: 'handled' };
      case 'UNAUTHENTICATED':
        // The client already leaves for the login; a logout always wins over a step-up still running.
        return { status: 'handled' };
      default:
        return { status: 'refused', error };
    }
  }
}
