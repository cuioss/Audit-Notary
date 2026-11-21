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
    expect(errorMessageKey(new ApiError('NETWORK', 0))).toBe('error.unexpected');
    expect(errorMessageKey(new Error('x'))).toBe('error.unexpected');
    expect(isApiError(new ApiError('VALIDATION', 422))).toBe(true);
  });
});
