<script lang="ts" module>
  /** The poses of the notary mascot (doc/concepts/brand.adoc, The Mascot). */
  export const MASCOT_POSES = ['welcome', 'at-work', 'done'] as const;
  /** A pose. */
  export type MascotPose = (typeof MASCOT_POSES)[number];
</script>

<script lang="ts">
  import notary from './mascot-notary.png';

  /**
   * The place of the mascot on calm surfaces: login, empty states, a finished release.
   *
   * The notary bear, accepted by the owner (brand.adoc, The Mascot), serves every pose until pose-specific images
   * are made. The image is decorative: the surface around it carries the words.
   */
  interface Props {
    /** The pose. */
    pose: MascotPose;
  }

  let { pose }: Props = $props();

  /** The delivered images per pose; one accepted image for all of them so far. */
  const DELIVERED: Partial<Record<MascotPose, string>> = {
    welcome: notary,
    'at-work': notary,
    done: notary,
  };

  let source = $derived(DELIVERED[pose]);
</script>

{#if source}
  <img class="mascot" src={source} alt="" data-pose={pose} />
{/if}

<style>
  .mascot {
    max-inline-size: 12rem;
    block-size: auto;
  }
</style>
