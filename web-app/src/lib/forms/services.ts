/**
 * What the components of the form kit ask the server for (AUN-WEB-4, The Pickers; rest-api.adoc, Form Kit Requests):
 * the entries of a catalog, the persons, one person, the resolution of references, and the preview of AsciiDoc. One
 * instance serves one form; it remembers what it has read, so a table of fifty rows asks for each catalog once and
 * resolves its references in few requests.
 */
import { getContext, setContext } from 'svelte';
import { ApiClient, apiClient, MAX_REFERENCES_PER_REQUEST } from '../api/client';
import { isApiError } from '../api/errors';
import type {
  CatalogEntry,
  PersonDetail,
  PersonList,
  PersonSummary,
  ReferenceAnswer,
} from '../api/types';

/** The most bytes of AsciiDoc source the server renders (`rest-api.adoc`, Form Kit Requests). */
export const RENDER_LIMIT_BYTES = 65_536;

/** What a lookup found. */
export type Lookup<T> = { state: 'found'; value: T } | { state: 'missing' } | { state: 'failed' };

/** What a preview request came to. */
export type Rendered =
  { state: 'html'; html: string } | { state: 'too-large' } | { state: 'unavailable' };

/** The reading services of a form. */
export interface FormServices {
  /** @returns the entries of a catalog, retired ones included */
  catalog(catalog: string): Promise<Lookup<CatalogEntry[]>>;
  /** @returns the persons a document may reference, filtered by the server with `query` */
  persons(query?: string): Promise<Lookup<PersonList>>;
  /** @returns one person; `missing` for a pseudonym that resolves to nobody */
  person(pseudonym: string): Promise<Lookup<PersonDetail>>;
  /** @returns what a reference resolves to; `missing` for a reference the server did not answer */
  reference(ref: string): Promise<Lookup<ReferenceAnswer>>;
  /** @returns the preview of a source */
  render(source: string): Promise<Rendered>;
}

/**
 * @param source an AsciiDoc source
 * @returns whether it is longer than the server renders
 */
export function exceedsRenderLimit(source: string): boolean {
  return new TextEncoder().encode(source).length > RENDER_LIMIT_BYTES;
}

/**
 * @param client the client the requests go through
 * @returns the services of one form
 */
export function createFormServices(client: ApiClient = apiClient): FormServices {
  const catalogs = new Map<string, Promise<Lookup<CatalogEntry[]>>>();
  const people = new Map<string, Promise<Lookup<PersonDetail>>>();
  const references = new Map<string, Promise<Lookup<ReferenceAnswer>>>();
  let list: Promise<Lookup<PersonList>> | null = null;
  let queue: { ref: string; settle: (answer: Lookup<ReferenceAnswer>) => void }[] = [];

  /** Remembers a lookup that was answered; a failure is asked again next time. */
  function remember<T>(
    cache: Map<string, Promise<Lookup<T>>>,
    key: string,
    load: () => Promise<Lookup<T>>,
  ): Promise<Lookup<T>> {
    const known = cache.get(key);
    if (known) return known;
    const pending = load().then((result) => {
      if (result.state === 'failed') cache.delete(key);
      return result;
    });
    cache.set(key, pending);
    return pending;
  }

  function flushReferences(): void {
    const batch = queue;
    queue = [];
    for (let from = 0; from < batch.length; from += MAX_REFERENCES_PER_REQUEST) {
      const part = batch.slice(from, from + MAX_REFERENCES_PER_REQUEST);
      client.resolveReferences(part.map((entry) => entry.ref)).then(
        (answers) => {
          for (const entry of part) {
            const answer = answers.find((candidate) => candidate.ref === entry.ref);
            entry.settle(answer ? { state: 'found', value: answer } : { state: 'missing' });
          }
        },
        () => part.forEach((entry) => entry.settle({ state: 'failed' })),
      );
    }
  }

  return {
    catalog: (catalog) =>
      remember(catalogs, catalog, () =>
        client.getCatalog(catalog).then(
          (answer): Lookup<CatalogEntry[]> => ({ state: 'found', value: answer.entries }),
          (): Lookup<CatalogEntry[]> => ({ state: 'failed' }),
        ),
      ),

    persons: (query) => {
      if (query !== undefined && query !== '') {
        return client.listPersons(query).then(
          (answer): Lookup<PersonList> => ({ state: 'found', value: answer }),
          (): Lookup<PersonList> => ({ state: 'failed' }),
        );
      }
      list ??= client.listPersons().then(
        (answer): Lookup<PersonList> => ({ state: 'found', value: answer }),
        (): Lookup<PersonList> => ({ state: 'failed' }),
      );
      const current = list;
      void current.then((result) => {
        if (result.state === 'failed' && list === current) list = null;
      });
      return current;
    },

    person: (pseudonym) =>
      remember(people, pseudonym, () =>
        client.getPerson(pseudonym).then(
          (answer): Lookup<PersonDetail> => ({ state: 'found', value: answer }),
          (error: unknown): Lookup<PersonDetail> =>
            isApiError(error) && error.outcome === 'NOT_FOUND'
              ? { state: 'missing' }
              : { state: 'failed' },
        ),
      ),

    reference: (ref) =>
      remember(
        references,
        ref,
        () =>
          new Promise<Lookup<ReferenceAnswer>>((settle) => {
            queue.push({ ref, settle });
            if (queue.length === 1) setTimeout(flushReferences, 0);
          }),
      ),

    render: async (source) => {
      if (exceedsRenderLimit(source)) return { state: 'too-large' };
      try {
        const answer = await client.renderAsciiDoc(source);
        return { state: 'html', html: answer.html };
      } catch (error) {
        return isApiError(error) && error.outcome === 'TOO_LARGE'
          ? { state: 'too-large' }
          : { state: 'unavailable' };
      }
    },
  };
}

const SERVICES = Symbol('form-services');

/**
 * @param services the services the components below ask
 */
export function provideFormServices(services: FormServices): void {
  setContext(SERVICES, services);
}

/**
 * @returns the services of the form this component stands in; without a form, services over the app's client
 */
export function useFormServices(): FormServices {
  return getContext<FormServices | undefined>(SERVICES) ?? createFormServices();
}

/**
 * @param person a person
 * @returns the name a picker shows
 */
export function personName(person: PersonSummary): string {
  return person.name ?? person.pseudonym;
}
