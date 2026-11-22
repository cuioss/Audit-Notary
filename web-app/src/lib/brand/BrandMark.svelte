<script lang="ts">
  import type { MarkRendering } from './brand';

  /**
   * The Audit Notary mark: a document page with a trail of three commit nodes, the newest gold
   * (doc/concepts/brand.adoc, The Mark). PROVISIONAL drawing on the 24 × 24 grid, to be replaced by the
   * accepted final mark before the first release.
   *
   * The colour rendering takes the mascot palette tokens, the same in both themes; the monochrome
   * rendering follows `currentColor`. In forced-colors mode the colour rendering falls back to one colour.
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
>
  <path class="mark__page" d="M5 2.75h9.5L19 7.25v14H5Z" />
  <path class="mark__fold" d="M14.5 2.75v4.5H19" />
  <path class="mark__trail" d="M8.5 17.5 12 13.25 15.5 10" />
  <circle class="mark__node" cx="8.5" cy="17.5" r="1.6" />
  <circle class="mark__node" cx="12" cy="13.25" r="1.6" />
  <circle class="mark__node mark__node--newest" cx="15.5" cy="10" r="1.9" />
</svg>

<style>
  .mark {
    flex: 0 0 auto;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mark--colour .mark__page {
    fill: var(--color-mascot-cream);
    stroke: var(--color-mascot-outline);
    stroke-width: 1.5;
  }

  .mark--colour .mark__fold,
  .mark--colour .mark__trail {
    fill: none;
    stroke: var(--color-mascot-outline);
    stroke-width: 1.5;
  }

  .mark--colour .mark__node {
    fill: var(--color-mascot-hat);
    stroke: var(--color-mascot-outline);
    stroke-width: 1;
  }

  .mark--colour .mark__node--newest {
    fill: var(--color-mascot-gold);
  }

  .mark--monochrome .mark__page,
  .mark--monochrome .mark__fold,
  .mark--monochrome .mark__trail {
    fill: none;
    stroke: currentcolor;
    stroke-width: 1.5;
  }

  .mark--monochrome .mark__node {
    fill: currentcolor;
  }

  @media (forced-colors: active) {
    .mark--colour .mark__page,
    .mark--colour .mark__fold,
    .mark--colour .mark__trail {
      fill: none;
      stroke: currentcolor;
    }

    .mark--colour .mark__node {
      fill: currentcolor;
      stroke: none;
    }
  }
</style>
