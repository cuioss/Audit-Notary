/**
 * The present, as the views compare deadlines with it: a store that ticks every minute, so "due today" turns into
 * "overdue" without a reload (the Due lens recomputes its reminders every minute, UC-DOC-9).
 */
import { readable } from 'svelte/store';

/** The tick of the clock. */
export const CLOCK_TICK_MS = 60_000;

/** The present, renewed every minute; every first subscriber starts from the present, not from the last tick. */
export const now = readable(new Date(), (set) => {
  set(new Date());
  const timer = setInterval(() => set(new Date()), CLOCK_TICK_MS);
  return () => clearInterval(timer);
});
