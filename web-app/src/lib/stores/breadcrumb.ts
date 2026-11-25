/**
 * The path of the current view below its lens, which the top bar shows as the one breadcrumb of the page
 * (pm-web-app navigation.adoc: no view draws a second path). A view sets it and clears it when it goes.
 */
import { writable } from 'svelte/store';

/** One step of the path. */
export interface Crumb {
  /** The text, already from the catalogue or the document. */
  label: string;
  /** The address of the step. */
  href: string;
}

/** The path below the lens, outermost first. */
export const breadcrumb = writable<Crumb[]>([]);
