<script lang="ts" module>
  /** One row of a dumbbell chart: a score at two moments. */
  export interface DumbbellRow {
    id: string;
    /** The name of the row. */
    label: string;
    from: number;
    to: number;
    /** What the row says in words: "1.13 to 1.25". */
    values: string;
    /** The change with its sign: "+0.13". */
    change: string;
    /** The colour slot, 1 to 5; without one the row is drawn in the ink of the app. */
    slot?: number;
    /** How deep the row stands: 0 a business function, 1 a practice, 2 a stream. */
    level?: 0 | 1 | 2;
  }
</script>

<script lang="ts">
  /**
   * The same measure at two moments, one row each: a ring at the earlier score, a filled dot at the later one and a bar
   * between them (a dumbbell). The ring and the dot differ in form, not only in place or colour, and every row says its
   * two scores and the change in words, so no value depends on colour (the series colours stay below 3:1 on the white
   * sheet, doc/concepts/visual-design.adoc, Tokens). The scale is fixed, from 0 to `max`, so rows of different lists
   * compare. Nothing is measured in script: a row's places are CSS custom properties.
   */
  interface Props {
    /** The rows. */
    rows: DumbbellRow[];
    /** The top of the scale. */
    max: number;
    /** The words for the ring, the earlier assessment: "2025 Q4". */
    fromLabel: string;
    /** The words for the dot, the later assessment. */
    toLabel: string;
    /** The accessible name of the list. */
    label: string;
    /** Whether the legend of the ring and the dot is drawn above the rows. */
    legend?: boolean;
    /** A test id. */
    testId?: string;
  }

  let { rows, max, fromLabel, toLabel, label, legend = true, testId }: Props = $props();

  let top = $derived(max > 0 ? max : 1);
  let scale = $derived(Array.from({ length: Math.floor(top) + 1 }, (_, index) => index));
  const place = (value: number) => Math.min(100, Math.max(0, (value / top) * 100));
</script>

<div class="dumbbell" data-testid={testId}>
  {#if legend}
    <p class="dumbbell__legend">
      <span class="dumbbell__key"
        ><span class="dumbbell__ring" aria-hidden="true"></span>{fromLabel}</span
      >
      <span class="dumbbell__key"
        ><span class="dumbbell__dot" aria-hidden="true"></span>{toLabel}</span
      >
    </p>
  {/if}
  <div class="dumbbell__scale" aria-hidden="true">
    <span></span>
    <span class="dumbbell__ticks">
      {#each scale as tick (tick)}
        <span class="dumbbell__tick" style:--at={place(tick)}>{tick}</span>
      {/each}
    </span>
    <span></span>
  </div>
  <ul class="dumbbell__rows" aria-label={label}>
    {#each rows as row (row.id)}
      <li
        class="dumbbell__row dumbbell__row--{row.level ?? 0} series--{row.slot ?? 0}"
        data-testid="dumbbell-{row.id}"
      >
        <span class="dumbbell__name">{row.label}</span>
        <span
          class="dumbbell__track"
          aria-hidden="true"
          style:--lo={place(Math.min(row.from, row.to))}
          style:--hi={place(Math.max(row.from, row.to))}
          style:--from={place(row.from)}
          style:--to={place(row.to)}
        >
          {#each scale as tick (tick)}
            <span class="dumbbell__line" style:--at={place(tick)}></span>
          {/each}
          <span class="dumbbell__bar"></span>
          <span class="dumbbell__ring dumbbell__ring--at"></span>
          <span class="dumbbell__dot dumbbell__dot--at"></span>
        </span>
        <span class="dumbbell__words">
          <span class="dumbbell__values">{row.values}</span>
          <span class="dumbbell__change">{row.change}</span>
        </span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .series--0 {
    --series: var(--color-brand);
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

  .dumbbell__legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
    margin-block-end: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .dumbbell__key {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .dumbbell__ring,
  .dumbbell__dot {
    display: inline-block;
    box-sizing: border-box;
    inline-size: 0.75rem;
    block-size: 0.75rem;
    border: 2px solid var(--series, var(--color-brand));
    border-radius: 50%;
    flex: none;
  }

  .dumbbell__ring {
    background: var(--color-bg-surface);
  }

  .dumbbell__dot {
    background: var(--series, var(--color-brand));
  }

  .dumbbell__rows,
  .dumbbell__scale {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dumbbell__scale,
  .dumbbell__row {
    display: grid;
    grid-template-columns: minmax(7rem, 14rem) minmax(8rem, 1fr) minmax(8rem, 11rem);
    align-items: center;
    column-gap: var(--space-4);
  }

  .dumbbell__ticks,
  .dumbbell__track {
    position: relative;
    display: block;
    block-size: 1.25rem;
    margin-inline: 0.5rem;
  }

  .dumbbell__tick {
    position: absolute;
    inset-inline-start: calc(var(--at) * 1%);
    transform: translateX(-50%);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-feature-settings: 'tnum' 1;
  }

  .dumbbell__row {
    padding-block: var(--space-2);
    border-block-end: 1px solid var(--color-border);
  }

  .dumbbell__row--1 .dumbbell__name {
    padding-inline-start: var(--space-4);
  }

  .dumbbell__row--2 .dumbbell__name {
    padding-inline-start: var(--space-8);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .dumbbell__name {
    font-family: var(--font-serif);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    overflow-wrap: anywhere;
  }

  .dumbbell__row--1 .dumbbell__name,
  .dumbbell__row--2 .dumbbell__name {
    font-family: var(--font-sans);
    font-size: var(--text-base);
    font-weight: var(--weight-regular);
  }

  .dumbbell__line {
    position: absolute;
    inset-block: 0;
    inset-inline-start: calc(var(--at) * 1%);
    inline-size: 1px;
    background: var(--color-chart-grid);
  }

  .dumbbell__bar {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: calc(var(--lo) * 1%);
    inline-size: calc((var(--hi) - var(--lo)) * 1%);
    block-size: 3px;
    transform: translateY(-50%);
    background: var(--series, var(--color-brand));
  }

  .dumbbell__ring--at,
  .dumbbell__dot--at {
    position: absolute;
    inset-block-start: 50%;
    transform: translate(-50%, -50%);
    inline-size: 0.9rem;
    block-size: 0.9rem;
  }

  .dumbbell__ring--at {
    inset-inline-start: calc(var(--from) * 1%);
  }

  .dumbbell__dot--at {
    inset-inline-start: calc(var(--to) * 1%);
  }

  .dumbbell__words {
    display: flex;
    flex-direction: column;
    font-feature-settings: 'tnum' 1;
  }

  .dumbbell__values {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .dumbbell__change {
    font-family: var(--font-serif);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  @media (max-width: 767px) {
    /* The scale stays: the track of every row and the ticks share one column, the scores a column of a fixed width. */
    .dumbbell__scale,
    .dumbbell__row {
      grid-template-columns: minmax(0, 1fr) 7rem;
    }

    .dumbbell__scale > :first-child {
      display: none;
    }

    .dumbbell__row {
      row-gap: var(--space-1);
    }

    .dumbbell__name {
      grid-column: 1 / -1;
    }

    .dumbbell__track {
      margin-inline: 0.5rem;
    }
  }

  @media (forced-colors: active) {
    .dumbbell__bar {
      background: CanvasText;
    }

    .dumbbell__ring,
    .dumbbell__dot {
      border-color: CanvasText;
    }

    .dumbbell__dot {
      background: CanvasText;
    }
  }
</style>
