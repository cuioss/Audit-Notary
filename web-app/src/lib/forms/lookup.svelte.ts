/**
 * A reactive reading of what a component asks the server for (a catalog, a person, a reference): `idle` while there is
 * nothing to ask, `loading` while the answer is on its way, then the answer. An answer that a later question has
 * overtaken is dropped.
 */
import type { Lookup } from './services';

/** The state of a reading. */
export type LookupState<T> = Lookup<T> | { state: 'loading' } | { state: 'idle' };

/**
 * @param load starts the reading; read reactive values inside it, and return `null` when there is nothing to ask
 * @returns the state, which follows the reactive values `load` reads
 */
export function useLookup<T>(load: () => Promise<Lookup<T>> | null): {
  readonly current: LookupState<T>;
} {
  let current = $state<LookupState<T>>({ state: 'idle' });
  $effect(() => {
    const pending = load();
    if (pending === null) {
      current = { state: 'idle' };
      return;
    }
    let live = true;
    current = { state: 'loading' };
    void pending.then((answer) => {
      if (live) current = answer;
    });
    return () => {
      live = false;
    };
  });
  return {
    get current() {
      return current;
    },
  };
}

/**
 * @param reference a catalog reference `<catalog>:<id>`
 * @returns its parts, or `null` when it has the form of no catalog reference
 */
export function parseCatalogRef(reference: string): { catalog: string; id: string } | null {
  const split = reference.indexOf(':');
  if (split <= 0 || split === reference.length - 1) return null;
  return { catalog: reference.slice(0, split), id: reference.slice(split + 1) };
}
