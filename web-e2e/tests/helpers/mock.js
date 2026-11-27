import { expect } from '@playwright/test';
import { MOCK_URL } from './ports.js';

/**
 * The control routes of web-mock (web-mock/README.adoc), called on the mock directly.
 */

async function control(request, method, path, data) {
  const response = await request.fetch(`${MOCK_URL}${path}`, { method, data });
  expect(response.ok(), `${method} ${path}`).toBeTruthy();
  return response.status() === 204 ? null : response.json().catch(() => null);
}

/**
 * Fails when the mock is not in the profile, and the state, that a reference names; the message says both, so a run that
 * shares its mock with another (the one that stopped it, restarted it or switched it) is told apart from a page that drew
 * the wrong data.
 *
 * @param current what the mock answers: `{ scenario, state }`
 * @param reference `name` or `name#state`; without a state only the profile is compared
 */
function expectInScenario(current, reference) {
  const state = reference.split('#')[1];
  expect(
    state === undefined ? current.scenario : `${current.scenario}#${current.state}`,
    `the mock is in ${current.scenario}#${current.state}, not in ${reference}: another run uses it`,
  ).toBe(reference);
}

/**
 * Switches the profile: `name` or `name#state`. The mock switches under its lock and answers with the state it is in, so
 * the answer is the proof that the profile is applied before the first request of the page: it is checked here.
 */
export async function useScenario(request, reference) {
  const answer = await control(request, 'POST', '/mock/scenario', { scenario: reference });
  expectInScenario(answer, reference);
  return answer;
}

/**
 * Asserts that the mock is still in the profile a test switched to, for the tests whose page reads what the profile
 * answers: a state that is gone is said by its name, not by a page with the data of another profile.
 */
export async function expectScenario(request, reference) {
  expectInScenario(await control(request, 'GET', '/mock/state'), reference);
}

/** Moves the current profile to a state. */
export function gotoState(request, state) {
  return control(request, 'POST', `/mock/goto/${state}`);
}

/** Pushes one event to every open event stream. */
export function broadcast(request, event, data) {
  return control(request, 'POST', '/mock/broadcast', { event, data });
}

/** @returns the recorded state-changing requests */
export function acts(request) {
  return control(request, 'GET', '/mock/acts');
}

/** Forgets the recorded requests. */
export function clearActs(request) {
  return control(request, 'DELETE', '/mock/acts');
}
