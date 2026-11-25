import { describe, expect, it } from 'vitest';
import type { Session, Status } from '../api/types';
import { hasNoRights, loginProviderOf, loginStartAddress, stepUpMethodOf } from './access';

const STATUS: Status = { version: '1', degraded: false, repositories: [] };
const SESSION: Session = {
  user: { pseudonym: 'p-1', name: 'Alex' },
  rights: [],
  csrfToken: 't',
  firstLoginRequired: false,
};

describe('loginProviderOf', () => {
  it('reads an absent member, and a status that is not read, as the identity provider', () => {
    expect(loginProviderOf(null)).toBe('oidc');
    expect(loginProviderOf(STATUS)).toBe('oidc');
    expect(loginProviderOf({ ...STATUS, loginProvider: 'oidc' })).toBe('oidc');
    expect(loginProviderOf({ ...STATUS, loginProvider: 'local' })).toBe('local');
  });
});

describe('stepUpMethodOf', () => {
  it('takes the stated method', () => {
    expect(stepUpMethodOf({ ...STATUS, stepUp: 'password' })).toBe('password');
    expect(stepUpMethodOf({ ...STATUS, loginProvider: 'local', stepUp: 'mfa' })).toBe('mfa');
  });

  it('defaults to MFA with the identity provider and to off with local users (AUN-AUTH-4)', () => {
    expect(stepUpMethodOf(null)).toBe('mfa');
    expect(stepUpMethodOf(STATUS)).toBe('mfa');
    expect(stepUpMethodOf({ ...STATUS, loginProvider: 'local' })).toBe('off');
  });
});

describe('hasNoRights', () => {
  it('is a logged-in session without a right and without a first login to complete', () => {
    expect(hasNoRights(SESSION)).toBe(true);
    expect(hasNoRights(null)).toBe(false);
    expect(hasNoRights({ ...SESSION, firstLoginRequired: true })).toBe(false);
    expect(
      hasNoRights({ ...SESSION, rights: [{ repository: 'samm-assessments', actions: ['read'] }] }),
    ).toBe(false);
  });
});

describe('loginStartAddress', () => {
  it('starts the server login with the identity provider and the own page with local users', () => {
    expect(loginStartAddress('oidc', '/samm')).toBe('/api/v1/auth/login?return=%2Fsamm');
    expect(loginStartAddress('local', '/')).toBe('/login?return=%2F');
  });
});
