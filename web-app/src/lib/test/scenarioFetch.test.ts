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
});
