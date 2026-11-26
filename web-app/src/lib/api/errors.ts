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
  'CONFLICT',
  'DOCUMENT_RELEASED',
  'REJECTED',
  'STEP_UP_REQUIRED',
  'INVALID_CREDENTIALS',
  'MANDATORY_FIELDS_MISSING',
  'CHANGED_SINCE_REVIEW',
  'MODEL_VERSIONS_DIFFER',
  'TOO_MANY_LOGINS',
  'NOT_FOUND',
  'TOO_LARGE',
  'RENDER_UNAVAILABLE',
  'NOT_BINDABLE',
  'ID_TAKEN',
  'RETIRED',
] as const;

/** An outcome of a refusal of the server. */
export type Outcome = (typeof OUTCOMES)[number];

/** The client's own failures: no answer in time, no connection, an answer that names no outcome. */
export type ClientFailure = 'TIMEOUT' | 'NETWORK' | 'UNEXPECTED';

/**
 * One field error of a `VALIDATION` refusal. For a save, a draft or a create of a document `part` names the part the
 * pointer is into: the pointer is the one of the form (rest-api.adoc, Decided Provisionally, point 9).
 */
export interface FieldError {
  pointer: string;
  code: string;
  part?: string;
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
   * The whole body of the refusal, for the outcomes that carry more than a word: the conflicts of `CONFLICT`, the
   * step-up address of `STEP_UP_REQUIRED`, the missing fields of `MANDATORY_FIELDS_MISSING`.
   */
  readonly details: Record<string, unknown>;

  /**
   * @param outcome the outcome
   * @param status the HTTP status, 0 when no answer arrived
   * @param errors the field errors of a `VALIDATION` refusal
   * @param details the body of the refusal
   */
  constructor(
    outcome: Outcome | ClientFailure,
    status: number,
    errors: FieldError[] = [],
    details: Record<string, unknown> = {},
  ) {
    super(outcome);
    this.name = 'ApiError';
    this.outcome = outcome;
    this.status = status;
    this.errors = errors;
    this.details = details;
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
    case 'DOCUMENT_RELEASED':
      return 'error.document-released';
    case 'REJECTED':
      return 'error.rejected';
    case 'INVALID_CREDENTIALS':
      return 'error.invalid-credentials';
    case 'MANDATORY_FIELDS_MISSING':
      return 'error.mandatory-fields-missing';
    case 'CHANGED_SINCE_REVIEW':
      return 'error.changed-since-review';
    case 'TOO_MANY_LOGINS':
      return 'error.too-many-logins';
    case 'CONFLICT':
      return 'error.conflict';
    case 'ID_TAKEN':
      return 'error.id-taken';
    case 'RETIRED':
      return 'error.retired';
    case 'VALIDATION':
      return 'error.validation';
    case 'TIMEOUT':
    case 'NETWORK':
      return 'error.network';
    default:
      return 'error.unexpected';
  }
}
