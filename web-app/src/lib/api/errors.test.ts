import { describe, expect, it } from 'vitest';
import { ApiError, errorMessageKey, isApiError, isOutcome } from './errors';

describe('errors', () => {
  it('knows the outcomes of the server', () => {
    expect(isOutcome('FORBIDDEN')).toBe(true);
    expect(isOutcome('TIMEOUT')).toBe(false);
    // The refusal of the person save that names a pseudonym no candidate has (rest-api.adoc, directory/me).
    expect(isOutcome('NOT_BINDABLE')).toBe(true);
    // The refusals of the catalogs: an id that exists, an entry that is retired.
    expect(isOutcome('ID_TAKEN')).toBe(true);
    expect(isOutcome('RETIRED')).toBe(true);
    // The refusals of the directory: the candidates of a first login, a directory kept elsewhere.
    expect(isOutcome('BINDING_CANDIDATES')).toBe(true);
    expect(isOutcome('MANAGED_BY_SOURCE')).toBe(true);
  });

  it('maps a failure to the text a view shows', () => {
    expect(errorMessageKey(new ApiError('FORBIDDEN', 403))).toBe('error.forbidden');
    expect(errorMessageKey(new ApiError('GIT_UNAVAILABLE', 503))).toBe('error.git-unavailable');
    expect(errorMessageKey(new ApiError('NETWORK', 0))).toBe('error.network');
    expect(errorMessageKey(new ApiError('TIMEOUT', 0))).toBe('error.network');
    expect(errorMessageKey(new ApiError('UNEXPECTED', 500))).toBe('error.unexpected');
    expect(errorMessageKey(new ApiError('DOCUMENT_RELEASED', 409))).toBe('error.document-released');
    expect(errorMessageKey(new ApiError('REJECTED', 409))).toBe('error.rejected');
    expect(errorMessageKey(new ApiError('INVALID_CREDENTIALS', 401))).toBe(
      'error.invalid-credentials',
    );
    expect(errorMessageKey(new ApiError('MANDATORY_FIELDS_MISSING', 422))).toBe(
      'error.mandatory-fields-missing',
    );
    expect(errorMessageKey(new ApiError('CHANGED_SINCE_REVIEW', 409))).toBe(
      'error.changed-since-review',
    );
    expect(errorMessageKey(new ApiError('TOO_MANY_LOGINS', 503))).toBe('error.too-many-logins');
    expect(errorMessageKey(new ApiError('CONFLICT', 409))).toBe('error.conflict');
    expect(errorMessageKey(new ApiError('VALIDATION', 422))).toBe('error.validation');
    expect(errorMessageKey(new ApiError('ID_TAKEN', 409))).toBe('error.id-taken');
    expect(errorMessageKey(new ApiError('RETIRED', 409))).toBe('error.retired');
    expect(errorMessageKey(new ApiError('MANAGED_BY_SOURCE', 409))).toBe('error.managed-by-source');
    expect(errorMessageKey(new ApiError('NOT_BINDABLE', 409))).toBe('error.not-bindable');
    expect(errorMessageKey(new ApiError('TOO_LARGE', 413))).toBe('error.too-large');
    expect(errorMessageKey(new Error('x'))).toBe('error.unexpected');
    expect(isApiError(new ApiError('VALIDATION', 422))).toBe(true);
  });
});
