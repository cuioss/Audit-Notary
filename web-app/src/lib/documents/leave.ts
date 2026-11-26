/**
 * The question before a page with typed content is left (rest-api.adoc, Decided Provisionally, point 11): a new document
 * holds its value in the page until the first save, so leaving would lose it.
 */
import { afterNavigate, beforeNavigate, goto } from '$app/navigation';

/**
 * Asks before the page is left while it holds content that is stored nowhere. Call it while a component is initialised.
 *
 * - A move inside the app is cancelled and `ask` is told to ask; `proceed` makes the move after all (a step back or
 *   forward in the history is taken as a step, so the history keeps no entry of the cancelled move).
 * - A reload, a close of the tab or a link out of the app is cancelled too, which makes the browser ask in its own words.
 *
 * @param dirty whether the page holds content that would be lost
 * @param ask shows the question; calls `proceed` when the person leaves anyway
 */
export function guardLeaving(dirty: () => boolean, ask: (proceed: () => void) => void): void {
  let leaving = false;
  beforeNavigate((navigation) => {
    if (leaving || !dirty()) return;
    navigation.cancel();
    const target = navigation.to?.url;
    if (navigation.willUnload || !target) return;
    ask(() => {
      leaving = true;
      if (navigation.type === 'popstate' && navigation.delta) {
        history.go(navigation.delta);
      } else {
        void goto(`${target.pathname}${target.search}${target.hash}`);
      }
    });
  });
  // A page that stays mounted for the next address (the same route) is guarded again.
  afterNavigate(() => {
    leaving = false;
  });
}
