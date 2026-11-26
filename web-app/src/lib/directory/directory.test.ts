import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { PersonSummary, Session } from '../api/types';
import { messagesStore } from '../i18n';
import { mockMessages } from '../test/scenarioFetch';
import {
  byteLength,
  changedFieldLabel,
  confirmationDue,
  errorKeysByPointer,
  hasName,
  importBudget,
  importReasonKey,
  loadTeamsAndRoles,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_DOCUMENTS,
  membershipsComplete,
  membershipText,
  nameKey,
  namesOf,
  narrowPersons,
  personStateKey,
  referenceName,
  sameMemberships,
  sizeParts,
} from './directory';

afterEach(() => {
  messagesStore.set({});
  vi.restoreAllMocks();
});

const SESSION: Session = {
  user: { pseudonym: 'p-1', name: 'Alex' },
  rights: [],
  csrfToken: 't',
  firstLoginRequired: false,
};

const PERSON = (name: string | null, pseudonym = 'p-1'): PersonSummary => ({
  pseudonym,
  name,
  state: 'bound',
  memberships: [],
});

describe('confirmationDue', () => {
  it('is true only for a session that says so and has no first login to do', () => {
    expect(confirmationDue(null)).toBe(false);
    expect(confirmationDue(SESSION)).toBe(false);
    expect(confirmationDue({ ...SESSION, directoryConfirmationDue: false })).toBe(false);
    expect(confirmationDue({ ...SESSION, directoryConfirmationDue: true })).toBe(true);
    expect(
      confirmationDue({ ...SESSION, directoryConfirmationDue: true, firstLoginRequired: true }),
    ).toBe(false);
  });
});

describe('the limits of the import', () => {
  it('measures the descriptors in bytes of UTF-8, not in characters', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('äöü')).toBe(6);
  });

  it('counts the documents and their size together', () => {
    const budget = importBudget([
      { name: 'a', content: 'abc' },
      { name: 'b', content: 'äö' },
    ]);
    expect(budget).toEqual({ count: 2, bytes: 7, tooMany: false, tooLarge: false });
  });

  it('tells too many documents and too large a size apart, each at its limit and not before', () => {
    const many = Array.from({ length: MAX_IMPORT_DOCUMENTS }, (_, n) => ({
      name: `d${n}`,
      content: '',
    }));
    expect(importBudget(many).tooMany).toBe(false);
    expect(importBudget([...many, { name: 'one more', content: '' }]).tooMany).toBe(true);
    const full = [{ name: 'big', content: 'x'.repeat(MAX_IMPORT_BYTES) }];
    expect(importBudget(full).tooLarge).toBe(false);
    expect(importBudget([...full, { name: 'a byte', content: 'x' }]).tooLarge).toBe(true);
  });

  it.each([
    [0, '0', 'B'],
    [1023, '1023', 'B'],
    [1024, '1.0', 'KiB'],
    [1536, '1.5', 'KiB'],
    [1_048_575, '1024.0', 'KiB'],
    [MAX_IMPORT_BYTES, '2.0', 'MiB'],
  ])('writes %i bytes as %s %s', (bytes, value, unit) => {
    expect(sizeParts(bytes)).toEqual({ value, unit });
  });
});

describe('the reasons of the import', () => {
  it('has a text for every reason of the register and a general one for another', () => {
    messagesStore.set(mockMessages('en'));
    for (const reason of [
      'NAMESPACE_NOT_DEFAULT',
      'REFERENCE_KIND_NOT_SUPPORTED',
      'LIFECYCLE_UNMAPPED',
      'DEFAULTS_MISSING',
      'KIND_NOT_SUPPORTED',
    ]) {
      expect(importReasonKey(reason)).toBe(
        `import.reason.${reason.toLowerCase().replaceAll('_', '-')}`,
      );
    }
    expect(importReasonKey('SOMETHING_NEW')).toBe('import.reason.unknown');
  });

  it('names a changed field as the form of the catalog does, or in words', () => {
    const messages = mockMessages('en');
    expect(changedFieldLabel(messages, 'service', 'lifecycle')).toBe('Lifecycle');
    expect(changedFieldLabel(messages, 'service', 'owner.team')).toBe('Team');
    expect(changedFieldLabel(messages, 'service', 'spec.unheard-of')).toBe('Unheard of');
  });
});

