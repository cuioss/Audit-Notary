<script lang="ts" module>
  /** One practice of the rosette, its scores already computed. */
  export interface SealPractice {
    id: string;
    shortName: string;
    name: string;
    /** The scores of stream A and stream B, 0 to 3 each. */
    streams: [number, number];
    score: number;
    target: number | null;
    /** The address of the practice; without one the practice is not a link. */
    href: string | null;
    /** The accessible name: practice, score, target, worded by the view. */
    label: string;
  }

  /** One business function: its practices and its legend entry. */
  export interface SealFunction {
    id: string;
    name: string;
    scoreText: string;
    practices: SealPractice[];
  }

  /** The geometry of the rosette, in the units of its view box. */
  export const GEOMETRY = {
    hub: 54,
    max: 166,
    label: 186,
    sealInner: 200,
    sealOuter: 214,
    lobe: 9.8,
    streamGap: 0.8,
    practiceGap: 2.4,
    functionGap: 6,
  } as const;

  /** The radius of a score on the 0 to 3 scale. */
  export function radiusOf(score: number): number {
    const clamped = Math.max(0, Math.min(3, score));
    return GEOMETRY.hub + ((GEOMETRY.max - GEOMETRY.hub) * clamped) / 3;
  }

  const rad = (degrees: number): number => (degrees * Math.PI) / 180;
  const point = (radius: number, degrees: number): string =>
    `${(radius * Math.cos(rad(degrees))).toFixed(2)} ${(radius * Math.sin(rad(degrees))).toFixed(2)}`;

  /**
   * The outline of one lobe: an annular sector from the hub to `outer`, its outer edge bulged into a scallop, the
   * same lobes the seal of the mark has.
   */
  export function lobePath(from: number, to: number, outer: number): string {
    const inner = GEOMETRY.hub + 2;
    if (outer <= inner + 0.5) return '';
    const middle = (from + to) / 2;
    const bulge = Math.min(9, (outer - inner) * 0.35);
    return [
      `M${point(inner, from)}`,
      `L${point(outer, from)}`,
      `Q${point(outer + bulge * 2, middle)} ${point(outer, to)}`,
      `L${point(inner, to)}`,
      `A${inner} ${inner} 0 0 0 ${point(inner, from)}`,
      'Z',
    ].join(' ');
  }

  /** An arc at a radius between two angles. */
  export function arcPath(radius: number, from: number, to: number): string {
    return `M${point(radius, from)} A${radius} ${radius} 0 0 1 ${point(radius, to)}`;
  }

  /** The scalloped ring of the seal, `count` lobes between the two radii. */
  export function sealPath(inner: number, outer: number, count: number): string {
    let d = '';
    const step = 360 / count;
    for (let index = 0; index < count; index++) {
      const a0 = -90 + index * step;
      const a1 = a0 + step;
      if (index === 0) d += `M${point(inner + (outer - inner) * 0.35, a0)}`;
      d += ` Q${point(outer + (outer - inner) * 0.4, (a0 + a1) / 2)} ${point(inner + (outer - inner) * 0.35, a1)}`;
    }
    return `${d} Z`;
  }

  /** The angles of every stream lobe, practice by practice, function by function. */
  export function layout(functions: { practices: unknown[] }[]): {
    fn: number;
    practice: number;
    streams: [number, number][];
    middle: number;
  }[] {
    const result: { fn: number; practice: number; streams: [number, number][]; middle: number }[] =
      [];
    let angle = -90 + GEOMETRY.functionGap / 2;
    functions.forEach((fn, fnIndex) => {
      fn.practices.forEach((_, practiceIndex) => {
        const a: [number, number] = [angle, angle + GEOMETRY.lobe];
        angle += GEOMETRY.lobe + GEOMETRY.streamGap;
        const b: [number, number] = [angle, angle + GEOMETRY.lobe];
        angle += GEOMETRY.lobe;
        result.push({
          fn: fnIndex,
          practice: practiceIndex,
          streams: [a, b],
          middle: (a[0] + b[1]) / 2,
        });
        if (practiceIndex < fn.practices.length - 1) angle += GEOMETRY.practiceGap;
      });
      angle += GEOMETRY.functionGap;
    });
    return result;
  }
