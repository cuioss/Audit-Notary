import { describe, expect, it } from 'vitest';
import { ApiError, errorMessageKey, isApiError, isOutcome } from './errors';

describe('errors', () => {
  it('knows the outcomes of the server', () => {
    expect(isOutcome('FORBIDDEN')).toBe(true);
    expect(isOutcome('TIMEOUT')).toBe(false);
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
    expect(errorMessageKey(new ApiError('CONFLICT', 409))).toBe('error.conflict');
    expect(errorMessageKey(new Error('x'))).toBe('error.unexpected');
    expect(isApiError(new ApiError('VALIDATION', 422))).toBe(true);
  });
});
