<script lang="ts">
  import { sealPath } from './MaturitySeal.svelte';

  /**
   * The seal of a release for a document that has no maturity rosette (doc/concepts/visual-design.adoc, The Seal): the
   * scalloped ring of gold of `MaturitySeal` around the version, pressed into the sheet once when the release is done.
   * It is the same gold, the same ring and the same motion as the seal of an assessment, so a released note and a
   * released assessment wear one mark. It appears only after a release: before it, a document has no seal.
   */
  interface Props {
    /** The release version (`v1`), in the middle. */
    version: string;
    /** The word above the version: "Released". */
    caption: string;
    /** The accessible name of the whole figure. */
    label: string;
    /** Whether the seal is being pressed in now. */
    pressing?: boolean;
    /** A test id. */
    testId?: string;
  }

  let { version, caption, label, pressing = false, testId }: Props = $props();

  const INNER = 84;
  const OUTER = 98;
  const HOLE = INNER - 3;
  // The ring: the scalloped edge with the centre cut out (even-odd), as the ring of the maturity seal.
  const RING = `${sealPath(INNER, OUTER, 48)} M${HOLE} 0 A${HOLE} ${HOLE} 0 1 0 ${-HOLE} 0 A${HOLE} ${HOLE} 0 1 0 ${HOLE} 0 Z`;
  const EXTENT = OUTER + 14;
</script>

<figure
  class="release-seal"
  class:release-seal--pressing={pressing}
  data-testid={testId}
  data-sealed={version}
>
  <svg
    class="release-seal__figure"
    viewBox="{-EXTENT} {-EXTENT} {EXTENT * 2} {EXTENT * 2}"
    role="img"
    aria-label={label}
  >
    <g class="release-seal__impression">
      <circle class="release-seal__disc" r={HOLE} />
      <path class="release-seal__rim" d={RING} fill-rule="evenodd" />
      <circle class="release-seal__rim-inner" r={HOLE} />
      <text class="release-seal__caption" y="-22" text-anchor="middle">{caption}</text>
      <text class="release-seal__version" y="22" text-anchor="middle">{version}</text>
    </g>
  </svg>
</figure>

<style>
  .release-seal {
    display: flex;
    justify-content: center;
    inline-size: 100%;
  }

  .release-seal__figure {
    inline-size: 100%;
    max-inline-size: 14rem;
    block-size: auto;
    overflow: visible;
  }

  .release-seal__disc {
    fill: var(--color-bg-surface);
  }

  .release-seal__rim {
    fill: var(--color-seal);
    stroke: var(--color-seal-rim);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  .release-seal__rim-inner {
    fill: none;
    stroke: var(--color-seal-rim);
    stroke-width: 1;
  }

  .release-seal__caption {
    fill: var(--color-text-secondary);
    font-size: 15px;
    font-weight: var(--weight-medium);
  }

  .release-seal__version {
    fill: var(--color-text-primary);
    font-family: var(--font-serif);
    font-size: 52px;
    font-weight: var(--weight-semibold);
    font-feature-settings: 'tnum' 1;
  }

  .release-seal__impression {
    transform-box: view-box;
    transform-origin: center;
  }

  .release-seal--pressing .release-seal__impression {
    animation: release-seal-press var(--duration-seal) var(--ease-press) both;
  }

  @keyframes release-seal-press {
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

  @media (forced-colors: active) {
    .release-seal__disc,
    .release-seal__rim {
      fill: Canvas;
      stroke: CanvasText;
    }

    .release-seal__caption,
    .release-seal__version {
      fill: CanvasText;
    }
  }
</style>
