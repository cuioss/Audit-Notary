<script lang="ts" module>
  /** One point of the trend. */
  export interface TrendPoint {
    /** The label of the point on the axis: an assessment's title. */
    label: string;
    value: number;
    /** The value, formatted. */
    text: string;
  }
</script>

<script lang="ts">
  /**
   * One measure over time as a line on a fixed scale: the overall score of a scope's released assessments. One series,
   * so no legend; a trend has few points, so every point carries its value as a direct label — nothing depends on the
   * pointer — and a visually hidden table states them for assistive technology (dataviz method: thin line, markers of
   * at least 8 px, recessive grid). The pointer only marks a point. Points are keyed by position: two assessments may
   * carry the same title.
   */
  interface Props {
    /** The points, oldest first. */
    points: TrendPoint[];
    /** The top of the scale. */
    max: number;
    /** The accessible name of the chart and its table. */
    label: string;
  }

  let { points, max, label }: Props = $props();

  const H = 180;
  /** The width the figure has on the page: the chart is drawn at that width, so its text keeps its size on a phone. */
  let measured = $state(0);
  let W = $derived(measured >= 240 ? Math.min(measured, 640) : 560);
  const PAD = { top: 16, right: 56, bottom: 34, left: 28 };
  let active: number | null = $state(null);

  const x = (index: number, count: number) =>
    PAD.left + (count <= 1 ? 0 : (index * (W - PAD.left - PAD.right)) / (count - 1));
  /** The axis label of the first point starts at the edge and the last one ends at it, so neither leaves the figure. */
  const anchorOf = (index: number, count: number) =>
    count > 1 && index === 0 ? 'start' : count > 1 && index === count - 1 ? 'end' : 'middle';
  const labelX = (index: number, count: number) =>
    count > 1 && index === 0 ? 0 : count > 1 && index === count - 1 ? W : x(index, count);
  // A non-positive max uses a 0–1 scale instead of dividing by zero.
  let top = $derived(max > 0 ? max : 1);
  const y = (value: number) => PAD.top + (1 - value / top) * (H - PAD.top - PAD.bottom);

  let path = $derived(
    points
      .map(
        (point, index) => `${index === 0 ? 'M' : 'L'}${x(index, points.length)} ${y(point.value)}`,
      )
      .join(' '),
  );
  let ticks = $derived(Array.from({ length: Math.floor(top) + 1 }, (_, index) => index));
</script>

<figure class="trend" bind:clientWidth={measured}>
  <svg class="trend__chart" viewBox="0 0 {W} {H}" role="img" aria-label={label}>
    {#each ticks as tick (tick)}
      <line class="trend__grid" x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
      <text
        class="trend__tick"
        x={PAD.left - 10}
        y={y(tick)}
        text-anchor="end"
        dominant-baseline="central">{tick}</text
      >
    {/each}
    <path class="trend__line" d={path} />
    {#each points as point, index (index)}
      <g
        class="trend__point"
        class:trend__point--active={active === index}
        role="presentation"
        onmouseenter={() => (active = index)}
        onmouseleave={() => (active = null)}
      >
        <circle class="trend__hit" cx={x(index, points.length)} cy={y(point.value)} r="16" />
        <circle class="trend__marker" cx={x(index, points.length)} cy={y(point.value)} r="5" />
        <text
          class="trend__axis"
          x={labelX(index, points.length)}
          y={H - 10}
          text-anchor={anchorOf(index, points.length)}>{point.label}</text
        >
        <text
          class="trend__value"
          class:trend__value--active={active === index}
          x={x(index, points.length)}
          y={y(point.value) - 12}
          text-anchor="middle">{point.text}</text
        >
      </g>
    {/each}
  </svg>
  <!-- The wrapper clips the table: a table that is itself positioned ignores `width: 1px` and widens the page. -->
  <div class="sr-only">
    <table>
      <caption>{label}</caption>
      <tbody>
        {#each points as point, index (index)}
          <tr><th scope="row">{point.label}</th><td>{point.text}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</figure>

<style>
  .trend__chart {
    inline-size: 100%;
    max-inline-size: 40rem;
    block-size: auto;
    overflow: visible;
  }

  .trend__grid {
    stroke: var(--color-chart-grid);
    stroke-width: 1;
  }

  .trend__tick,
  .trend__axis {
    fill: var(--color-text-muted);
    font-size: 11px;
    font-feature-settings: 'tnum' 1;
  }

  .trend__line {
    fill: none;
    stroke: var(--color-brand);
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .trend__hit {
    fill: transparent;
  }

  .trend__marker {
    fill: var(--color-brand);
    stroke: var(--color-bg-surface);
    stroke-width: 2;
  }

  .trend__point--active .trend__marker {
    r: 6;
  }

  .trend__value--active {
    text-decoration: underline;
  }

  .trend__value {
    fill: var(--color-text-primary);
    font-family: var(--font-serif);
    font-size: 15px;
    font-weight: var(--weight-semibold);
  }

  @media (forced-colors: active) {
    .trend__line {
      stroke: CanvasText;
    }

    .trend__marker {
      fill: CanvasText;
    }
  }
</style>
