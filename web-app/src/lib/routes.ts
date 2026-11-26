/**
 * The address model of the web app (AUN-WEB-3): one canonical address per object kind, and reloading an
 * address restores the same view.
 *
 * The addresses are data, `META-INF/audit-notary/canonical-addresses.json`, shared with the server's check of
 * the login's `return` (AUN-AUTH-1) and with the mock server.
 */
import canonical from '../main/resources/META-INF/audit-notary/canonical-addresses.json';

/** The lenses in rail order; the {@link Lens} type derives from it. */
export const LENSES = [
  'due',
  'samm',
  'threat-models',
  'incidents',
  'isms',
  'categories',
  'catalogs',
  'reports',
  'settings',
] as const;

/** A lens of the navigation rail (AUN-WEB-3). */
export type Lens = (typeof LENSES)[number];

/**
 * An address: the route id of `canonical-addresses.json`, the values of its placeholders and, when the address
 * carries any, the values of the query names it admits (doc/specification/rest-api.adoc, Allowed Queries of an
 * Address). `query` is absent for an address without a query value.
 */
export interface Address {
  route: string;
  params: Record<string, string>;
  query?: Record<string, string>;
}

interface CompiledAddress {
  route: string;
  pattern: string;
  names: string[];
  regex: RegExp;
  /** The query names the address admits, in the order they are written. */
  query: string[];
}

interface CanonicalFile {
  segment: string;
  params: Record<string, string>;
  /** The value pattern of every query name an address may admit. */
  queries?: Record<string, string>;
  addresses: { route: string; pattern: string; query?: string[] }[];
  /**
   * The addresses shown without the shell: routed by the web app, never a valid `return` of a login
   * (doc/specification/rest-api.adoc, Addresses Outside the Shell).
   */
  outsideShell?: { route: string; pattern: string; query?: string[] }[];
}

const PLACEHOLDER = /\{([a-z][a-z0-9]*)\}/g;

/**
 * Compiles the address patterns of one section of the file.
 *
 * @param file the content of `canonical-addresses.json`
 * @param section the section: `addresses`, the canonical addresses, or `outsideShell`
 * @returns the addresses in file order, each with an anchored expression
 */
export function compileAddresses(
  file: CanonicalFile,
  section: 'addresses' | 'outsideShell' = 'addresses',
): CompiledAddress[] {
  return (file[section] ?? []).map(({ route, pattern, query }) => {
    const names: string[] = [];
    const source = pattern.replace(PLACEHOLDER, (_, name: string) => {
      names.push(name);
      return `(${file.params[name] ?? file.segment})`;
    });
    // The patterns come from the bundled file, not from input.
    // eslint-disable-next-line security/detect-non-literal-regexp
    return { route, pattern, names, regex: new RegExp(`^${source}$`), query: query ?? [] };
  });
}

/**
 * Compiles the value patterns of the query names, each matched against the whole value.
 *
 * @param file the content of `canonical-addresses.json`
 * @returns the name to its anchored expression
 */
export function compileQueries(file: CanonicalFile): Map<string, RegExp> {
  return new Map(
    Object.entries(file.queries ?? {}).map(([name, pattern]) => [
      name,
      // The patterns come from the bundled file, not from input.
      // eslint-disable-next-line security/detect-non-literal-regexp
      new RegExp(`^(?:${pattern})$`),
    ]),
  );
}

const ADDRESSES = compileAddresses(canonical as CanonicalFile);
const OUTSIDE = compileAddresses(canonical as CanonicalFile, 'outsideShell');
const QUERIES = compileQueries(canonical as CanonicalFile);

/**
 * @param name a query name of `canonical-addresses.json`
 * @param value a value to check
 * @returns whether the file admits the value for the name; `false` for a name the file does not have
 */
export function isQueryValue(name: string, value: string): boolean {
  return QUERIES.get(name)?.test(value) ?? false;
}

/** The longest query string a `return` may carry (rest-api.adoc, Allowed Queries of an Address). */
export const MAX_QUERY_LENGTH = 256;

/** The route ids of every canonical address; the addresses outside the shell are not among them. */
export const ROUTES: readonly string[] = ADDRESSES.map((address) => address.route);