</script>

<script lang="ts">
  /**
   * The maturity seal of a SAMM assessment (doc/concepts/visual-design.adoc, The Seal): the 15 practices of the five
   * business functions as a rosette of 30 lobes, one per stream, each as long as its stream score on the 0 to 3
   * scale. The target of a practice is a dashed arc across its two lobes; the hub states the overall score, or the
   * practice under the pointer or the focus. Every practice is a link with its full accessible name, so the rosette
   * is navigation too; the legend names the functions with their scores, and a table states the same figures
   * (`AssessmentSheet`).
   *
   * Released, a scalloped seal of gold rings the rosette with the version: the only place the seal gold appears. With
   * `pressing`, the seal is pressed in once — the app's one orchestrated motion; under reduced motion it simply
   * stands.
   */
  interface Props {
    /** The business functions in model order. */
    functions: SealFunction[];
    /** The overall score, formatted. */
    overallText: string;
    /** The hub's word for the overall score. */
    overallLabel: string;
    /** The scale's end, "of 3". */
    scaleLabel: string;
    /** The accessible name of the whole figure. */
    label: string;
    /** The legend's accessible name. */
    legendLabel: string;
    /** The release version (`v1`), or `null` while not released. */
    sealed?: string | null;
    /** Whether the seal is being pressed in now. */
    pressing?: boolean;
    /** Formats a score for the hub. */
    format: (value: number) => string;
    /** A test id. */
    testId?: string;
  }

  let {
    functions,
    overallText,
    overallLabel,
    scaleLabel,
    label,
    legendLabel,
    sealed = null,
    pressing = false,
    format,
    testId,
  }: Props = $props();

  let geometry = $derived(layout(functions));
  // Pointer and focus are followed apart: the practice under the pointer wins, else the focused one stays shown.
  let pointed: string | null = $state(null);
  let focused: string | null = $state(null);
  let hovered = $derived(pointed ?? focused);
  let hoveredPractice = $derived(
    hovered === null
      ? null
      : (functions.flatMap((fn) => fn.practices).find((practice) => practice.id === hovered) ??
          null),
  );

  const RINGS = [1, 2, 3];
  // The seal is a ring: the scalloped edge with the centre cut out (even-odd), so the rosette shows through.
  const ringHole = GEOMETRY.sealInner - 3;
  const SEAL = `${sealPath(GEOMETRY.sealInner, GEOMETRY.sealOuter, 72)} M${ringHole} 0 A${ringHole} ${ringHole} 0 1 0 ${-ringHole} 0 A${ringHole} ${ringHole} 0 1 0 ${ringHole} 0 Z`;
  const extent = GEOMETRY.sealOuter + 14;
</script>

<figure
  class="seal"
  class:seal--sealed={sealed !== null}
  class:seal--pressing={pressing}
  data-testid={testId}
  data-sealed={sealed ?? undefined}
