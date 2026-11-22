<script lang="ts">
  import type { MarkRendering } from './brand';

  /**
   * The Audit Notary mark: a document page with a folded corner and a round seal with a scalloped edge and a plain
   * centre on its lower half (doc/concepts/brand.adoc, The Mark). At 16 pixels the mark reduces to the seal alone.
   * PROVISIONAL drawing on the 24 × 24 grid, to be replaced by the accepted final mark before the first release.
   *
   * The colour rendering takes the mascot palette tokens, the same in both themes; the monochrome
   * rendering follows `currentColor`, with the centre of the seal cut out. In forced-colors mode the colour rendering
   * falls back to one colour.
   */
  interface Props {
    /** The rendering. */
    rendering?: MarkRendering;
    /** The size in pixels. */
    size?: 16 | 20 | 24 | 28 | 32 | 64;
    /** The accessible name; without it the mark is decorative because the visible name stands beside it. */
    label?: string;
  }

  let { rendering = 'colour', size = 28, label }: Props = $props();

  /** At the smallest size the page with its folded corner is no longer legible; the seal alone stands for the mark. */
  let sealOnly = $derived(size <= 16);
</script>

<svg
  class="mark mark--{rendering}"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : 'true'}
  data-testid="brand-mark"
  data-rendering={rendering}
  data-variant={sealOnly ? 'seal' : 'page'}
