/**
 * The address model of the web app (AUN-WEB-3): one canonical address per object kind, and reloading an
 * address restores the same view.
 *
 * The addresses are data, `META-INF/audit-notary/canonical-addresses.json`, shared with the server's check of
 * the login's `return` (AUN-AUTH-1) and with the mock server.
 */
import canonical from '../main/resources/META-INF/audit-notary/canonical-addresses.json';

/** A lens of the navigation rail (AUN-WEB-3). */
export type Lens =
  'due' | 'samm' | 'threat-models' | 'incidents' | 'isms' | 'catalogs' | 'reports' | 'settings';

/** The lenses in rail order. */
export const LENSES: readonly Lens[] = [
  'due',
  'samm',
  'threat-models',
  'incidents',
  'isms',
  'catalogs',
  'reports',
  'settings',
];

/** An address: the route id of `canonical-addresses.json` and the values of its placeholders. */
export interface Address {
  route: string;
  params: Record<string, string>;
}

interface CompiledAddress {
  route: string;
  pattern: string;
  names: string[];
  regex: RegExp;
}

interface CanonicalFile {
  segment: string;
  params: Record<string, string>;
  addresses: { route: string; pattern: string }[];
  /**
   * The addresses shown without the shell: routed by the web app, never a valid `return` of a login
   * (doc/specification/rest-api.adoc, Addresses Outside the Shell).
   */
  outsideShell?: { route: string; pattern: string }[];
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
  return (file[section] ?? []).map(({ route, pattern }) => {
    const names: string[] = [];
    const source = pattern.replace(PLACEHOLDER, (_, name: string) => {
      names.push(name);
      return `(${file.params[name] ?? file.segment})`;
    });
    // The patterns come from the bundled file, not from input.
    // eslint-disable-next-line security/detect-non-literal-regexp
    return { route, pattern, names, regex: new RegExp(`^${source}$`) };
  });
}

const ADDRESSES = compileAddresses(canonical as CanonicalFile);
const OUTSIDE = compileAddresses(canonical as CanonicalFile, 'outsideShell');

/** The route ids of every canonical address; the addresses outside the shell are not among them. */
export const ROUTES: readonly string[] = ADDRESSES.map((address) => address.route);

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
 * Reads the address of a path.
 *
 * A trailing slash is the same address; anything that matches no pattern is `null`, the
 * "address not found" view.
 *
 * @param pathname the path of the location
 * @returns the address, or `null`
 */
export function parseAddress(pathname: string): Address | null {
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
      return { route: candidate.route, params };
    }
  }
  return null;
}

/**
 * Writes the canonical path of an address.
 *
 * @param address the address
 * @returns the path
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
  return path;
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
 * with a single `/`, holds no backslash and no control character, and is a canonical address of the shell. The
 * addresses outside the shell are no canonical addresses, so a login never returns to the page that started it.
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
  return ADDRESSES.some((entry) => entry.regex.test(candidate)) ? candidate : RETURN_FALLBACK;
}
