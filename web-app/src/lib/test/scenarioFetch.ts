import fs from 'node:fs';
import path from 'node:path';

/**
 * An in-memory `fetch` over the scenario files of `web-mock` (AUN-TEST-1, "Shared fixtures"): unit tests,
 * end-to-end tests and manual runs see the same data. It answers the routes and links of the current
 * state and the session; login, CSRF and the event stream are the mock server's business and are not
 * emulated here.
 */

/** The directory of the scenario files. */
export const SCENARIO_DIR = path.resolve(
  __dirname,
  '../../../../web-mock/src/main/resources/scenarios',
);

interface RouteDefinition {
  status?: number;
  body?: unknown;
}

interface LinkDefinition extends RouteDefinition {
  method: string;
  path: string;
  next: string;
}

interface StateDefinition {
  first_login_required?: boolean;
  routes?: Record<string, RouteDefinition>;
  links?: Record<string, LinkDefinition>;
}

/** A scenario file. */
export interface ScenarioFile {
  name: string;
  user: { pseudonym: string | null; name: string };
  rights: unknown[];
  first_login_required: boolean;
  start: string;
  routes: Record<string, RouteDefinition>;
  states: Record<string, StateDefinition>;
}

/** @returns the names of the primary profiles (`primary.txt`) */
export function primaryScenarios(): string[] {
  return fs
    .readFileSync(path.join(SCENARIO_DIR, 'primary.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * @param name the profile
 * @returns the scenario file
 */
export function loadScenario(name: string): ScenarioFile {
  return JSON.parse(
    fs.readFileSync(path.join(SCENARIO_DIR, `${name}.json`), 'utf8'),
  ) as ScenarioFile;
}

function answer(route: RouteDefinition): Response {
  return new Response(JSON.stringify(route.body ?? {}), {
    status: route.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * @param reference `name` or `name#state`
 * @returns a fetch over the scenario, and the current state
 */
export function scenarioFetch(reference: string): { fetch: typeof fetch; state: () => string } {
  const [name, startState] = reference.split('#');
  const scenario = loadScenario(name);
  let state = startState ?? scenario.start;

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const current = scenario.states[state] ?? {};
    const key = `${method} ${url.pathname}`;
    const link = Object.values(current.links ?? {}).find(
      (candidate) => candidate.method === method && candidate.path === url.pathname,
    );
    if (link) {
      state = link.next;
      return answer(link);
    }
    if (key === 'GET /api/v1/session') {
      const firstLogin = current.first_login_required ?? scenario.first_login_required;
      return answer({
        body: {
          user: { ...scenario.user, pseudonym: firstLogin ? null : scenario.user.pseudonym },
          rights: scenario.rights,
          csrfToken: 'scenario-token',
          firstLoginRequired: firstLogin,
        },
      });
    }
    const route = current.routes?.[key] ?? scenario.routes[key];
    return route
      ? answer(route)
      : answer({ status: 404, body: { outcome: 'MOCK_NO_ROUTE', method, path: url.pathname } });
  };

  return { fetch: fetchImpl as typeof fetch, state: () => state };
}