>
  {#if sealOnly}
    <circle class="mark__centre" cx="12" cy="12" r="4.7" />
    <path
      class="mark__seal mark__seal--alone"
      fill-rule="evenodd"
      d="M12.00 2.20 12.38 2.30 12.74 2.58 13.06 3.00 13.35 3.51 13.77 3.11 14.21 2.81 14.64 2.66 15.03 2.68 15.36 2.89 15.62 3.27 15.79 3.77 15.90 4.34 16.43 4.10 16.94 3.94 17.39 3.93 17.76 4.07 18.01 4.38 18.14 4.82 18.15 5.35 18.08 5.92 18.65 5.85 19.18 5.86 19.62 5.99 19.93 6.24 20.07 6.61 20.06 7.06 19.90 7.57 19.66 8.10 20.23 8.21 20.73 8.38 21.11 8.64 21.32 8.97 21.34 9.36 21.19 9.79 20.89 10.23 20.49 10.65 21.00 10.94 21.42 11.26 21.70 11.62 21.80 12.00 21.70 12.38 21.42 12.74 21.00 13.06 20.49 13.35 20.89 13.77 21.19 14.21 21.34 14.64 21.32 15.03 21.11 15.36 20.73 15.62 20.23 15.79 19.66 15.90 19.90 16.43 20.06 16.94 20.07 17.39 19.93 17.76 19.62 18.01 19.18 18.14 18.65 18.15 18.08 18.08 18.15 18.65 18.14 19.18 18.01 19.62 17.76 19.93 17.39 20.07 16.94 20.06 16.43 19.90 15.90 19.66 15.79 20.23 15.62 20.73 15.36 21.11 15.03 21.32 14.64 21.34 14.21 21.19 13.77 20.89 13.35 20.49 13.06 21.00 12.74 21.42 12.38 21.70 12.00 21.80 11.62 21.70 11.26 21.42 10.94 21.00 10.65 20.49 10.23 20.89 9.79 21.19 9.36 21.34 8.97 21.32 8.64 21.11 8.38 20.73 8.21 20.23 8.10 19.66 7.57 19.90 7.06 20.06 6.61 20.07 6.24 19.93 5.99 19.62 5.86 19.18 5.85 18.65 5.92 18.08 5.35 18.15 4.82 18.14 4.38 18.01 4.07 17.76 3.93 17.39 3.94 16.94 4.10 16.43 4.34 15.90 3.77 15.79 3.27 15.62 2.89 15.36 2.68 15.03 2.66 14.64 2.81 14.21 3.11 13.77 3.51 13.35 3.00 13.06 2.58 12.74 2.30 12.38 2.20 12.00 2.30 11.62 2.58 11.26 3.00 10.94 3.51 10.65 3.11 10.23 2.81 9.79 2.66 9.36 2.68 8.97 2.89 8.64 3.27 8.38 3.77 8.21 4.34 8.10 4.10 7.57 3.94 7.06 3.93 6.61 4.07 6.24 4.38 5.99 4.82 5.86 5.35 5.85 5.92 5.92 5.85 5.35 5.86 4.82 5.99 4.38 6.24 4.07 6.61 3.93 7.06 3.94 7.57 4.10 8.10 4.34 8.21 3.77 8.38 3.27 8.64 2.89 8.97 2.68 9.36 2.66 9.79 2.81 10.23 3.11 10.65 3.51 10.94 3.00 11.26 2.58 11.62 2.30ZM7.3 12a4.7 4.7 0 1 0 9.4 0a4.7 4.7 0 1 0 -9.4 0Z"
    />
  {:else}
    <path class="mark__page" d="M5 2.75h9.5L19 7.25v14H5Z" />
    <path class="mark__lines" d="M14.5 2.75v4.5H19M8 7.75h4M8 10.75h6.5" />
    <path
      class="mark__seal"
      fill-rule="evenodd"
      d="M13.50 11.55 13.65 11.59 13.80 11.72 13.92 11.91 14.03 12.14 14.20 11.96 14.38 11.82 14.56 11.74 14.72 11.74 14.85 11.83 14.95 12.00 15.01 12.22 15.04 12.47 15.26 12.35 15.48 12.27 15.67 12.25 15.82 12.30 15.92 12.43 15.96 12.62 15.95 12.85 15.90 13.10 16.15 13.05 16.38 13.04 16.57 13.08 16.70 13.18 16.75 13.33 16.73 13.52 16.65 13.74 16.53 13.96 16.78 13.99 17.00 14.05 17.17 14.15 17.26 14.28 17.26 14.44 17.18 14.62 17.04 14.80 16.86 14.97 17.09 15.08 17.28 15.20 17.41 15.35 17.45 15.50 17.41 15.65 17.28 15.80 17.09 15.92 16.86 16.03 17.04 16.20 17.18 16.38 17.26 16.56 17.26 16.72 17.17 16.85 17.00 16.95 16.78 17.01 16.53 17.04 16.65 17.26 16.73 17.48 16.75 17.67 16.70 17.82 16.57 17.92 16.38 17.96 16.15 17.95 15.90 17.90 15.95 18.15 15.96 18.38 15.92 18.57 15.82 18.70 15.67 18.75 15.48 18.73 15.26 18.65 15.04 18.53 15.01 18.78 14.95 19.00 14.85 19.17 14.72 19.26 14.56 19.26 14.38 19.18 14.20 19.04 14.03 18.86 13.92 19.09 13.80 19.28 13.65 19.41 13.50 19.45 13.35 19.41 13.20 19.28 13.08 19.09 12.97 18.86 12.80 19.04 12.62 19.18 12.44 19.26 12.28 19.26 12.15 19.17 12.05 19.00 11.99 18.78 11.96 18.53 11.74 18.65 11.52 18.73 11.33 18.75 11.18 18.70 11.08 18.57 11.04 18.38 11.05 18.15 11.10 17.90 10.85 17.95 10.62 17.96 10.43 17.92 10.30 17.82 10.25 17.67 10.27 17.48 10.35 17.26 10.47 17.04 10.22 17.01 10.00 16.95 9.83 16.85 9.74 16.72 9.74 16.56 9.82 16.38 9.96 16.20 10.14 16.03 9.91 15.92 9.72 15.80 9.59 15.65 9.55 15.50 9.59 15.35 9.72 15.20 9.91 15.08 10.14 14.97 9.96 14.80 9.82 14.62 9.74 14.44 9.74 14.28 9.83 14.15 10.00 14.05 10.22 13.99 10.47 13.96 10.35 13.74 10.27 13.52 10.25 13.33 10.30 13.18 10.43 13.08 10.62 13.04 10.85 13.05 11.10 13.10 11.05 12.85 11.04 12.62 11.08 12.43 11.18 12.30 11.33 12.25 11.52 12.27 11.74 12.35 11.96 12.47 11.99 12.22 12.05 12.00 12.15 11.83 12.28 11.74 12.44 11.74 12.62 11.82 12.80 11.96 12.97 12.14 13.08 11.91 13.20 11.72 13.35 11.59ZM11.65 15.5a1.85 1.85 0 1 0 3.7 0a1.85 1.85 0 1 0 -3.7 0Z"
    />
  {/if}
</svg>

<style>
  .mark {
    flex: 0 0 auto;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mark--colour .mark__page,
  .mark--colour .mark__centre {
    fill: var(--color-mascot-cream);
    stroke: var(--color-mascot-outline);
    stroke-width: 1.5;
  }

  .mark--colour .mark__centre {
    stroke: none;
  }

  .mark--colour .mark__lines {
    fill: none;
    stroke: var(--color-mascot-outline);
    stroke-width: 1.5;
  }

  .mark--colour .mark__seal {
    fill: var(--color-mascot-gold);
    stroke: var(--color-mascot-outline);
    stroke-width: 1;
  }

  .mark--colour .mark__seal--alone {
    stroke-width: 1.5;
  }

  .mark--monochrome .mark__page,
  .mark--monochrome .mark__lines {
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.5;
  }

  .mark--monochrome .mark__centre {
    display: none;
  }

  .mark--monochrome .mark__seal {
    fill: currentcolor;
  }

  @media (forced-colors: active) {
    .mark--colour .mark__page,
    .mark--colour .mark__lines {
      fill: none;
      stroke: currentcolor;
    }

    .mark--colour .mark__centre {
      display: none;
    }

    .mark--colour .mark__seal {
      fill: currentcolor;
      stroke: none;
    }
  }
</style>