/**
 * @param segment the first segment of an address path, such as `catalogs`
 * @returns the route ids of the canonical addresses whose path starts with that segment, in file order; the pages of
 * the same lens under another segment (`/directory/...`) are not among them
 */
export function routesUnder(segment: string): readonly string[] {
  return ADDRESSES.filter(
    ({ pattern }) => pattern === `/${segment}` || pattern.startsWith(`/${segment}/`),
  ).map((address) => address.route);
}

/** The route ids of the addresses shown without the shell: `login`, `signed-out`, `login-problem`. */
export const OUTSIDE_ROUTES: readonly string[] = OUTSIDE.map((address) => address.route);

/**
 * @param route a route id
 * @returns whether the route is shown without the shell, and without a session
 */
export function isOutsideShell(route: string | null): boolean {
  return route !== null && OUTSIDE_ROUTES.includes(route);
}

/**
 * Percent-decodes a name or a value once; a `+` stays a plus.
 *
 * @param text the text between two separators of a query string
 * @returns the decoded text, or `null` for a malformed escape (a `%` without two hexadecimal digits, or one that is no
 * UTF-8)
 */
function decodeOnce(text: string): string | null {
  try {
    return decodeURIComponent(text.replaceAll('+', '%2B'));
  } catch {
    return null;
  }
}

/**
 * Reads the pairs of a query string the way both sides of the `return` check do: split at `&`, each half decoded once.
 *
 * @param search the query string, with or without its `?`
 * @returns the pairs in order; a half that cannot be decoded is `null`, a pair without `=` has the value `''`
 */
function queryPairs(search: string): { name: string | null; value: string | null }[] {
  const text = search.startsWith('?') ? search.slice(1) : search;
  if (text === '') return [];
  return text.split('&').map((pair) => {
    const equals = pair.indexOf('=');
    const name = equals < 0 ? pair : pair.slice(0, equals);
    const value = equals < 0 ? '' : pair.slice(equals + 1);
    return { name: decodeOnce(name), value: decodeOnce(value) };
  });
}

/**
 * Reads the admitted query of an address.
 *
 * A name the address does not admit is ignored, so a tracking parameter breaks no link. A name it admits whose value
 * does not match its pattern, that cannot be decoded, or that appears twice makes the address not found.
 *
 * @param candidate the compiled address the path matched
 * @param search the query string
 * @returns the admitted parameters (empty for none), or `null` for an address that is not found
 */
function readQuery(candidate: CompiledAddress, search: string): Record<string, string> | null {
  const found: Record<string, string> = {};
  for (const { name, value } of queryPairs(search)) {
    if (name === null || !candidate.query.includes(name)) continue;
    const allowed = QUERIES.get(name);
    if (value === null || !allowed?.test(value) || Object.hasOwn(found, name)) return null;
    found[name] = value;
  }
  return found;
}

/**
 * Reads the address of a location.
 *
 * The path is matched first, a trailing slash is the same address; anything that matches no pattern is `null`, the
 * "address not found" view. The query is read against the names the address admits (`readQuery`).
 *
 * @param pathname the path of the location
 * @param search the query string of the location, with or without its `?`
 * @returns the address, or `null`
 */
