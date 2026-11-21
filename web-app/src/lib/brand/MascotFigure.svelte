<script lang="ts" module>
  /** The poses of the ranch-hand mascot (doc/concepts/brand.adoc, The Mascot). */
  export const MASCOT_POSES = ['welcome', 'at-work', 'done'] as const;
  /** A pose. */
  export type MascotPose = (typeof MASCOT_POSES)[number];
</script>

<script lang="ts">
  /**
   * The place of the mascot on calm surfaces: login, empty states, a finished release.
   *
   * No pose is delivered yet (brand.adoc: the poses need the owner's acceptance and licence before they
   * ship), so the figure renders nothing; views already place it where a pose belongs.
   */
  interface Props {
    /** The pose. */
    pose: MascotPose;
  }

  let { pose }: Props = $props();

  /** The delivered images per pose; empty until a pose is accepted. */
  const DELIVERED: Partial<Record<MascotPose, string>> = {};

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
