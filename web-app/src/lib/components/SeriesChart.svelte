<script lang="ts" module>
  /** One point of a series: where it stands on the horizontal axis, its value and the value as text. */
  export interface SeriesPoint {
    x: number;
    value: number;
    /** The value, formatted. */
    text: string;
  }

  /** One line of the chart. */
  export interface Series {
    id: string;
    /** The name in the legend. */
    label: string;
    /** The colour slot, 1 to 5 (`--color-series-1` … `-5`); the slot also decides the shape of the marker. */
    slot: number;
    /** The points, in axis order. */
    points: SeriesPoint[];
  }
</script>

<script lang="ts">
  import { placeLabels, thinTicks, type AxisTick } from '../reports/chart';

  /**
   * Several measures over time or over assessments as lines on one fixed scale: the scopes of the trend report, the five
   * business functions of one scope. A series is a slot of the validated series colours and, beside the colour, a shape
   * of its own, so that no line depends on a colour alone. The end of every line carries its value as a direct label, the
   * legend names every series, and the page states every figure again as a table (dataviz method: thin lines, markers of
   * at least 8 px, recessive grid, at most five series). The chart is drawn at the width it has, so its text keeps its
   * size on a phone.
   */
  interface Props {
    /** The series, one to five. */
    series: Series[];
    /** The labels of the horizontal axis; the chart keeps the ones that fit. */
    ticks: AxisTick[];
    /** The first and the last position of the horizontal axis. */
    domain: [number, number];
    /** The top of the vertical scale. */
    max: number;
    /** The accessible name of the chart. */
    label: string;
    /** The accessible name of the legend. */
    legendLabel: string;
    /** A test id. */
    testId?: string;
  }

  let { series, ticks, domain, max, label, legendLabel, testId }: Props = $props();

  const H = 220;
  const PAD = { top: 16, right: 44, bottom: 34, left: 28 };
  /** The width the figure has on the page. */
  let measured = $state(0);
  let W = $derived(measured >= 240 ? Math.min(measured, 760) : 560);
  let top = $derived(max > 0 ? max : 1);

  let x = $derived((value: number) => {
    const span = domain[1] - domain[0];
    const room = W - PAD.left - PAD.right;
    return PAD.left + (span === 0 ? room / 2 : ((value - domain[0]) / span) * room);
  });
  const y = (value: number) => PAD.top + (1 - value / top) * (H - PAD.top - PAD.bottom);

  let yTicks = $derived(Array.from({ length: Math.floor(top) + 1 }, (_, index) => index));
  let shown = $derived(thinTicks(ticks, x));

  const anchorOf = (position: number, text: string) => {
    const half = (text.length * 6.2) / 2;
    return position - half < 0 ? 'start' : position + half > W ? 'end' : 'middle';
  };
  /** The label of an end stands at the edge of the figure, so it never leaves it. */
  const axisX = (position: number, text: string) => {
    const anchor = anchorOf(position, text);
    return anchor === 'start' ? 0 : anchor === 'end' ? W : position;
  };

  /** The end of every line, where its value is written; the labels keep clear of each other. */
  let ends = $derived.by(() => {
    const last = series.map((line) => line.points.at(-1) ?? null);
    const wanted = last.flatMap((point) => (point ? [{ x: x(point.x), y: y(point.value) }] : []));
    const placed = placeLabels(wanted, 13, 44);
    let next = 0;
    return last.map((point) => {
      if (!point) return null;
      const at = placed[next++];
      return { x: x(point.x), y: at, text: point.text };
    });
  });

  const path = (line: Series) =>
    line.points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.x)} ${y(point.value)}`)
      .join(' ');
</script>

{#snippet mark(slot: number, cx: number, cy: number)}
  {#if slot === 1}
    <circle {cx} {cy} r="5" />
  {:else if slot === 2}
    <rect x={cx - 4.5} y={cy - 4.5} width="9" height="9" />
  {:else if slot === 3}
    <path d="M{cx} {cy - 6} L{cx + 6} {cy} L{cx} {cy + 6} L{cx - 6} {cy} Z" />
  {:else if slot === 4}
    <path d="M{cx} {cy - 6} L{cx + 6} {cy + 5} L{cx - 6} {cy + 5} Z" />
  {:else}
    <path class="mark-cross" d="M{cx - 5} {cy} L{cx + 5} {cy} M{cx} {cy - 5} L{cx} {cy + 5}" />
  {/if}
{/snippet}

<figure class="chart" bind:clientWidth={measured} data-testid={testId}>
  <ul class="chart__legend" aria-label={legendLabel}>
    {#each series as line (line.id)}
      <li class="chart__key series--{line.slot}">
        <svg class="chart__swatch" viewBox="0 0 16 16" aria-hidden="true">
          <g class="chart__mark">{@render mark(line.slot, 8, 8)}</g>
        </svg>
        <span>{line.label}</span>
      </li>
    {/each}
  </ul>
  <svg class="chart__figure" viewBox="0 0 {W} {H}" role="img" aria-label={label}>
    {#each yTicks as tick (tick)}
      <line class="chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
      <text
        class="chart__tick"
        x={PAD.left - 10}
        y={y(tick)}
        text-anchor="end"
        dominant-baseline="central">{tick}</text
      >
    {/each}
    {#each shown as tick (tick.x)}
      <text
        class="chart__tick"
        x={axisX(x(tick.x), tick.label)}
        y={H - 10}
        text-anchor={anchorOf(x(tick.x), tick.label)}>{tick.label}</text
      >
    {/each}
    {#each series as line, index (line.id)}
      <g class="series--{line.slot}" data-series={line.id}>
        {#if line.points.length > 1}
          <path class="chart__line" d={path(line)} />
        {/if}
        <g class="chart__mark">
          {#each line.points as point, at (at)}
            {@render mark(line.slot, x(point.x), y(point.value))}
          {/each}
        </g>
        {#if ends[index]}
          <text
            class="chart__value"
            x={(ends[index]?.x ?? 0) + 12}
            y={ends[index]?.y}
            dominant-baseline="central">{ends[index]?.text}</text
          >
        {/if}
      </g>
    {/each}
  </svg>
</figure>

<style>
  .chart {
    margin: 0;
  }

  .series--1 {
    --series: var(--color-series-1);
  }

  .series--2 {
    --series: var(--color-series-2);
  }

  .series--3 {
    --series: var(--color-series-3);
  }

  .series--4 {
    --series: var(--color-series-4);
  }

  .series--5 {
    --series: var(--color-series-5);
  }

  .chart__legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
    margin-block-end: var(--space-3);
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .chart__key {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .chart__swatch {
    inline-size: 1rem;
    block-size: 1rem;
    flex: none;
  }

  .chart__figure {
    inline-size: 100%;
    max-inline-size: 48rem;
    block-size: auto;
    overflow: visible;
  }

  .chart__grid {
    stroke: var(--color-chart-grid);
    stroke-width: 1;
  }

  .chart__tick {
    fill: var(--color-text-muted);
    font-size: 11px;
    font-feature-settings: 'tnum' 1;
  }

  .chart__line {
    fill: none;
    stroke: var(--series);
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .chart__mark {
    fill: var(--series);
    stroke: var(--color-bg-surface);
    stroke-width: 1.5;
  }

  .chart__mark :global(.mark-cross) {
    fill: none;
    stroke: var(--series);
    stroke-width: 3;
  }

  .chart__value {
    fill: var(--color-text-primary);
    font-family: var(--font-serif);
    font-size: 14px;
    font-weight: var(--weight-semibold);
    paint-order: stroke;
    stroke: var(--color-bg-surface);
    stroke-width: 3px;
    stroke-linejoin: round;
  }

  @media (forced-colors: active) {
    .chart__line {
      stroke: CanvasText;
    }

    .chart__mark {
      fill: CanvasText;
      stroke: Canvas;
    }

    .chart__mark :global(.mark-cross) {
      stroke: CanvasText;
    }
  }
</style>
