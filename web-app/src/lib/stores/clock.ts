/**
 * The present, as the views compare deadlines with it: a store that ticks every minute, so "due today" turns into
 * "overdue" without a reload (the Due lens recomputes its reminders every minute, UC-DOC-9).
 */
import { readable } from 'svelte/store';

/** The tick of the clock. */
export const CLOCK_TICK_MS = 60_000;

/** The present, renewed every minute. */
export const now = readable(new Date(), (set) => {
  const timer = setInterval(() => set(new Date()), CLOCK_TICK_MS);
  return () => clearInterval(timer);
});
