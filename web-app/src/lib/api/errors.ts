/**
 * The refusals of `/api/v1` (AUN-WEB-9) and the client's own failures.
 */

/** The outcomes a refusal names. */
export const OUTCOMES = [
  'UNAUTHENTICATED',
  'CSRF_REJECTED',
  'FORBIDDEN',
  'FIRST_LOGIN_REQUIRED',
  'VALIDATION',
  'GIT_UNAVAILABLE',
] as const;

/** An outcome of a refusal of the server. */
export type Outcome = (typeof OUTCOMES)[number];

/** The client's own failures: no answer in time, no connection, an answer that names no outcome. */
export type ClientFailure = 'TIMEOUT' | 'NETWORK' | 'UNEXPECTED';

/** One field error of a `VALIDATION` refusal. */
export interface FieldError {
  pointer: string;
  code: string;
}

/**
 * A request that did not succeed.
 *
 * `outcome` is the server's outcome or one of the client's own failures; the views decide by it,
 * never by the status code alone.
 */
export class ApiError extends Error {
  /** The outcome. */
  readonly outcome: Outcome | ClientFailure;
  /** The HTTP status, 0 when no answer arrived. */
  readonly status: number;
  /** The field errors of a `VALIDATION` refusal. */
  readonly errors: FieldError[];

  /**
   * @param outcome the outcome
   * @param status the HTTP status, 0 when no answer arrived
   * @param errors the field errors of a `VALIDATION` refusal
   */
  constructor(outcome: Outcome | ClientFailure, status: number, errors: FieldError[] = []) {
    super(outcome);
    this.name = 'ApiError';
    this.outcome = outcome;
    this.status = status;
    this.errors = errors;
  }
}

/**
 * @param value any value
 * @returns whether it is an outcome of the server
 */
export function isOutcome(value: unknown): value is Outcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value);
}

/**
 * @param value any value
 * @returns whether it is an {@link ApiError}
 */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/**
 * The catalogue key of the text a view shows for a failure.
 *
 * @param error the failure
 * @returns the message key
 */
export function errorMessageKey(error: unknown): string {
  if (!isApiError(error)) return 'error.unexpected';
  switch (error.outcome) {
    case 'FORBIDDEN':
      return 'error.forbidden';
    case 'GIT_UNAVAILABLE':
      return 'error.git-unavailable';
    default:
      return 'error.unexpected';
  }
}