>
  <svg
    class="seal__figure"
    viewBox="{-extent} {-extent} {extent * 2} {extent * 2}"
    role="group"
    aria-label={label}
  >
    {#each RINGS as ring (ring)}
      <circle class="seal__ring" r={radiusOf(ring)} />
    {/each}

    {#each geometry as cell (`${cell.fn}-${cell.practice}`)}
      {@const fn = functions[cell.fn]}
      {@const practice = fn.practices[cell.practice]}
      {@const active = hovered === practice.id}
      {#snippet lobes()}
        <path
          class="seal__hit"
          d={lobePath(cell.streams[0][0] - 0.4, cell.streams[1][1] + 0.4, GEOMETRY.max + 6)}
        />
        {#each cell.streams as [from, to], stream (stream)}
          <path class="seal__track" d={lobePath(from, to, GEOMETRY.max)} />
          <path
            class="seal__lobe seal__lobe--fn{cell.fn}"
            d={lobePath(from, to, radiusOf(practice.streams[stream]))}
          />
        {/each}
        {#if practice.target !== null}
          <path
            class="seal__target"
            d={arcPath(radiusOf(practice.target), cell.streams[0][0], cell.streams[1][1])}
          />
        {/if}
      {/snippet}
      {#if practice.href}
        <a
          class="seal__practice"
          class:seal__practice--active={active}
          href={practice.href}
          aria-label={practice.label}
          data-practice={practice.id}
          onmouseenter={() => (pointed = practice.id)}
          onmouseleave={() => (pointed = null)}
          onfocus={() => (focused = practice.id)}
          onblur={() => (focused = null)}
        >
          {@render lobes()}
        </a>
      {:else}
        <g
          class="seal__practice"
          class:seal__practice--active={active}
          role="img"
          aria-label={practice.label}
          data-practice={practice.id}
          onmouseenter={() => (pointed = practice.id)}
          onmouseleave={() => (pointed = null)}
        >
          {@render lobes()}
        </g>
      {/if}
    {/each}

    <g class="seal__labels" aria-hidden="true">
      {#each geometry as cell (`label-${cell.fn}-${cell.practice}`)}
        {@const practice = functions[cell.fn].practices[cell.practice]}
        <text
          class="seal__label"
          class:seal__label--active={hovered === practice.id}
          x={GEOMETRY.label * Math.cos((cell.middle * Math.PI) / 180)}
          y={GEOMETRY.label * Math.sin((cell.middle * Math.PI) / 180)}
          text-anchor="middle"
          dominant-baseline="central">{practice.shortName}</text
        >
      {/each}
    </g>

    <g class="seal__hub" aria-hidden="true">
      <circle class="seal__hub-disc" r={GEOMETRY.hub - 4} />
      {#if hoveredPractice}
        <text class="seal__hub-name" y="-14" text-anchor="middle">{hoveredPractice.shortName}</text>
        <text class="seal__hub-figure seal__hub-figure--small" y="14" text-anchor="middle"
          >{format(hoveredPractice.score)}</text
        >
      {:else}
        <text class="seal__hub-figure" y="6" text-anchor="middle">{overallText}</text>
        <text class="seal__hub-scale" y="28" text-anchor="middle">{scaleLabel}</text>
        <text class="seal__hub-name" y="-26" text-anchor="middle">{overallLabel}</text>
      {/if}
    </g>

    {#if sealed !== null}
      <g class="seal__impression" aria-hidden="true">
        <path class="seal__rim" d={SEAL} fill-rule="evenodd" />
        <circle class="seal__rim-inner" r={GEOMETRY.sealInner - 3} />
        <g class="seal__version" transform="translate(0 {GEOMETRY.sealOuter - 4})">
          <rect class="seal__version-plate" x="-22" y="-12" width="44" height="24" rx="12" />
          <text class="seal__version-text" text-anchor="middle" dominant-baseline="central"
            >{sealed}</text
          >
        </g>
      </g>
    {/if}
  </svg>

  <figcaption class="seal__legend">
    <ul class="seal__legend-list" aria-label={legendLabel}>
      {#each functions as fn, index (fn.id)}
        <li class="seal__legend-item">
          <span class="seal__swatch seal__lobe--fn{index}" aria-hidden="true"></span>
          <span class="seal__legend-name">{fn.name}</span>
          <span class="seal__legend-score">{fn.scoreText}</span>
        </li>
      {/each}
    </ul>
  </figcaption>
</figure>

<style>
  .seal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    inline-size: 100%;
  }

  .seal__figure {
    inline-size: 100%;
    max-inline-size: 30rem;
    block-size: auto;
    overflow: visible;
  }

  .seal__ring {
    fill: none;
    stroke: var(--color-chart-grid);
    stroke-width: 1;
  }

  .seal__track {
    fill: var(--color-bg-subtle);
  }

  .seal__hit {
    fill: transparent;
  }

  .seal__lobe {
    stroke: var(--color-bg-surface);
    stroke-width: 1.5;
    transition: d var(--duration-base) var(--ease-standard);
  }

  .seal__lobe--fn0 {
    fill: var(--color-series-1);
    background-color: var(--color-series-1);
  }

  .seal__lobe--fn1 {
    fill: var(--color-series-2);
    background-color: var(--color-series-2);
  }

  .seal__lobe--fn2 {
    fill: var(--color-series-3);
    background-color: var(--color-series-3);
  }

  .seal__lobe--fn3 {
    fill: var(--color-series-4);
    background-color: var(--color-series-4);
  }

  .seal__lobe--fn4 {
    fill: var(--color-series-5);
    background-color: var(--color-series-5);
  }

  .seal__target {
    fill: none;
    stroke: var(--color-text-primary);
    stroke-width: 2;
    stroke-dasharray: 3 3;
    stroke-linecap: round;
  }

  .seal__label {
    text-decoration: none;
    fill: var(--color-text-secondary);
    font-size: 11px;
    font-weight: var(--weight-medium);
    letter-spacing: 0.02em;
  }

  .seal__label--active {
    fill: var(--color-text-primary);
    font-weight: var(--weight-semibold);
  }

  .seal__practice {
    text-decoration: none;
    cursor: pointer;
    outline: 2px solid transparent;
  }

  .seal__practice:not(.seal__practice--active) .seal__lobe {
    opacity: 1;
  }

  .seal__figure:has(.seal__practice--active)
    .seal__practice:not(.seal__practice--active)
    .seal__lobe {
    opacity: 0.45;
  }

  .seal__practice:focus-visible .seal__hit {
    stroke: var(--color-brand);
    stroke-width: 3;
  }

  .seal__hub-disc {
    fill: var(--color-bg-surface);
    stroke: var(--color-border-strong);
    stroke-width: 1;
  }

  .seal__hub-figure {
    fill: var(--color-text-primary);
    font-family: var(--font-serif);
    font-size: 34px;
    font-weight: var(--weight-semibold);
    font-feature-settings: 'tnum' 1;
  }

  .seal__hub-figure--small {
    font-size: 26px;
  }

  .seal__hub-scale,
  .seal__hub-name {
    fill: var(--color-text-muted);
    font-size: 11px;
  }

  .seal__hub-name {
    fill: var(--color-text-secondary);
    font-weight: var(--weight-medium);
  }

  .seal__rim {
    fill: var(--color-seal);
    stroke: var(--color-seal-rim);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  .seal__rim-inner {
    fill: none;
    stroke: var(--color-seal-rim);
    stroke-width: 1;
  }

  .seal__version-plate {
    fill: var(--color-seal);
    stroke: var(--color-seal-rim);
    stroke-width: 1.5;
  }

  .seal__version-text {
    fill: var(--color-seal-rim);
    font-family: var(--font-serif);
    font-size: 14px;
    font-weight: var(--weight-semibold);
  }

  .seal__impression {
    transform-box: view-box;
    transform-origin: center;
  }

  .seal--pressing .seal__impression {
    animation: seal-press var(--duration-seal) var(--ease-press) both;
  }

  .seal--pressing .seal__practice {
    animation: seal-emboss var(--duration-seal) var(--ease-standard) both;
  }

  @keyframes seal-press {
    0% {
      opacity: 0;
      transform: scale(1.35) rotate(-14deg);
    }

    55% {
      opacity: 1;
    }

    100% {
      opacity: 1;
      transform: scale(1) rotate(0deg);
    }
  }

  @keyframes seal-emboss {
    0%,
    45% {
      filter: none;
    }

    60% {
      filter: brightness(0.82);
    }

    100% {
      filter: none;
    }
  }

  .seal__legend-list {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2) var(--space-5);
    list-style: none;
  }

  .seal__legend-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .seal__swatch {
    inline-size: 10px;
    block-size: 10px;
    border-radius: 3px;
  }

  .seal__legend-score {
    color: var(--color-text-primary);
    font-weight: var(--weight-semibold);
    font-feature-settings: 'tnum' 1;
  }

  @media (forced-colors: active) {
    .seal__lobe,
    .seal__swatch {
      fill: CanvasText;
      background-color: CanvasText;
    }

    .seal__track {
      fill: Canvas;
      stroke: CanvasText;
      stroke-width: 0.5;
    }

    .seal__label,
    .seal__hub-figure,
    .seal__hub-name,
    .seal__hub-scale,
    .seal__version-text {
      fill: CanvasText;
    }

    .seal__rim,
    .seal__version-plate {
      fill: Canvas;
      stroke: CanvasText;
    }
  }
</style>
