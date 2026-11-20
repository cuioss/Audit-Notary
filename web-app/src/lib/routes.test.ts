import { describe, expect, it } from 'vitest';
import {
  LENSES,
  ROUTES,
  compileAddresses,
  formatAddress,
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