export function parseAddress(pathname: string, search = ''): Address | null {
  let path = pathname;
  while (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  for (const candidate of [...ADDRESSES, ...OUTSIDE]) {
    const match = candidate.regex.exec(path);
    if (match) {
      const params: Record<string, string> = {};
      candidate.names.forEach((name, index) => {
        params[name] = match[index + 1];
      });
      const query = readQuery(candidate, search);
      if (query === null) return null;
      return Object.keys(query).length > 0
        ? { route: candidate.route, params, query }
        : { route: candidate.route, params };
    }
  }
  return null;
}

/**
 * Reads an address given as one string, the way a link or an item of the Due list names it.
 *
 * @param href the path, optionally with a query and a fragment (the fragment is no part of an address)
 * @returns the address, or `null`
 */
export function parseHref(href: string): Address | null {
  const hash = href.indexOf('#');
  const text = hash < 0 ? href : href.slice(0, hash);
  const mark = text.indexOf('?');
  return mark < 0 ? parseAddress(text) : parseAddress(text.slice(0, mark), text.slice(mark));
}

/**
 * Writes the canonical address of an address: the path, then the admitted names that have a value, in the order of
 * the file.
 *
 * @param address the address
 * @returns the path with its query
 * @throws Error for an unknown route, a missing value or a value the pattern does not admit
 */
export function formatAddress(address: Address): string {
  const candidate = [...ADDRESSES, ...OUTSIDE].find((entry) => entry.route === address.route);
  if (!candidate) {
    throw new Error(`unknown route: ${address.route}`);
  }
  const path = candidate.pattern.replace(PLACEHOLDER, (_, name: string) => {
    const value = address.params[name];
    if (value === undefined) {
      throw new Error(`missing value of ${name} for ${address.route}`);
    }
    return value;
  });
  if (!candidate.regex.test(path)) {
    throw new Error(`value refused by ${address.route}: ${path}`);
  }
  const pairs: string[] = [];
  for (const name of candidate.query) {
    const value = address.query?.[name];
    if (value === undefined) continue;
    if (!QUERIES.get(name)?.test(value)) {
      throw new Error(`query value refused by ${address.route}: ${name}`);
    }
    pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  }
  return pairs.length > 0 ? `${path}?${pairs.join('&')}` : path;
}

/**
 * @param route a route id
 * @returns the lens the route belongs to: its first segment, `due` for the start page; the welcome
 * page belongs to no lens
 */
export function lensOf(route: string): Lens | null {
  const head = route.split('.')[0];
  return (LENSES as readonly string[]).includes(head) ? (head as Lens) : null;
}

/**
 * @param lens a lens
 * @returns the canonical address of the lens's start view
 */
export function lensAddress(lens: Lens): string {
  return formatAddress({ route: lens, params: {} });
}

/**
 * @param route a route id
 * @returns the catalogue key of the view's title
 */
export function routeTitleKey(route: string): string {
  if (isOutsideShell(route)) return `${route}.title`;
  if (route === 'welcome') return 'lens.welcome';
  if (route.endsWith('.release') || route === 'release') return 'lens.release';
  const lens = lensOf(route);
  return lens ? `lens.${lens}` : 'error.not-found.title';
}

/** The address a refused `return` is replaced by: the start page. */
export const RETURN_FALLBACK = '/';

/**
 * Checks the `return` of a login on the client, as the server does (AUN-AUTH-1): a same-origin path that starts
 * with a single `/`, holds no backslash and no control character, and is a canonical address of the shell,
 * optionally followed by a query of at most {@link MAX_QUERY_LENGTH} characters whose every name is one the address
 * admits, with a value that matches its pattern, each once. A fragment, a name the address does not admit, a bad or
 * repeated value, or a malformed escape falls back. The addresses outside the shell are no canonical addresses, so a
 * login never returns to the page that started it.
 *
 * @param candidate the requested value, if any
 * @returns the value when it passes, `/` otherwise
 */
export function checkReturn(candidate: string | null | undefined): string {
  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
    /[\u0000-\u001f\u007f-\u009f]/.test(candidate)
  ) {
    return RETURN_FALLBACK;
  }
  const mark = candidate.indexOf('?');
  if (mark < 0) {
    return ADDRESSES.some((entry) => entry.regex.test(candidate)) ? candidate : RETURN_FALLBACK;
  }
  const search = candidate.slice(mark + 1);
  if (search === '' || search.length > MAX_QUERY_LENGTH || search.includes('#')) {
    return RETURN_FALLBACK;
  }
  const address = ADDRESSES.find((entry) => entry.regex.test(candidate.slice(0, mark)));
  return address && queryPasses(address, search) ? candidate : RETURN_FALLBACK;
}

/**
 * @param address the address its path matched
 * @param search the query string, without its `?`
 * @returns whether every pair is `name=value` with an admitted name and a value of its pattern, each name once
 */
function queryPasses(address: CompiledAddress, search: string): boolean {
  const seen = new Set<string>();
  for (const pair of search.split('&')) {
    const equals = pair.indexOf('=');
    if (equals <= 0) return false;
    const name = decodeOnce(pair.slice(0, equals));
    const value = decodeOnce(pair.slice(equals + 1));
    if (name === null || value === null || !address.query.includes(name)) return false;
    if (!QUERIES.get(name)?.test(value) || seen.has(name)) return false;
    seen.add(name);
  }
  return true;
}
