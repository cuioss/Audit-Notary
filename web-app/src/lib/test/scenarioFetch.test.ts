import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  bodyOf,
  HANDLERS,
  mockMessages,
  renderAsciiDocLikeTheMock,
  scenarioFetch,
  SCENARIO_DIR,
} from './scenarioFetch';

/**
 * The scenario fetch of the unit tests follows the rules of the mock's `ScenarioLoader` and `MockEngine`.
 */
describe('scenarioFetch', () => {
  it('takes the method of a Request', async () => {
    const scenario = scenarioFetch('workshop');
    const answer = await scenario.fetch(
      new Request('http://localhost/api/v1/documents/samm-assessments/payments-2026-q4/save', {
        method: 'POST',
      }),
    );
    expect(await answer.json()).toMatchObject({ outcome: 'SAVED' });
  });

  it('follows a link and moves to its next state', async () => {
    const scenario = scenarioFetch('release');
    const answer = await scenario.fetch('/api/v1/releases/samm-assessments/payments-2026-q4', {
      method: 'POST',
    });
    expect(answer.status).toBe(403);
    expect(scenario.state()).toBe('stepped-up');
  });

  it('keeps a release refused as changed since the review until the diff is read again, like the mock', async () => {
    const scenario = scenarioFetch('workshop');
    const n4 = '01JZ8T5C7E9G1J3M5P7R9V1X3Z';
    const release = () =>
      scenario.fetch(`/api/v1/releases/test-notes/${n4}`, { method: 'POST', body: '{}' });
    scenario.goto('note-release-changed');
    expect((await release()).status).toBe(409);
    expect(scenario.state()).toBe('note-release-changed-refused');
    expect((await release()).status).toBe(409);
    await scenario.fetch(`/api/v1/documents/test-notes/${n4}`);
    expect((await release()).status).toBe(409);
    await scenario.fetch(`/api/v1/documents/test-notes/${n4}/diff`);
    expect(scenario.state()).toBe('note-release-changed-reviewed');
    expect(await (await release()).json()).toMatchObject({ outcome: 'RELEASED' });
    expect(scenario.state()).toBe('note-release-changed-done');
  });

  it('reads a data file and refuses what the mock refuses', () => {
    expect(bodyOf({ body_file: 'samm-scopes.json' })).toHaveProperty('scopes');
    expect(() => bodyOf({ body: {}, body_file: 'samm-scopes.json' })).toThrow(
      'either body or body_file',
    );
    expect(() => bodyOf({ body_file: '../release.json' })).toThrow('refused data file');
    expect(bodyOf({ body: { a: 1 } })).toEqual({ a: 1 });
    expect(bodyOf({})).toEqual({});
  });

  it('refuses every request on a repository for a session without a right, and keeps the shell requests', async () => {
    const scenario = scenarioFetch('no-rights');
    const refused = await scenario.fetch('/api/v1/samm/scopes');
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ outcome: 'FORBIDDEN' });
    const draft = await scenario.fetch('/api/v1/drafts/samm-assessments/x', { method: 'PUT' });
    expect(draft.status).toBe(403);
    const session = await (await scenario.fetch('/api/v1/session')).json();
    expect(session.rights).toEqual([]);
    expect((await scenario.fetch('/api/v1/due')).status).toBe(200);
    expect((await scenario.fetch('/api/v1/status')).status).toBe(200);
  });

  it('answers a document of a repository of the rights that no route names with 404 NOT_FOUND, like the mock', async () => {
    const scenario = scenarioFetch('workshop');
    const unknown = '01JZ9ZZZZZZZZZZZZZZZZZZZZZ';
    for (const [method, address] of [
      ['GET', `/api/v1/documents/test-notes/${unknown}`],
      ['GET', `/api/v1/documents/test-notes/${unknown}/revisions`],
      ['PUT', `/api/v1/drafts/test-notes/${unknown}`],
      ['POST', `/api/v1/releases/samm-assessments/${unknown}`],
    ]) {
      const answer = await scenario.fetch(address, { method });
      expect(answer.status, address).toBe(404);
      expect(await answer.json(), address).toEqual({ outcome: 'NOT_FOUND' });
    }
    const elsewhere = await scenario.fetch(`/api/v1/documents/not-a-repository/${unknown}`);
    expect((await elsewhere.json()).outcome).toBe('MOCK_NO_ROUTE');
  });

  it('answers the form login of local users with an empty 200 or 401, and refuses it for the provider', async () => {
    const local = scenarioFetch('local');
    const body = (password: string) =>
      new URLSearchParams({ j_username: 'alex', j_password: password });
    const accepted = await local.fetch('/j_security_check', {
      method: 'POST',
      body: body('local-password'),
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.text()).toBe('');
    const wrong = await local.fetch('/j_security_check', { method: 'POST', body: body('nope') });
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toBe('');
    const oidc = await scenarioFetch('workshop').fetch('/j_security_check', {
      method: 'POST',
      body: body('local-password'),
    });
    expect(oidc.status).toBe(404);
  });

  it('reads the form credentials from a Request passed instead of an init body', async () => {
    const local = scenarioFetch('local');
    const login = (password: string) =>
      new Request('http://localhost/j_security_check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ j_username: 'alex', j_password: password }),
      });
    expect((await local.fetch(login('local-password'))).status).toBe(200);
    expect((await local.fetch(login('nope'))).status).toBe(401);
  });

  it('applies the flags of the selected state from the first request', async () => {
    const ended = scenarioFetch('workshop#session-ended');
    const refused = await ended.fetch('/api/v1/session');
    expect(refused.status).toBe(401);
    expect((await refused.json()).outcome).toBe('UNAUTHENTICATED');
    const ordinary = scenarioFetch('workshop');
    expect((await ordinary.fetch('/api/v1/session')).status).toBe(200);
    const replaced = scenarioFetch('workshop#session-replaced');
    const first = (await (await replaced.fetch('/api/v1/session')).json()).csrfToken;
    expect(first).not.toBe((await (await ordinary.fetch('/api/v1/session')).json()).csrfToken);
  });

  it('replaces the anti-CSRF token when a state replaces the session, and ends it with session-ended', async () => {
    const scenario = scenarioFetch('workshop');
    const token = async () => (await (await scenario.fetch('/api/v1/session')).json()).csrfToken;
    const first = await token();
    scenario.goto('session-replaced');
    expect(await token()).not.toBe(first);
    scenario.goto('session-ended');
    const ended = await scenario.fetch('/api/v1/session');
    expect(ended.status).toBe(401);
    expect(await ended.json()).toEqual({
      outcome: 'UNAUTHENTICATED',
      login: '/api/v1/auth/login',
    });
    expect((await scenario.fetch('/api/v1/status')).status).toBe(200);
  });

  it('has exactly the handlers of the mock engine, each with its own answer', () => {
    // The enum of the mock is the single definition (web-mock `Handler`): its names are read, not copied.
    const source = fs.readFileSync(
      path.resolve(SCENARIO_DIR, '../../java/de/cuioss/notary/audit/mock/scenario/Handler.java'),
      'utf8',
    );
    const names = [...source.matchAll(/^\s+[A-Z_]+\("([a-z-]+)"[,)]/gm)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(0);
    expect([...HANDLERS.keys()].sort()).toEqual(names.sort());
  });

  describe('the query-keyed routes and the search of the mock', () => {
    const N6 = '/api/v1/documents/test-notes/01JZ8W1E3G5J7M9P1R3T5X7Z9B';

    it('answers a key with a query to a request that holds it, and a key without query to any query', async () => {
      const scenario = scenarioFetch('workshop');
      const read = async (query: string) => await (await scenario.fetch(`${N6}${query}`)).json();
      expect((await read('?at=v1')).at.ref).toBe('v1');
      expect((await read('?at=v1&x=1')).at.ref).toBe('v1');
      expect((await read('?at=4be0c3a')).state).toBe('in-review');
      expect((await read('')).at).toBeUndefined();
      expect((await read('?x=1')).at).toBeUndefined();
      expect((await read('?at=deadbee')).outcome).toBe('NOT_FOUND');
      const malformed = await scenario.fetch(`${N6}?at=zzz`);
      expect(malformed.status).toBe(422);
      expect(await malformed.json()).toMatchObject({
        errors: [{ pointer: '/at', code: 'FORMAT' }],
      });
    });

    it('searches the index of the repositories the rights read, like the handler of the mock', async () => {
      const scenario = scenarioFetch('workshop');
      const search = async (query: string) => await scenario.fetch(`/api/v1/search${query}`);
      const rotation = await (await search('?q=rotation')).json();
      expect(rotation.results.map((hit: { id: string }) => hit.id)).toEqual([
        '01JZ8Q4Y5N6V7X8B9C0D1E2F3G',
      ]);
      const payments = await (await search('?q=PAYMENTS')).json();
      expect(payments.results.map((hit: { title: string }) => hit.title)).toEqual([
        'Payments 2025 Q4',
        'Payments 2026 Q2',
        'Payments 2026 Q4',
      ]);
      expect((await (await search('')).json()).errors[0].code).toBe('REQUIRED');
      expect((await (await search('?q=a')).json()).errors[0].code).toBe('MIN_LENGTH');
      expect((await (await search(`?q=${'x'.repeat(201)}`)).json()).errors[0].code).toBe(
        'MAX_LENGTH',
      );
      expect((await (await search('?q=ZZZZ')).json()).results).toEqual([]);
    });

    it('follows a link of the flow and moves on, and answers the state of the flow', async () => {
      const scenario = scenarioFetch('workshop');
      const submit = await scenario.fetch(
        '/api/v1/documents/test-notes/01JZ8Z0H2K4N6Q8S0V2X4A6C8E/transitions/test-note.submit',
        { method: 'POST' },
      );
      expect(await submit.json()).toMatchObject({ outcome: 'TRANSITIONED' });
      expect(scenario.state()).toBe('note-submitted');
      const read = await scenario.fetch('/api/v1/documents/test-notes/01JZ8Z0H2K4N6Q8S0V2X4A6C8E');
      expect((await read.json()).state).toBe('in-review');
    });
  });

  describe('the preview handler of the mock (render-asciidoc)', () => {
    const render = async (scenario: ReturnType<typeof scenarioFetch>, body: unknown) => {
      const answer = await scenario.fetch('/api/v1/render/asciidoc', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      return { status: answer.status, body: await answer.json() };
    };

    it('renders the example of the register', async () => {
      expect(
        await render(scenarioFetch('workshop'), {
          source: '== Decision\n\nWe *agree* to rotate the keys, see `ops/keys`.',
        }),
      ).toEqual({
        status: 200,
        body: {
          html: '<h2>Decision</h2><div><p>We <strong>agree</strong> to rotate the keys, see <code>ops/keys</code>.</p></div>',
        },
      });
    });

    it('answers an empty source with no html, and escapes what is no markup of the source', async () => {
      expect((await render(scenarioFetch('read-only'), { source: '' })).body).toEqual({ html: '' });
      expect(renderAsciiDocLikeTheMock('<script>alert("x")</script> & \'y\'')).toBe(
        '<div><p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;</p></div>',
      );
    });

    it('renders lists, headings of every level, emphasis and lines of a paragraph', () => {
      expect(renderAsciiDocLikeTheMock('* one\n* _two_')).toBe(
        '<ul><li>one</li><li><em>two</em></li></ul>',
      );
      expect(renderAsciiDocLikeTheMock('====== six\n\nline 1\r\nline 2\n\n\n* not\nlist')).toBe(
        '<h6>six</h6><div><p>line 1<br>line 2</p></div><div><p>* not<br>list</p></div>',
      );
    });

    it('refuses a body without source, a source that is no string, and one over 65,536 bytes', async () => {
      const scenario = scenarioFetch('workshop');
      const required = {
        status: 422,
        body: { outcome: 'VALIDATION', errors: [{ pointer: '/source', code: 'REQUIRED' }] },
      };
      expect(await render(scenario, {})).toEqual(required);
      expect(await render(scenario, 'not json')).toEqual(required);
      expect(await render(scenario, [1])).toEqual(required);
      expect(await render(scenario, { source: 5 })).toEqual({
        status: 422,
        body: { outcome: 'VALIDATION', errors: [{ pointer: '/source', code: 'TYPE' }] },
      });
      expect((await render(scenario, { source: 'a'.repeat(65_536) })).status).toBe(200);
      expect(await render(scenario, { source: 'a'.repeat(65_537) })).toEqual({
        status: 413,
        body: { outcome: 'TOO_LARGE', limit: 65_536 },
      });
    });

    it('reads the body of a Request, and answers by the state: hostile, or unavailable', async () => {
      const scenario = scenarioFetch('workshop');
      const answer = await scenario.fetch(
        new Request('http://localhost/api/v1/render/asciidoc', {
          method: 'POST',
          body: JSON.stringify({ source: 'x' }),
        }),
      );
      expect(await answer.json()).toEqual({ html: '<div><p>x</p></div>' });
      scenario.goto('preview-hostile');
      expect(
        (
          (await (await scenario.fetch('/api/v1/render/asciidoc', { method: 'POST' })).json()) as {
            html: string;
          }
        ).html,
      ).toContain('<script>');
      scenario.goto('preview-unavailable');
      const down = await scenario.fetch('/api/v1/render/asciidoc', { method: 'POST' });
      expect(down.status).toBe(503);
      expect(await down.json()).toEqual({ outcome: 'RENDER_UNAVAILABLE' });
    });
  });

  describe('the catalogue the mock serves', () => {
    it('merges the labels of the fixture categories into the catalogue, in both languages', async () => {
      const scenario = scenarioFetch('workshop');
      const english = (await (await scenario.fetch('/api/v1/messages?lang=en')).json()) as Record<
        string,
        string
      >;
      const german = (await (await scenario.fetch('/api/v1/messages?lang=de')).json()) as Record<
        string,
        string
      >;
      expect(english['category.test-note.note.field.title']).toBe('Title');
      expect(german['category.test-note.note.field.title']).toBe('Titel');
      expect(english['form.hint.no-personal-notes']).toBeTruthy();
      expect(Object.keys(german).sort()).toEqual(Object.keys(english).sort());
      expect(
        Object.keys(mockMessages('en')).filter((key) => key.startsWith('category.')).length,
      ).toBeGreaterThan(50);
    });
  });
});
