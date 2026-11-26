import { describe, expect, it } from 'vitest';
import canonical from '../main/resources/META-INF/audit-notary/canonical-addresses.json';
import {
  LENSES,
  OUTSIDE_ROUTES,
  ROUTES,
  checkReturn,
  MAX_QUERY_LENGTH,
  compileAddresses,
  compileQueries,
  formatAddress,
  isOutsideShell,
  lensAddress,
  lensOf,
  parseAddress,
  parseHref,
  routeTitleKey,
  routesUnder,
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

describe('the directory and the catalogs', () => {
  it.each([
    ['/catalogs', 'catalogs', {}],
    ['/catalogs/service', 'catalogs.catalog', { catalog: 'service' }],
    ['/catalogs/service/new', 'catalogs.new', { catalog: 'service' }],
    ['/catalogs/service/payment-api', 'catalogs.entry', { catalog: 'service', id: 'payment-api' }],
    ['/directory/import', 'catalogs.import', {}],
    ['/directory/persons', 'catalogs.persons', {}],
    ['/settings/profile', 'settings.profile', {}],
    ['/settings/appearance', 'settings.section', { section: 'appearance' }],
  ])('reads %s as %s and writes it back', (path, route, params) => {
    expect(parseAddress(path)).toEqual({ route, params });
    expect(formatAddress({ route, params })).toBe(path);
    expect(checkReturn(path)).toBe(path);
  });

  it('keeps the administration pages in the lens Catalogs and the own entry in Settings', () => {
    expect(lensOf('catalogs.import')).toBe('catalogs');
    expect(lensOf('catalogs.persons')).toBe('catalogs');
    expect(lensOf('catalogs.new')).toBe('catalogs');
    expect(lensOf('settings.profile')).toBe('settings');
  });

  it('reads the routes under /catalogs from the canonical addresses, without the directory pages', () => {
    expect(routesUnder('catalogs')).toEqual([
      'catalogs',
      'catalogs.catalog',
      'catalogs.new',
      'catalogs.entry',
    ]);
    expect(routesUnder('directory')).toEqual(['catalogs.import', 'catalogs.persons']);
    expect(routesUnder('catalog')).toEqual([]);
  });

  it('never reads an address of /directory as a catalog address', () => {
    expect(parseAddress('/directory/import')?.route).not.toBe('catalogs.entry');
    expect(parseAddress('/directory')).toBeNull();
    expect(parseAddress('/directory/other')).toBeNull();
    expect(parseAddress('/catalogs/import/backstage')?.route).toBe('catalogs.entry');
  });
});

const N1 = '01JZ8Q4Y5N6V7X8B9C0D1E2F3G';

describe('the generic documents lens', () => {
  it('puts the lens after ISMS and gives it its title', () => {
    expect(LENSES.indexOf('categories')).toBe(LENSES.indexOf('isms') + 1);
    expect(lensAddress('categories')).toBe('/categories');
    expect(routeTitleKey('categories.document')).toBe('lens.categories');
    expect(routeTitleKey('categories.release')).toBe('lens.release');
    expect(lensOf('categories.new')).toBe('categories');
  });

  it.each([
    ['/categories', 'categories', {}],
    ['/categories/test-note', 'categories.category', { category: 'test-note' }],
    ['/categories/test-note/new', 'categories.new', { category: 'test-note' }],
    [`/categories/test-note/${N1}`, 'categories.document', { category: 'test-note', document: N1 }],
    [
      `/categories/test-note/${N1}/release`,
      'categories.release',
      { category: 'test-note', document: N1 },
    ],
  ])('reads %s as %s', (path, route, params) => {
    expect(parseAddress(path)).toEqual({ route, params });
  });

  it('reads an upper case document id, which the default segment would refuse', () => {
    expect(parseAddress(`/categories/test-note/${N1.toLowerCase()}`)?.route).toBe(
      'categories.document',
    );
    expect(parseAddress('/categories/Test-Note')).toBeNull();
  });
});

describe('the query of an address', () => {
  const document = `/categories/test-note/${N1}`;

  it('is read with its admitted names, and is absent without one', () => {
    expect(parseAddress(document, '?at=v1')).toEqual({
      route: 'categories.document',
      params: { category: 'test-note', document: N1 },
      query: { at: 'v1' },
    });
    expect(parseAddress(document, 'at=4be0c3a')?.query).toEqual({ at: '4be0c3a' });
    expect(parseAddress('/categories/test-note/new', '?kind=note')?.query).toEqual({
      kind: 'note',
    });
    expect(parseAddress(document)).not.toHaveProperty('query');
    expect(parseAddress(document, '')).not.toHaveProperty('query');
    expect(parseAddress(document, '?')).not.toHaveProperty('query');
  });

  it('ignores a name the address does not admit, so a tracking parameter breaks no link', () => {
    expect(parseAddress(document, '?utm_source=mail')).not.toHaveProperty('query');
    expect(parseAddress(document, '?at=v1&utm_source=mail')?.query).toEqual({ at: 'v1' });
    expect(parseAddress(document, '?kind=note')).not.toHaveProperty('query');
    expect(parseAddress('/samm', '?at=zzz&x')?.route).toBe('samm');
    expect(parseAddress(document, '?&&utm=%zz&flag')?.route).toBe('categories.document');
  });

  it.each([
    '?at=zzz',
    '?at=V1',
    '?at=v12345',
    '?at=abc123',
    '?at=',
    '?at',
    '?at=v1&at=v2',
    '?at=%',
    '?at=%zz',
    '?at=%ff',
    '?at=v1%',
  ])('makes an address with the admitted name and the value %s not found', (search) => {
    expect(parseAddress(document, search)).toBeNull();
  });

  it('decodes a name and a value once, and a plus stays a plus', () => {
    expect(parseAddress(document, '?%61t=%76%31')?.query).toEqual({ at: 'v1' });
    expect(parseAddress(document, '?at=v1+')).toBeNull();
    expect(parseAddress(document, '?at=v%2B')).toBeNull();
    expect(parseAddress(document, '?at=%2576%31')).toBeNull();
  });

  it('is written in the order of the file, with only the admitted names that have a value', () => {
    expect(
      formatAddress({
        route: 'categories.document',
        params: { category: 'test-note', document: N1 },
        query: { at: 'v2', kind: 'note', other: 'x' },
      }),
    ).toBe(`${document}?at=v2`);
    expect(
      formatAddress({
        route: 'categories.new',
        params: { category: 'test-note' },
        query: { kind: 'note' },
      }),
    ).toBe('/categories/test-note/new?kind=note');
    expect(
      formatAddress({
        route: 'categories.document',
        params: { category: 'test-note', document: N1 },
      }),
    ).toBe(document);
  });

  it('refuses to write a value its pattern does not admit', () => {
    expect(() =>
      formatAddress({
        route: 'categories.document',
        params: { category: 'test-note', document: N1 },
        query: { at: 'latest' },
      }),
    ).toThrow('query value refused');
  });

  it('is read and written back to the same address', () => {
    for (const [path, search] of [
      [document, '?at=0123456789abcdef0123456789abcdef01234567'],
      ['/categories/test-note/new', '?kind=note'],
    ]) {
      const address = parseAddress(path, search);
      expect(address).not.toBeNull();
      expect(formatAddress(address!)).toBe(`${path}${search}`);
    }
  });

  it('compiles the value patterns against the whole value, and none for a file without queries', () => {
    const queries = compileQueries({
      segment: '[a-z]+',
      params: {},
      queries: { n: '[0-9]+|x' },
      addresses: [],
    });
    expect(queries.get('n')?.test('12')).toBe(true);
    expect(queries.get('n')?.test('12a')).toBe(false);
    expect(queries.get('n')?.test('x')).toBe(true);
    expect(queries.get('n')?.test('ax')).toBe(false);
    expect(compileQueries({ segment: '[a-z]+', params: {}, addresses: [] }).size).toBe(0);
  });

  it('names its queries in the bundled file, each with a pattern', () => {
    for (const entry of canonical.addresses) {
      for (const name of (entry as { query?: string[] }).query ?? []) {
        expect(Object.keys(canonical.queries), `${entry.route}: ${name}`).toContain(name);
      }
    }
  });
});

describe('checkReturn with a query', () => {
  const document = `/categories/test-note/${N1}`;

  it.each([
    '/categories',
    '/categories/test-note',
    document,
    `${document}?at=v1`,
    `${document}?at=v12`,
    `${document}?at=4be0c3a`,
    `${document}?at=0123456789abcdef0123456789abcdef01234567`,
    `${document}?%61t=v1`,
    '/categories/test-note/new',
    '/categories/test-note/new?kind=note',
    `${document}/release`,
  ])('lets %s pass', (address) => {
    expect(checkReturn(address)).toBe(address);
  });

  it.each([
    `${document}?at=zzz`,
    `${document}?at=V1`,
    `${document}?at=v12345`,
    `${document}?at=abc123`,
    `${document}?at=`,
    `${document}?at`,
    `${document}?`,
    `${document}?foo=1`,
    `${document}?at=v1&foo=1`,
    `${document}?at=v1&at=v2`,
    `${document}?at=v1&&`,
    `${document}?kind=note`,
    `${document}?at=v1#x`,
    `${document}?at=%`,
    `${document}?at=%zz`,
    `${document}?at=%ff`,
    `${document}?%zz=v1`,
    `${document}#x`,
    '/categories/test-note/new?at=v1',
    '/categories/test-note/new?kind=NOTE',
    '/categories/test-note/new?kind=a&kind=b',
    '/categories/test-note/new#x',
    '/categories/test-note?at=v1',
    '/categories?kind=note',
    `${document}/release?at=v1`,
    '/samm/payments?at=v1',
    '/login?return=%2F',
  ])('replaces %s by the start page', (candidate) => {
    expect(checkReturn(candidate)).toBe('/');
  });

  it('refuses a query beyond its length, whatever its names', () => {
    const long = `${document}?at=v1&${'a'.repeat(MAX_QUERY_LENGTH)}=1`;
    expect(checkReturn(long)).toBe('/');
    expect(checkReturn(`${document}?at=${'a'.repeat(MAX_QUERY_LENGTH - 3)}`)).toBe('/');
    expect(MAX_QUERY_LENGTH).toBe(256);
  });
});

describe('parseHref', () => {
  it('reads an address given as one string, the way a Due item or a link names it', () => {
    expect(parseHref('/samm/payments')?.route).toBe('samm.scope');
    expect(parseHref('/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=v1')?.query).toEqual({
      at: 'v1',
    });
    expect(parseHref('/categories/test-note/new?kind=note#top')?.query).toEqual({ kind: 'note' });
    expect(parseHref('/categories/test-note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G?at=zzz')).toBeNull();
    expect(parseHref('/nowhere')).toBeNull();
  });
});