describe('memberships in words', () => {
  const teams = namesOf([
    { id: 'payments', name: 'Payments' },
    { id: 'identity', name: 'Identity Platform' },
  ]);
  const roles = namesOf([{ id: 'developer', name: 'Developer' }]);
  const words = (team: string, role: string) => `${team}, ${role}`;

  it('uses the name of the entry, and its id when the catalog does not know it', () => {
    expect(referenceName('team:payments', teams)).toBe('Payments');
    expect(referenceName('team:gone', teams)).toBe('gone');
    expect(
      membershipText({ team: 'team:identity', role: 'role:developer' }, teams, roles, words),
    ).toBe('Identity Platform, Developer');
    expect(membershipText({ team: 'team:x', role: 'role:y' }, teams, roles, words)).toBe('x, y');
  });

  it('is complete with one to five rows that each name a team and a role', () => {
    const row = { team: 'team:payments', role: 'role:developer' };
    expect(membershipsComplete([])).toBe(false);
    expect(membershipsComplete([row])).toBe(true);
    expect(membershipsComplete([row, { team: 'team:payments', role: '' }])).toBe(false);
    expect(membershipsComplete([{ team: '', role: 'role:developer' }])).toBe(false);
    expect(membershipsComplete(Array.from({ length: 5 }, () => row))).toBe(true);
    expect(membershipsComplete(Array.from({ length: 6 }, () => row))).toBe(false);
  });

  it('compares memberships by team and role in order', () => {
    const a = { team: 'team:a', role: 'role:x' };
    const b = { team: 'team:b', role: 'role:y' };
    expect(sameMemberships([a, b], [{ ...a }, { ...b }])).toBe(true);
    expect(sameMemberships([a, b], [b, a])).toBe(false);
    expect(sameMemberships([a], [a, b])).toBe(false);
  });
});

describe('persons', () => {
  it('compares names without regard to case and blanks, and finds a typed text anywhere in a name', () => {
    expect(nameKey('  Alex   EXAMPLE ')).toBe('alex example');
    const persons = [
      PERSON('Alex Example', 'p-1'),
      PERSON('Jordan Weber', 'p-2'),
      PERSON(null, 'p-3'),
    ];
    expect(narrowPersons(persons, '').map((p) => p.pseudonym)).toEqual(['p-1', 'p-2', 'p-3']);
    expect(narrowPersons(persons, ' WEB ').map((p) => p.pseudonym)).toEqual(['p-2']);
    expect(narrowPersons(persons, 'nobody')).toEqual([]);
  });

  it('knows a former member by the missing name, and words every state', () => {
    expect(hasName(PERSON('Alex'))).toBe(true);
    expect(hasName(PERSON(null))).toBe(false);
    expect(personStateKey('unbound')).toBe('directory.persons.state.unbound');
  });
});

describe('the answers of the server', () => {
  it('turns field errors into the texts of the form, the first of a pointer winning', () => {
    messagesStore.set(mockMessages('en'));
    expect(
      errorKeysByPointer([
        { pointer: '/name', code: 'REQUIRED' },
        { pointer: '/name', code: 'MAX_LENGTH' },
        { pointer: '/memberships/0/team', code: 'REFERENCE_NOT_FOUND' },
        { pointer: '/persons', code: 'TOO_MANY' },
      ]),
    ).toEqual({
      '/name': 'form.error.required',
      '/memberships/0/team': 'form.error.reference-not-found',
      '/persons': 'form.error.invalid',
    });
  });

  it('reads the teams and the roles together, and fails when either does', async () => {
    const get = vi.spyOn(apiClient, 'getCatalog');
    get.mockImplementation(async (catalog) => ({
      entries: [{ id: `${catalog}-1`, name: catalog }],
    }));
    expect(await loadTeamsAndRoles()).toEqual({
      teams: [{ id: 'team-1', name: 'team' }],
      roles: [{ id: 'role-1', name: 'role' }],
    });
    get.mockImplementation(async (catalog) => {
      if (catalog === 'role') throw new ApiError('NETWORK', 0);
      return { entries: [] };
    });
    await expect(loadTeamsAndRoles()).rejects.toMatchObject({ outcome: 'NETWORK' });
  });
});
