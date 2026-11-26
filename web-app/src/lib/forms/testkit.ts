/**
 * The setup of the form kit's tests: the schemas, the people, the catalogs and the references come from the mock's
 * `workshop` profile through `scenarioFetch` and the real client, so the unit tests and the end-to-end suite read the
 * same data (AUN-TEST-1).
 */
import { vi } from 'vitest';
import { ApiClient } from '../api/client';
import type { CategorySchema, JsonSchema } from '../api/types';
import { messagesStore } from '../i18n';
import { mockMessages, scenarioFetch, type ScenarioFetch } from '../test/scenarioFetch';
import type { JsonObject } from './schema';
import { createFormServices, type FormServices } from './services';

/** What a test of the form kit works with. */
export interface Kit {
  /** The scenario the requests go to. */
  scenario: ScenarioFetch;
  /** The client over it. */
  client: ApiClient;
  /** The services over the client. */
  services: FormServices;
  /** The requests made, as `METHOD path`. */
  requests: string[];
}

/**
 * Stubs `fetch` with a profile and returns the client and the services over it.
 *
 * @param profile the profile, `workshop` or `read-only`, with an optional state: `workshop#preview-hostile`
 * @returns the kit
 */
export function useProfile(profile = 'workshop'): Kit {
  const scenario = scenarioFetch(profile);
  const requests: string[] = [];
  const recording = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    requests.push(`${(init?.method ?? 'GET').toUpperCase()} ${url.pathname}${url.search}`);
    return scenario.fetch(input, init);
  }) as typeof fetch;
  vi.stubGlobal('fetch', recording);
  const client = new ApiClient(() => {});
  return { scenario, client, services: createFormServices(client), requests };
}

/**
 * Sets the catalogue of the language: the web app's texts and the labels of the mock's fixture categories.
 *
 * @param lang the language
 */
export function useMessages(lang: 'en' | 'de' = 'en'): void {
  messagesStore.set(mockMessages(lang));
}

/**
 * @param kit the kit
 * @param category the category id of the mock
 * @returns the schema of its first kind
 */
export async function schemaOf(kit: Kit, category: string): Promise<JsonSchema> {
  const answer: CategorySchema = await kit.client.getCategorySchema(category);
  return answer.kinds[0].schema;
}

/** The complete, clean `test-note` of the brief (section 5). */
export const CLEAN_NOTE: JsonObject = {
  title: 'Key rotation, decision of 24 November',
  noted: '2026-11-24T09:30:00Z',
  status: 'agreed',
  pinned: true,
  service: 'service:payment-api',
  owner: 'p-4c1a9e',
  related: 'samm-assessments:assessment/payments-2026-q4',
  summary:
    'Rotate the signing keys every 90 days; the first rotation is due before the next release.',
  body: '== Decision\n\nWe *agree* to rotate the keys, see `ops/keys`.\n\n* quarterly\n* before every release',
  actions: [
    { what: 'Write the rotation runbook', who: 'p-2b7f10', due: '2026-12-15', done: false },
    { what: 'Rotate the staging keys', who: 'p-9e33a1', due: '2026-12-01', done: true },
  ],
};

/** The `test-note` with every mark: a retired entry, an unbound, a former and an unknown person, a lost reference. */
export const MARKED_NOTE: JsonObject = {
  title: 'Old decision',
  noted: '2025-03-02T14:00:00+01:00',
  status: 'dropped',
  service: 'service:ledger',
  owner: 'p-7d52e8',
  related: 'isms-register:risk/R-999',
  actions: [
    { what: 'Hand over the ledger', who: 'p-0f8a42' },
    { what: 'Ask the former owner', who: 'p-3b9d00' },
    { what: 'Check the unknown catalog entry' },
  ],
};

/** The `form-validation` value that breaks every constraint once. */
export const BROKEN_VALIDATION: JsonObject = {
  code: 'ab-12',
  title: 'No',
  severity: 'urgent',
  score: 11,
  weight: 1,
  opened: 'yesterday',
  closed: '2026-13-40',
  acknowledged: false,
  link: 'not a link',
  references: ['a:b/c', 'a:b/c', 'x:y/z', 'p:q/r'],
  checks: [],
};
