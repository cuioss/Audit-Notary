import { describe, expect, it } from 'vitest';
import canonical from '../main/resources/META-INF/audit-notary/canonical-addresses.json';
import {
  LENSES,
  OUTSIDE_ROUTES,
  ROUTES,
  checkReturn,
  compileAddresses,
  formatAddress,
  isOutsideShell,
  lensAddress,
  lensOf,
  parseAddress,
  routeTitleKey,
} from './routes';

describe('parseAddress', () => {
  it.each([
    ['/', 'due', {}],
    ['/welcome', 'welcome', {}],
    ['/samm', 'samm', {}],
    ['/samm/payments', 'samm.scope', { scope: 'payments' }],
    ['/samm/payments/2026-q4', 'samm.assessment', { scope: 'payments', assessment: '2026-q4' }],
    [
      '/samm/payments/2026-q4/sm',
      'samm.practice',
      { scope: 'payments', assessment: '2026-q4', practice: 'sm' },
    ],
    [
      '/samm/payments/2026-q4/release',
      'samm.release',
      { scope: 'payments', assessment: '2026-q4' },
    ],
    [
      '/threat-models/gateway/checkout',
      'threat-models.model',
      { service: 'gateway', model: 'checkout' },
    ],
    ['/incidents/2026/inc-0007', 'incidents.incident', { year: '2026', incident: 'inc-0007' }],
    ['/isms/risks/r-012', 'isms.risk', { entry: 'r-012' }],
    ['/isms/documents/policy-1', 'isms.document', { id: 'policy-1' }],
    ['/catalogs/team/payments', 'catalogs.entry', { catalog: 'team', id: 'payments' }],
    ['/reports/trends', 'reports.report', { report: 'trends' }],
    ['/settings/appearance', 'settings.section', { section: 'appearance' }],
  ])('reads %s as %s', (path, route, params) => {
    expect(parseAddress(path)).toEqual({ route, params });
  });

  it('treats a trailing slash as the same address', () => {
    expect(parseAddress('/samm/')).toEqual({ route: 'samm', params: {} });
  });

  it.each(['/unknown', '/incidents/26/x', '/samm/Payments', '/samm/a/b/c/d', '//evil'])(
    'answers null for %s',
    (path) => {
      expect(parseAddress(path)).toBeNull();
    },
  );
});

describe('formatAddress', () => {
  it('writes every route back to the path it was read from', () => {
    const samples = [
      '/',
      '/samm/payments/2026-q4/sm',
      '/incidents/2026/inc-0007/release',
      '/catalogs/role',
    ];
    for (const path of samples) {
      const address = parseAddress(path);
      expect(address).not.toBeNull();
      expect(formatAddress(address!)).toBe(path);
    }
  });

  it('refuses an unknown route, a missing value and a value the pattern does not admit', () => {
    expect(() => formatAddress({ route: 'nope', params: {} })).toThrow('unknown route');
    expect(() => formatAddress({ route: 'samm.scope', params: {} })).toThrow('missing value');
    expect(() => formatAddress({ route: 'incidents.year', params: { year: 'abc' } })).toThrow(
      'value refused',
    );
  });
});

describe('lenses', () => {
  it('give every lens an address and a title', () => {
    for (const lens of LENSES) {
      expect(parseAddress(lensAddress(lens))?.route).toBe(lens);
      expect(routeTitleKey(lens)).toBe(`lens.${lens}`);
    }
  });

  it('map routes to their lens', () => {
    expect(lensOf('samm.practice')).toBe('samm');
    expect(lensOf('welcome')).toBeNull();
    expect(routeTitleKey('welcome')).toBe('lens.welcome');
    expect(routeTitleKey('samm.release')).toBe('lens.release');
    expect(routeTitleKey('other')).toBe('error.not-found.title');
  });

  it('list a route id once', () => {
    expect(new Set(ROUTES).size).toBe(ROUTES.length);
  });

  it('compile placeholders with their own pattern or the default segment', () => {
    const [compiled] = compileAddresses({
      segment: '[a-z]+',
      params: { n: '[0-9]+' },
      addresses: [{ route: 'x', pattern: '/x/{n}/{name}' }],
    });
    expect(compiled.names).toEqual(['n', 'name']);
    expect(compiled.regex.test('/x/12/abc')).toBe(true);
    expect(compiled.regex.test('/x/ab/abc')).toBe(false);
  });
});

describe('the addresses outside the shell', () => {
  it.each([
    ['/login', 'login'],
    ['/signed-out', 'signed-out'],
    ['/login-problem', 'login-problem'],
  ])('routes %s as %s and writes it back', (path, route) => {
    expect(parseAddress(path)).toEqual({ route, params: {} });
    expect(formatAddress({ route, params: {} })).toBe(path);
    expect(isOutsideShell(route)).toBe(true);
    expect(routeTitleKey(route)).toBe(`${route}.title`);
    expect(lensOf(route)).toBeNull();
  });

  it('are no canonical addresses: not among the routes, never a valid return', () => {
    // The inventory is the bundled definition's own; the three public routes are pinned by the contract tests above.
    expect(OUTSIDE_ROUTES).toEqual(canonical.outsideShell.map((entry) => entry.route));
    expect(OUTSIDE_ROUTES.length).toBeGreaterThan(0);
    for (const route of OUTSIDE_ROUTES) {
      expect(ROUTES).not.toContain(route);
    }
    expect(isOutsideShell('due')).toBe(false);
    expect(isOutsideShell(null)).toBe(false);
  });

  it('compile from their own section, and an absent section is empty', () => {
    const file = {
      segment: '[a-z]+',
      params: {},
      addresses: [{ route: 'x', pattern: '/x' }],
      outsideShell: [{ route: 'y', pattern: '/y' }],
    };
    expect(compileAddresses(file, 'outsideShell').map((entry) => entry.route)).toEqual(['y']);
    expect(compileAddresses({ ...file, outsideShell: undefined }, 'outsideShell')).toEqual([]);
  });
});

describe('checkReturn', () => {
  it.each(['/', '/samm/payments/2026-q4', '/settings/appearance', '/incidents/2026/inc-0007'])(
    'lets the canonical address %s pass',
    (address) => {
      expect(checkReturn(address)).toBe(address);
    },
  );

  it.each([
    null,
    undefined,
    '',
    'samm',
    '//evil.example/x',
    'https://evil.example/',
    '/samm\\x',
    '/samm/x\u0007',
    '/unknown',
    '/samm/payments?x=1',
    '/login',
    '/signed-out',
    '/login-problem',
  ])('replaces %j by the start page', (candidate) => {
    expect(checkReturn(candidate)).toBe('/');
  });
});
