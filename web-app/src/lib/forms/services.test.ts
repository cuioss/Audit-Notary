import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFormServices, exceedsRenderLimit, personName } from './services';
import { useProfile } from './testkit';

afterEach(() => vi.unstubAllGlobals());

describe('the reading services of a form', () => {
  it('reads a catalog once and keeps the retired entries in the list', async () => {
    const kit = useProfile();
    const first = await kit.services.catalog('service');
    await kit.services.catalog('service');
    expect(kit.requests.filter((request) => request.includes('/catalogs/service'))).toHaveLength(1);
    expect(first.state).toBe('found');
    const entries = first.state === 'found' ? first.value : [];
    expect(entries.map((entry) => entry.id)).toEqual([
      'payment-api',
      'customer-portal',
      'identity-provider',
      'customer-db',
      'reporting',
      'report-scheduler',
      'ledger',
      'notification-service',
    ]);
    expect(entries.filter((entry) => entry.retired).map((entry) => entry.id)).toEqual(['ledger']);
  });

  it('asks again after a failure and keeps no failure', async () => {
    const kit = useProfile();
    const refused = await kit.services.catalog('nope');
    expect(refused.state).toBe('failed');
    await kit.services.catalog('nope');
    expect(kit.requests.filter((request) => request.includes('/catalogs/nope'))).toHaveLength(2);
  });

  it('lists the persons once, asks the server again with q, and resolves one pseudonym', async () => {
    const kit = useProfile();
    const all = await kit.services.persons();
    await kit.services.persons();
    expect(
      kit.requests.filter((request) => request === 'GET /api/v1/directory/persons'),
    ).toHaveLength(1);
    expect(all.state === 'found' && all.value.persons.map((person) => person.state)).toEqual([
      'bound',
      'bound',
      'bound',
      'unbound',
      'bound',
    ]);
    expect(all.state === 'found' && all.value.truncated).toBe(false);
    await kit.services.persons('ha');
    expect(kit.requests).toContain('GET /api/v1/directory/persons?q=ha');
    const former = await kit.services.person('p-0f8a42');
    expect(former).toMatchObject({
      state: 'found',
      value: { state: 'former', name: null, erasedOn: '2026-09-30' },
    });
    expect(await kit.services.person('p-3b9d00')).toEqual({ state: 'missing' });
    expect((await kit.services.person('p-7d52e8')).state).toBe('found');
  });

  it('answers a list that cannot be read as failed, and reads it again the next time', async () => {
    const kit = useProfile('no-rights');
    expect((await kit.services.persons()).state).toBe('failed');
    expect((await kit.services.persons()).state).toBe('failed');
    expect(
      kit.requests.filter((request) => request === 'GET /api/v1/directory/persons'),
    ).toHaveLength(2);
    expect((await kit.services.person('p-4c1a9e')).state).toBe('failed');
  });

  it('resolves references in one request, found, retired, without an address, and not found', async () => {
    const kit = useProfile();
    const answers = await Promise.all(
      [
        'samm-assessments:assessment/payments-2026-q4',
        'service:ledger',
        'test-notes:note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G',
        'isms-register:risk/R-999',
        'service:payment-api',
        'unlisted:thing/1',
      ].map((ref) => kit.services.reference(ref)),
    );
    expect(kit.requests.filter((request) => request.includes('/references/resolve'))).toHaveLength(
      1,
    );
    expect(kit.requests.find((request) => request.includes('/references/resolve'))).toContain(
      'ref=samm-assessments%3Aassessment%2Fpayments-2026-q4&ref=service%3Aledger',
    );
    expect(answers.map((answer) => answer.state)).toEqual([
      'found',
      'found',
      'found',
      'found',
      'found',
      'missing',
    ]);
    expect(answers[1]).toMatchObject({ value: { retired: true, found: true } });
    expect(answers[2]).toMatchObject({ value: { found: true, address: null } });
    expect(answers[3]).toMatchObject({ value: { found: false } });
  });

  it('asks for at most 50 references in one request', async () => {
    const kit = useProfile();
    const refs = Array.from({ length: 120 }, (_, index) => `service:s-${index}`);
    await Promise.all(refs.map((ref) => kit.services.reference(ref)));
    expect(kit.requests.filter((request) => request.includes('/references/resolve'))).toHaveLength(
      3,
    );
  });

  it('answers a reference that cannot be resolved as failed', async () => {
    const kit = useProfile('no-rights');
    expect((await kit.services.reference('service:ledger')).state).toBe('failed');
  });

  it('renders the preview and marks a source that is too large or a renderer that cannot run', async () => {
    const kit = useProfile();
    expect(await kit.services.render('* one\n* two')).toEqual({
      state: 'html',
      html: '<ul><li>one</li><li>two</li></ul>',
    });
    expect(await kit.services.render('é'.repeat(32_769))).toEqual({ state: 'too-large' });
    expect(await kit.services.render('é'.repeat(32_768))).toMatchObject({ state: 'html' });
    expect(exceedsRenderLimit('a'.repeat(65_536))).toBe(false);
    expect(exceedsRenderLimit('a'.repeat(65_537))).toBe(true);
    kit.scenario.goto('preview-unavailable');
    expect(await kit.services.render('x')).toEqual({ state: 'unavailable' });
  });

  it('takes the 413 of the server as too large even when the client counted less', async () => {
    const kit = useProfile();
    const client = kit.client;
    vi.spyOn(client, 'renderAsciiDoc').mockRejectedValue(new ApiError('TOO_LARGE', 413));
    expect(await createFormServices(client).render('short')).toEqual({ state: 'too-large' });
  });

  it('names a former member by the pseudonym', () => {
    expect(
      personName({ pseudonym: 'p-0f8a42', name: null, state: 'former', memberships: [] }),
    ).toBe('p-0f8a42');
    expect(personName({ pseudonym: 'p-1', name: 'Alex', state: 'bound', memberships: [] })).toBe(
      'Alex',
    );
  });
});
