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
}

const PLACEHOLDER = /\{([a-z][a-z0-9]*)\}/g;

/**
 * Compiles the address patterns.
 *
 * @param file the content of `canonical-addresses.json`
 * @returns the addresses in file order, each with an anchored expression
 */
export function compileAddresses(file: CanonicalFile): CompiledAddress[] {
  return file.addresses.map(({ route, pattern }) => {
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

/** The route ids of every canonical address. */
export const ROUTES: readonly string[] = ADDRESSES.map((address) => address.route);

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
  for (const candidate of ADDRESSES) {
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
  const candidate = ADDRESSES.find((entry) => entry.route === address.route);
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
  if (route === 'welcome') return 'lens.welcome';
  if (route.endsWith('.release') || route === 'release') return 'lens.release';
  const lens = lensOf(route);
  return lens ? `lens.${lens}` : 'error.not-found.title';
}
