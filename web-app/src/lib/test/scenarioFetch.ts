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
  /** A data file below `scenarios/data/` whose JSON is the body, as the mock's `body_file`. */
  body_file?: string;
}

/** The name pattern of a data file, the same as the mock's. */
const DATA_FILE = /^[a-z0-9][a-z0-9.-]*\.json$/;

interface LinkDefinition extends RouteDefinition {
  method: string;
  path: string;
  next: string;
}

interface StateDefinition {
  first_login_required?: boolean;
  /** On entering: the session gets a new anti-CSRF token (a new login in the same browser replaced it). */
  session_replaced?: boolean;
  /** On entering: every session is dropped; the next request answers `UNAUTHENTICATED`. */
  session_ended?: boolean;
  routes?: Record<string, RouteDefinition>;
  links?: Record<string, LinkDefinition>;
}

/** The login of a scenario: the provider and, with `local`, the accounts the form login accepts. */
export interface LoginDefinition {
  provider: 'oidc' | 'local';
  users?: { username: string; password: string }[];
}

/** A scenario file. */
export interface ScenarioFile {
  name: string;
  login?: LoginDefinition;
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

/**
 * The body of a route or link, by the rules of the mock's `ScenarioLoader`: inline, or the JSON of its data file; both
 * at once, a name outside the pattern, a missing file or a file that is no JSON value are refused.
 *
 * @param route a route or link
 * @returns its body
 */
export function bodyOf(route: RouteDefinition): unknown {
  if (route.body_file === undefined) return route.body ?? {};
  if (route.body !== undefined) throw new Error('an answer has either body or body_file');
  if (!DATA_FILE.test(route.body_file)) throw new Error(`refused data file: ${route.body_file}`);
  const text = fs.readFileSync(path.join(SCENARIO_DIR, 'data', route.body_file), 'utf8');
  if (text.trim() === '') throw new Error(`data file ${route.body_file} holds no JSON value`);
  return JSON.parse(text);
}

function answer(route: RouteDefinition): Response {
  // The body is read first, so a refused data file fails the request before it changes anything.
  return new Response(JSON.stringify(bodyOf(route)), {
    status: route.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * The requests a session without a right still makes: the shell's own (rest-api.adoc, A Session Without Rights).
 * Every other `/api/v1` request is refused `FORBIDDEN` before any route is looked at.
 */
const SHELL_REQUESTS = new Set([
  'GET /api/v1/status',
  'GET /api/v1/messages',
  'GET /api/v1/session',
  'GET /api/v1/due',
  'GET /api/v1/events',
  'POST /api/v1/auth/logout',
  'GET /api/v1/directory/me',
  'PUT /api/v1/directory/me',
  'GET /api/v1/catalogs/team',
  'GET /api/v1/catalogs/role',
]);

/** The requests that need no session. */
const PUBLIC_REQUESTS = new Set(['GET /api/v1/status', 'GET /api/v1/messages']);

/** What `scenarioFetch` returns. */
export interface ScenarioFetch {
  /** The fetch over the scenario. */
  fetch: typeof fetch;
  /** The current state. */
  state: () => string;
  /**
   * Moves to a state as `POST /mock/goto/{state}` does, with the flags of the state: a replaced session gets a new
   * `csrfToken`, an ended session answers `UNAUTHENTICATED`.
   */
  goto: (next: string) => void;
}

/**
 * @param reference `name` or `name#state`
 * @returns a fetch over the scenario, and the current state
 */
export function scenarioFetch(reference: string): ScenarioFetch {
  const [name, startState] = reference.split('#');
  const scenario = loadScenario(name);
  let state = startState ?? scenario.start;
  let generation = 0;
  let ended = false;
  const provider = scenario.login?.provider ?? 'oidc';

  const enter = (next: string): void => {
    state = next;
    const entered = scenario.states[next];
    if (entered?.session_replaced) generation += 1;
    if (entered?.session_ended) ended = true;
  };

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), 'http://localhost');
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const current = scenario.states[state] ?? {};
    const key = `${method} ${url.pathname}`;
    if (key === 'POST /j_security_check') {
      const form = new URLSearchParams(String(init?.body ?? ''));
      const known = scenario.login?.users?.some(
        (user) =>
          user.username === form.get('j_username') && user.password === form.get('j_password'),
      );
      if (provider !== 'local') return answer({ status: 404, body: { outcome: 'MOCK_NO_ROUTE' } });
      if (known) ended = false;
      return new Response('', { status: known ? 200 : 401 });
    }
    if (url.pathname.startsWith('/api/v1/') && !PUBLIC_REQUESTS.has(key)) {
      if (ended) {
        return answer({
          status: 401,
          body: {
            outcome: 'UNAUTHENTICATED',
            login: provider === 'local' ? '/login' : '/api/v1/auth/login',
          },
        });
      }
      if (scenario.rights.length === 0 && !SHELL_REQUESTS.has(key)) {
        return answer({ status: 403, body: { outcome: 'FORBIDDEN' } });
      }
    }
    const link = Object.values(current.links ?? {}).find(
      (candidate) => candidate.method === method && candidate.path === url.pathname,
    );
    if (link) {
      const response = answer(link);
      enter(link.next);
      return response;
    }
    if (key === 'GET /api/v1/session') {
      const firstLogin = current.first_login_required ?? scenario.first_login_required;
      return answer({
        body: {
          user: { ...scenario.user, pseudonym: firstLogin ? null : scenario.user.pseudonym },
          rights: scenario.rights,
          csrfToken: generation === 0 ? 'scenario-token' : `scenario-token-${generation}`,
          firstLoginRequired: firstLogin,
        },
      });
    }
    const route = current.routes?.[key] ?? scenario.routes[key];
    return route
      ? answer(route)
      : answer({ status: 404, body: { outcome: 'MOCK_NO_ROUTE', method, path: url.pathname } });
  };

  return { fetch: fetchImpl as typeof fetch, state: () => state, goto: enter };
}
