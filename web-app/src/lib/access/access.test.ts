import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Session, Status } from '../api/types';
import {
  LOGIN_PROBLEM_REASONS,
  hasNoRights,
  loginProviderOf,
  loginStartAddress,
  stepUpMethodOf,
} from './access';

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

describe('the reasons of the login problem', () => {
  const messages = (language: string) =>
    fs.readFileSync(
      path.resolve(
        __dirname,
        `../../main/resources/META-INF/audit-notary/messages/messages_${language}.properties`,
      ),
      'utf8',
    );

  it('are the ones the specification names', () => {
    const spec = fs.readFileSync(
      path.resolve(__dirname, '../../../../doc/specification/rest-api.adoc'),
      'utf8',
    );
    const lines = spec.split(/\r?\n/);
    const first = lines.findIndex((line) => line.startsWith('|The reasons `'));
    const last = lines.findIndex((line, index) => index > first && line.startsWith('|none'));
    // The reasons are named before "Another or no `reason`", which is the general failure.
    const sentence = lines.slice(first, last).join(' ').split('Another')[0];
    const named = [...sentence.matchAll(/`([a-z-]+)`/g)].map((match) => match[1]);
    expect(named.length).toBeGreaterThan(0);
    expect(Object.keys(LOGIN_PROBLEM_REASONS).sort()).toEqual([...named].sort());
  });

  it.each(['en', 'de'])(
    'have a title and a body in the %s catalogue, and so has the general failure',
    (language) => {
      const keys = new Set(
        messages(language)
          .split(/\r?\n/)
          .map((line) => line.split('=')[0].trim()),
      );
      for (const reason of [...Object.keys(LOGIN_PROBLEM_REASONS), 'general']) {
        expect(keys.has(`login-problem.reason.${reason}.title`)).toBe(true);
        expect(keys.has(`login-problem.reason.${reason}.body`)).toBe(true);
      }
    },
  );
});
