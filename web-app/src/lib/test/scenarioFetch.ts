import fs from 'node:fs';
import path from 'node:path';
import { loadMessages, loadPropertiesFile } from '../../test/catalogue-fixture';

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
  /** A built-in handler of the mock that computes the answer from the request instead of a body. */
  handler?: string;
  body?: unknown;
  /** A data file below `scenarios/data/` whose JSON is the body, as the mock's `body_file`. */
  body_file?: string;
  /** The data file a handler reads (the search index), as the mock's `data_file`. */
  data_file?: string;
}

/** The most bytes of source the preview handler renders, as the mock's. */
const RENDER_LIMIT_BYTES = 65_536;

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

/**
 * @param text a text
 * @returns it with `& < > " '` escaped, as the mock's `escapeHtml`
 */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * @param text one escaped line or block
 * @returns it with `*x*`, `_x_` and `` `x` `` turned into strong, emphasis and code, non-greedy and not nested
 */
function renderInline(text: string): string {
  return text.replace(/\*([^*]+?)\*|_([^_]+?)_|`([^`]+?)`/g, (_, strong, emphasis, code) => {
    if (strong !== undefined) return `<strong>${strong}</strong>`;
    if (emphasis !== undefined) return `<em>${emphasis}</em>`;
    return `<code>${code}</code>`;
  });
}

/**
 * The deliberately tiny, deterministic renderer of the mock's `render-asciidoc` handler (`AsciiDocPreview.java`), with
 * the same rules in the same order: the source is escaped first; blocks are separated by blank lines; a block of lines
 * that all start with `* ` is a list; a block of one line `== ` to `====== ` is a heading `h2` to `h6`; every other
 * block is a paragraph with its lines joined by `<br>`.
 *
 * @param source the AsciiDoc source
 * @returns the HTML
 */
export function renderAsciiDocLikeTheMock(source: string): string {
  const text = escapeHtml(source).replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  return text
    .split(/\n\s*\n/)
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const lines = block.split('\n');
      if (lines.every((line) => line.startsWith('* '))) {
        return `<ul>${lines.map((line) => `<li>${renderInline(line.slice(2))}</li>`).join('')}</ul>`;
      }
      const heading = lines.length === 1 ? /^(={2,6}) (.*)$/.exec(lines[0]) : null;
      if (heading) {
        const level = heading[1].length;
        return `<h${level}>${renderInline(heading[2])}</h${level}>`;
      }
      return `<div><p>${lines.map(renderInline).join('<br>')}</p></div>`;
    })
    .join('');
}

/**
 * The answer of `POST /api/v1/render/asciidoc` (rest-api.adoc, Form Kit Requests), by the rules of the mock's engine:
 * no `source` is `422 REQUIRED`, one that is no string `422 TYPE`, one above 65,536 bytes `413 TOO_LARGE`, else `200`.
 *
 * @param bodyText the text of the request body
 * @returns the answer
 */
function renderAnswer(bodyText: string): Response {
  let body: unknown = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    // Not JSON: it has no `source`.
  }
  const record = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  const source = record ? (record as Record<string, unknown>).source : undefined;
  if (source === undefined) {
    return answer({
      status: 422,
      body: { outcome: 'VALIDATION', errors: [{ pointer: '/source', code: 'REQUIRED' }] },
    });
  }
  if (typeof source !== 'string') {
    return answer({
      status: 422,
      body: { outcome: 'VALIDATION', errors: [{ pointer: '/source', code: 'TYPE' }] },
    });
  }
  if (new TextEncoder().encode(source).length > RENDER_LIMIT_BYTES) {
    return answer({ status: 413, body: { outcome: 'TOO_LARGE', limit: RENDER_LIMIT_BYTES } });
  }
  return answer({ body: { html: renderAsciiDocLikeTheMock(source) } });
}

/** What a built-in handler sees of a request: its body text, its URL, the data file of its route and the rights. */
interface HandlerContext {
  bodyText: string;
  url: URL;
  data: unknown;
  rights: { repository: string; actions: string[] }[];
}

/** The most hits of the search, as the mock's. */
const SEARCH_LIMIT = 20;

/**
 * The answer of `GET /api/v1/search?q=` by the rules of the mock's `search-documents` handler (rest-api.adoc, The
 * Document Lifecycle Requests): no `q` is `422 REQUIRED`, fewer than two characters after trimming `MIN_LENGTH`, more
 * than 200 `MAX_LENGTH`; else the entries of the index of the repositories the rights grant `read` on whose title or id
 * contains the text, in any case, by title, at most 20.
 *
 * @param context the request
 * @returns the answer
 */
function searchAnswer(context: HandlerContext): Response {
  const refuse = (code: string): Response =>
    answer({
      status: 422,
      body: { outcome: 'VALIDATION', errors: [{ pointer: '/q', code }] },
    });
  const parameter = context.url.searchParams.get('q');
  if (parameter === null) return refuse('REQUIRED');
  const text = parameter.trim();
  if (text.length < 2) return refuse('MIN_LENGTH');
  if (text.length > 200) return refuse('MAX_LENGTH');
  const needle = text.toLowerCase();
  const readable = new Set(
    context.rights
      .filter((right) => right.actions.includes('read'))
      .map((right) => right.repository),
  );
  const index = (context.data as { entries?: Record<string, string>[] }).entries ?? [];
  const hits = index
    .filter(
      (entry) =>
        readable.has(entry.repository) &&
        (entry.title.toLowerCase().includes(needle) || entry.id.toLowerCase().includes(needle)),
    )
    .sort((a, b) => {
      const [first, second] = [a.title.toLowerCase(), b.title.toLowerCase()];
      return first < second ? -1 : first > second ? 1 : 0;
    });
  return answer({
    body: {
      query: text,
      results: hits.slice(0, SEARCH_LIMIT),
      truncated: hits.length > SEARCH_LIMIT,
    },
  });
}

/**
 * The built-in handlers of the mock's engine, each name with its own answer. The names are those of the `web-mock`
 * `Handler` enum; `scenarioFetch.test.ts` fails when the two differ.
 */
export const HANDLERS: ReadonlyMap<string, (context: HandlerContext) => Response> = new Map([
  ['render-asciidoc', (context: HandlerContext) => renderAnswer(context.bodyText)],
  ['search-documents', searchAnswer],
]);

/**
 * The catalogue the mock serves for `GET /api/v1/messages?lang=`: the web app's, with the labels of the fixture
 * categories of `scenarios/messages/` on top; a fixture key that the web app holds too is refused, as the mock refuses
 * to start (`MessageCatalogue`).
 *
 * @param lang `en` or `de`
 * @returns the catalogue
 */
export function mockMessages(lang: 'en' | 'de'): Record<string, string> {
  const base = loadMessages(lang);
  const fixtures = loadPropertiesFile(
    path.join(SCENARIO_DIR, 'messages', `messages_${lang}.properties`),
  );
  for (const key of Object.keys(fixtures)) {
    if (Object.hasOwn(base, key)) throw new Error(`fixture message ${key} exists in the web app`);
  }
  return { ...base, ...fixtures };
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

/**
 * The key of a route or link with its parts: `METHOD /path` or `METHOD /path?name=value[&name=value]` (the mock's
 * `RouteKey`).
 *
 * @param key a route key
 * @returns method, path and the required query
 */
function parseKey(key: string): { method: string; path: string; query: URLSearchParams } {
  const space = key.indexOf(' ');
  const target = key.slice(space + 1);
  const mark = target.indexOf('?');
  return {
    method: key.slice(0, space),
    path: mark < 0 ? target : target.slice(0, mark),
    query: new URLSearchParams(mark < 0 ? '' : target.slice(mark + 1)),
  };
}

/**
 * The most specific match of a request among keyed entries, by the rule of the mock: the key must have the request's
 * method and path and every listed query name with exactly the listed value (further parameters do not hinder it); a key
 * without query matches any query; of several matches the one with the most listed parameters wins. Equal matches of
 * routes are told apart by their key text (`ties: 'text'`, so that the answer never depends on the order of a map);
 * equal links keep the first in the order of the state (`ties: 'order'`), as `ScenarioState.linkFor` does.
 *
 * @param entries the entries as key and value, in their order
 * @param method the request method
 * @param url the request URL
 * @param ties how equal matches are told apart
 * @returns the entry, or `undefined`
 */
function mostSpecific<T>(
  entries: ReadonlyArray<readonly [string, T]>,
  method: string,
  url: URL,
  ties: 'text' | 'order',
): T | undefined {
  let best: { size: number; key: string; entry: T } | undefined;
  for (const [key, entry] of entries) {
    const parsed = parseKey(key);
    if (parsed.method !== method || parsed.path !== url.pathname) continue;
    if (![...parsed.query].every(([name, value]) => url.searchParams.get(name) === value)) continue;
    const size = [...parsed.query].length;
    if (!best || size > best.size || (ties === 'text' && size === best.size && key < best.key)) {
      best = { size, key, entry };
    }
  }
  return best?.entry;
}

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

  // The mock enters its start state the same way, so the flags of a state that is selected by `name#state` hold from
  // the first request.
  enter(state);

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), 'http://localhost');
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const current = scenario.states[state] ?? {};
    const key = `${method} ${url.pathname}`;
    if (key === 'POST /j_security_check') {
      // The credentials are in the init's body, or in the body of a `Request` passed instead.
      const text =
        init?.body !== undefined && init.body !== null
          ? String(init.body)
          : request
            ? await request.clone().text()
            : '';
      const form = new URLSearchParams(text);
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
    if (key === 'GET /api/v1/messages') {
      return answer({ body: mockMessages(url.searchParams.get('lang') === 'de' ? 'de' : 'en') });
    }
    const link = mostSpecific(
      Object.values(current.links ?? {}).map((candidate) => [
        `${candidate.method} ${candidate.path}`,
        candidate,
      ]),
      method,
      url,
      'order',
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
    const route =
      mostSpecific(Object.entries(current.routes ?? {}), method, url, 'text') ??
      mostSpecific(Object.entries(scenario.routes), method, url, 'text');
    if (route?.handler !== undefined) {
      const handle = HANDLERS.get(route.handler);
      if (handle === undefined) throw new Error(`unknown handler: ${route.handler}`);
      const text =
        init?.body !== undefined && init.body !== null
          ? String(init.body)
          : request
            ? await request.clone().text()
            : '';
      const data =
        route.data_file === undefined ? undefined : bodyOf({ body_file: route.data_file });
      return handle({
        bodyText: text,
        url,
        data,
        rights: scenario.rights as HandlerContext['rights'],
      });
    }
    return route
      ? answer(route)
      : answer({ status: 404, body: { outcome: 'MOCK_NO_ROUTE', method, path: url.pathname } });
  };

  return { fetch: fetchImpl as typeof fetch, state: () => state, goto: enter };
}
