/**
 * What the tests of the documents lens share: a profile of the scenario mock behind `fetch` (AUN-TEST-1), the session of
 * its user, the catalogue with the category's own texts, and the event stream as a function the test calls.
 */
import { vi } from 'vitest';
import { apiClient, type EventListener } from '../../api/client';
import { currentLocale, messagesStore } from '../../i18n';
import { session, status } from '../../stores/app';
import { mockMessages, scenarioFetch, type ScenarioFetch } from '../../test/scenarioFetch';

export const REPOSITORY = 'test-notes';
export const N1 = '01JZ8Q4Y5N6V7X8B9C0D1E2F3G';
export const N2 = '01JZ8R7A9C1E3G5J7M9P1S3V5X';
export const N3 = '01JZ8S2B4D6F8H0K2N4Q6T8W0Y';
export const N4 = '01JZ8T5C7E9G1J3M5P7R9V1X3Z';
export const N5 = '01JZ8V8D0F2H4K6N8Q0S2W4Y6A';
export const N6 = '01JZ8W1E3G5J7M9P1R3T5X7Z9B';
export const N7 = '01JZ8X4F6H8K0N2Q4S6V8Y0A2C';
export const N9 = '01JZ8Z0H2K4N6Q8S0V2X4A6C8E';

/** What a test works with. */
export interface Kit {
  /** The scenario the requests go to. */
  scenario: ScenarioFetch;
  /** The requests made, as `METHOD path?query`. */
  requests: string[];
  /** The bodies of the requests that carry one, in order, as `METHOD path`. */
  bodies: { request: string; body: unknown }[];
  /** Tells the open page that the event stream named something. */
  emit: (event: string, data: unknown) => void;
}

/**
 * Stubs `fetch` with a profile, signs its user in and takes over the event stream.
 *
 * @param profile `name` or `name#state`
 * @param lang the language of the catalogue
 * @param answers answers that replace the profile's own, by `METHOD /path`: a `Response`, or a body answered with `200`
 * @returns the kit
 */
export async function useProfile(
  profile = 'workshop',
  lang: 'en' | 'de' = 'en',
  answers: Record<string, unknown> = {},
): Promise<Kit> {
  const scenario = scenarioFetch(profile);
  const requests: string[] = [];
  const bodies: Kit['bodies'] = [];
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    requests.push(`${method} ${url.pathname}${url.search}`);
    if (typeof init?.body === 'string') {
      bodies.push({ request: `${method} ${url.pathname}`, body: JSON.parse(init.body) });
    }
    const own = answers[`${method} ${url.pathname}`];
    if (own instanceof Response) return own.clone();
    if (own !== undefined) return Response.json(own);
    return scenario.fetch(input, init);
  }) as typeof fetch);
  currentLocale.set(lang);
  messagesStore.set(mockMessages(lang));
  session.set(await apiClient.getSession());
  const listeners: EventListener[] = [];
  vi.spyOn(apiClient, 'subscribeEvents').mockImplementation((listener) => {
    listeners.push(listener);
    return () => {};
  });
  return {
    scenario,
    requests,
    bodies,
    emit: (event, data) => listeners.forEach((listener) => listener(event, data)),
  };
}

/** Clears what a test set. */
export function resetKit(): void {
  session.set(null);
  status.set(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
}
