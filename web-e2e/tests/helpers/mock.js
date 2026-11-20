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

/** Switches the profile: `name` or `name#state`. */
export function useScenario(request, reference) {
  return control(request, 'POST', '/mock/scenario', { scenario: reference });
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
