/**
 * The arithmetic of the charts of the lens Reports: where a value stands on its axis, which axis labels fit, and how
 * the direct labels of several lines keep clear of each other. Pure functions, so the charts only draw.
 */

/** The number of series slots (`--color-series-1` … `-5`): a sixth series is a table row and no line. */
export const SERIES_SLOTS = 5;

/**
 * @param index the position of a series in its list, from 0
 * @returns the slot (1 to 5) the series is drawn in, or `null` for a sixth and later series, which the chart leaves to
 * its table
 */
export function slotOf(index: number): number | null {
  return index >= 0 && index < SERIES_SLOTS ? index + 1 : null;
}

/**
 * @param day a calendar day, `YYYY-MM-DD`
 * @returns the day as a number of days since 1970-01-01, independent of the time zone of the reader
 */
export function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

/**
 * The days between two calendar days.
 *
 * @param from the earlier day
 * @param to the later day
 * @returns `to` minus `from` in days; negative when `to` is earlier
 */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** One label of an axis. */
export interface AxisTick {
  /** The position on the axis, in the unit of the data. */
  x: number;
  label: string;
}

/** The estimated width of a character of an axis label, in pixels. */
const CHAR_WIDTH = 6.2;

/** The room between two axis labels, in pixels. */
const LABEL_GAP = 12;

/**
 * Keeps the axis labels that fit side by side: the first and the last first, then the others from the left, each only
 * when it does not touch a label that stays. A label that would leave the figure is moved in by the drawing, not here.
 *
 * @param ticks the labels, in axis order
 * @param position the pixel position of a label's centre
 * @param width the width of the figure; a label that would leave it is measured where the drawing puts it, at the edge
 * @returns the labels that stay, in axis order
 */
export function thinTicks(
  ticks: AxisTick[],
  position: (x: number) => number,
  width = Number.POSITIVE_INFINITY,
): AxisTick[] {
  if (ticks.length <= 2) return ticks;
  const half = (tick: AxisTick) => (tick.label.length * CHAR_WIDTH) / 2;
  /** The centre of a label as drawn: a label that would leave the figure stands at the edge instead. */
  const centre = (tick: AxisTick) => {
    const at = position(tick.x);
    const reach = half(tick);
    return at - reach < 0 ? reach : at + reach > width ? width - reach : at;
  };
  const clash = (a: AxisTick, b: AxisTick) =>
    Math.abs(centre(a) - centre(b)) < half(a) + half(b) + LABEL_GAP;
  const kept = new Set<number>([0, ticks.length - 1]);
  // The ends clash with each other on a figure too narrow for both: the last one gives way.
  if (clash(ticks[0], ticks[ticks.length - 1])) kept.delete(ticks.length - 1);
  for (let index = 1; index < ticks.length - 1; index += 1) {
    if (![...kept].some((other) => clash(ticks[index], ticks[other]))) kept.add(index);
  }
  return ticks.filter((_, index) => kept.has(index));
}

/**
 * Moves direct labels down until no two that stand close together overlap, then back up where the last of them would
 * leave the room it has.
 *
 * @param labels the wanted pixel positions
 * @param gap the least vertical distance of two labels, in pixels
 * @param reach the horizontal distance within which two labels can overlap
 * @param lowest the lowest pixel `y` a label may stand at; labels pushed past it are moved up instead
 * @returns the pixel `y` of each label, in the order given
 */
export function placeLabels(
  labels: { x: number; y: number }[],
  gap = 13,
  reach = 40,
  lowest = Number.POSITIVE_INFINITY,
): number[] {
  const order = labels.map((_, index) => index).sort((a, b) => labels[a].y - labels[b].y);
  const placed = new Map<number, number>();
  for (const index of order) {
    let y = labels[index].y;
    for (const other of order) {
      const at = placed.get(other);
      if (at === undefined) continue;
      if (Math.abs(labels[other].x - labels[index].x) < reach && y - at < gap) y = at + gap;
    }
    placed.set(index, y);
  }
  if (lowest !== Number.POSITIVE_INFINITY) {
    const settled = new Map<number, number>();
    for (const index of [...order].reverse()) {
      let y = Math.min(placed.get(index) as number, lowest);
      for (const [other, at] of settled) {
        if (Math.abs(labels[other].x - labels[index].x) < reach && at - y < gap) y = at - gap;
      }
      settled.set(index, y);
    }
    return labels.map((_, index) => settled.get(index) as number);
  }
  return labels.map((_, index) => placed.get(index) as number);
}
