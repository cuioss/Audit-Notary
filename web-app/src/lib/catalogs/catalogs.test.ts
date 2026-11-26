import { describe, expect, it } from 'vitest';
import { CATALOGS, type CatalogHistoryLine, type EffectiveNeeds, type Session } from '../api/types';
import {
  canAdminister,
  catalogHistory,
  catalogKind,
  catalogName,
  entryAddress,
  formSchema,
  isCatalog,
  nameOfRef,
  refAddress,
} from './catalogs';

function session(...rights: { repository: string; actions: string[] }[]): Session {
  return {
    user: { pseudonym: 'p-1', name: 'Alex' },
    rights,
    csrfToken: 't',
    firstLoginRequired: false,
  } as unknown as Session;
}

describe('the catalogs', () => {
  it('knows the five catalogs and no other', () => {
    for (const id of CATALOGS) {
      expect(isCatalog(id), id).toBe(true);
    }
    expect(isCatalog('schema')).toBe(false);
    expect(isCatalog('new')).toBe(false);
    expect(isCatalog('')).toBe(false);
  });

  it('lets only the right on the directory administer them', () => {
    const admin = { repository: 'directory', actions: ['read', 'administer-catalogs'] };
    expect(canAdminister(session(admin))).toBe(true);
    expect(canAdminister(session({ repository: 'directory', actions: ['read', 'edit'] }))).toBe(
      false,
    );
    // The right on another repository is no right on the catalogs.
    expect(
      canAdminister(session({ repository: 'test-notes', actions: ['administer-catalogs'] })),
    ).toBe(false);
    expect(canAdminister(session())).toBe(false);
    expect(canAdminister(null)).toBe(false);
  });

  it('words a catalog from the catalogue, or from its id', () => {
    const messages = { 'catalog.service.name': 'Services', 'catalog.service.kind': 'Service' };
    expect(catalogName(messages, 'service')).toBe('Services');
    expect(catalogKind(messages, 'service')).toBe('Service');
    expect(catalogName({}, 'external')).toBe('External');
    expect(catalogKind({}, 'external')).toBe('External');
  });

  it('writes the address of an entry and of a reference to one', () => {
    expect(entryAddress('service', 'payment-api')).toBe('/catalogs/service/payment-api');
    expect(entryAddress('service', 'a b')).toBe('/catalogs/service/a%20b');
    expect(refAddress('external:psp-provider')).toBe('/catalogs/external/psp-provider');
    expect(refAddress('unknown:x')).toBeNull();
    expect(refAddress('service:')).toBeNull();
    expect(refAddress('service')).toBeNull();
    expect(refAddress(':x')).toBeNull();
  });

  it('names a reference by the service itself, by a dependency, or by its id', () => {
    const own = { ref: 'service:a', name: 'Alpha' };
    const effective = {
      dependencies: [{ ref: 'service:b', name: 'Beta' }],
    } as unknown as EffectiveNeeds;
    expect(nameOfRef('service:a', own, effective)).toBe('Alpha');
    expect(nameOfRef('service:b', own, effective)).toBe('Beta');
    expect(nameOfRef('service:c', own, effective)).toBe('c');
    expect(nameOfRef('service:c', own, null)).toBe('c');
  });
});

describe('the schema of the form', () => {
  const schema = {
    type: 'object',
    required: ['id', 'name'],
    properties: { id: { type: 'string', pattern: '^x$' }, name: { type: 'string' } },
  };

  it('leaves the schema of a new entry as it is: the id is chosen', () => {
    expect(formSchema(schema, false)).toBe(schema);
  });

  it('reads the id of an entry that exists, and no longer asks for it', () => {
    const shown = formSchema(schema, true) as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    expect(shown.required).toEqual(['name']);
    expect(shown.properties.id).toEqual({ type: 'string', pattern: '^x$', readOnly: true });
    expect(shown.properties.name).toEqual({ type: 'string' });
    // The schema of the catalog itself is not changed.
    expect(schema.required).toEqual(['id', 'name']);
    expect(Object.hasOwn(schema.properties.id, 'readOnly')).toBe(false);
  });

  it('leaves a schema without properties alone, and one without a property id gets one that is read', () => {
    expect(formSchema({ type: 'object' }, true)).toEqual({ type: 'object' });
    const bare = formSchema({ type: 'object', properties: {} }, true) as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(bare.required).toEqual([]);
    expect(bare.properties.id).toEqual({ readOnly: true });
  });
});

describe('the history', () => {
  const lines: CatalogHistoryLine[] = [
    { kind: 'retire', at: '2026-11-26T08:00:00Z', by: { pseudonym: 'p-1', name: 'Noor Haddad' } },
    { kind: 'create', at: '2026-02-11T13:40:00Z', by: { pseudonym: 'p-2', name: 'Jordan Weber' } },
  ];
  const t = (key: string) => `[${key}]`;

  it('words each line with who, what and when: ago for today, the date otherwise', () => {
    const [retired, created] = catalogHistory(lines, t, 'en', new Date('2026-11-26T10:00:00Z'));
    expect(retired.who).toBe('Noor Haddad');
    expect(retired.what).toBe('[catalogs.history.retire]');
    expect(retired.when).toMatch(/hours? ago/);
    expect(retired.datetime).toBe('2026-11-26T08:00:00Z');
    expect(created.what).toBe('[catalogs.history.create]');
    expect(created.when).toMatch(/2026/);
    expect(created.release).toBeUndefined();
    expect(retired.key).not.toBe(created.key);
  });
});
