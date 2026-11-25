import { describe, expect, it } from 'vitest';
import { bodyOf, scenarioFetch } from './scenarioFetch';

/**
 * The scenario fetch of the unit tests follows the rules of the mock's `ScenarioLoader` and `MockEngine`.
 */
describe('scenarioFetch', () => {
  it('takes the method of a Request', async () => {
    const scenario = scenarioFetch('workshop');
    const answer = await scenario.fetch(
      new Request('http://localhost/api/v1/documents/samm-assessments/payments-2026-q4/save', {
        method: 'POST',
      }),
    );
    expect(await answer.json()).toMatchObject({ outcome: 'SAVED' });
  });

  it('follows a link and moves to its next state', async () => {
    const scenario = scenarioFetch('release');
    const answer = await scenario.fetch('/api/v1/releases/samm-assessments/payments-2026-q4', {
      method: 'POST',
    });
    expect(answer.status).toBe(403);
    expect(scenario.state()).toBe('stepped-up');
  });

  it('reads a data file and refuses what the mock refuses', () => {
    expect(bodyOf({ body_file: 'samm-scopes.json' })).toHaveProperty('scopes');
    expect(() => bodyOf({ body: {}, body_file: 'samm-scopes.json' })).toThrow(
      'either body or body_file',
    );
    expect(() => bodyOf({ body_file: '../release.json' })).toThrow('refused data file');
    expect(bodyOf({ body: { a: 1 } })).toEqual({ a: 1 });
    expect(bodyOf({})).toEqual({});
  });

  it('refuses every request on a repository for a session without a right, and keeps the shell requests', async () => {
    const scenario = scenarioFetch('no-rights');
    const refused = await scenario.fetch('/api/v1/samm/scopes');
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ outcome: 'FORBIDDEN' });
    const draft = await scenario.fetch('/api/v1/drafts/samm-assessments/x', { method: 'PUT' });
    expect(draft.status).toBe(403);
    const session = await (await scenario.fetch('/api/v1/session')).json();
    expect(session.rights).toEqual([]);
    expect((await scenario.fetch('/api/v1/due')).status).toBe(200);
    expect((await scenario.fetch('/api/v1/status')).status).toBe(200);
  });

  it('answers the form login of local users with an empty 200 or 401, and refuses it for the provider', async () => {
    const local = scenarioFetch('local');
    const body = (password: string) =>
      new URLSearchParams({ j_username: 'alex', j_password: password });
    const accepted = await local.fetch('/j_security_check', {
      method: 'POST',
      body: body('local-password'),
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.text()).toBe('');
    const wrong = await local.fetch('/j_security_check', { method: 'POST', body: body('nope') });
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toBe('');
    const oidc = await scenarioFetch('workshop').fetch('/j_security_check', {
      method: 'POST',
      body: body('local-password'),
    });
    expect(oidc.status).toBe(404);
  });

  it('reads the form credentials from a Request passed instead of an init body', async () => {
    const local = scenarioFetch('local');
    const login = (password: string) =>
      new Request('http://localhost/j_security_check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ j_username: 'alex', j_password: password }),
      });
    expect((await local.fetch(login('local-password'))).status).toBe(200);
    expect((await local.fetch(login('nope'))).status).toBe(401);
  });

  it('applies the flags of the selected state from the first request', async () => {
    const ended = scenarioFetch('workshop#session-ended');
    const refused = await ended.fetch('/api/v1/session');
    expect(refused.status).toBe(401);
    expect((await refused.json()).outcome).toBe('UNAUTHENTICATED');
    const ordinary = scenarioFetch('workshop');
    expect((await ordinary.fetch('/api/v1/session')).status).toBe(200);
    const replaced = scenarioFetch('workshop#session-replaced');
    const first = (await (await replaced.fetch('/api/v1/session')).json()).csrfToken;
    expect(first).not.toBe((await (await ordinary.fetch('/api/v1/session')).json()).csrfToken);
  });

  it('replaces the anti-CSRF token when a state replaces the session, and ends it with session-ended', async () => {
    const scenario = scenarioFetch('workshop');
    const token = async () => (await (await scenario.fetch('/api/v1/session')).json()).csrfToken;
    const first = await token();
    scenario.goto('session-replaced');
    expect(await token()).not.toBe(first);
    scenario.goto('session-ended');
    const ended = await scenario.fetch('/api/v1/session');
    expect(ended.status).toBe(401);
    expect(await ended.json()).toEqual({
      outcome: 'UNAUTHENTICATED',
      login: '/api/v1/auth/login',
    });
    expect((await scenario.fetch('/api/v1/status')).status).toBe(200);
  });
});
