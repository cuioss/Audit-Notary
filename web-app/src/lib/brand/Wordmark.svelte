<script lang="ts">
  import { t } from '../i18n';
  import BrandMark from './BrandMark.svelte';
  import { BRAND_NAME_KEY, BRAND_TAGLINE_KEY } from './brand';

  /**
   * The mark with the visible name, optionally with the descriptor below (calm surfaces only).
   */
  interface Props {
    /** Whether the descriptor is shown under the name. */
    withTagline?: boolean;
    /** Whether only the mark is shown (collapsed rail); the name then becomes its accessible name. */
    compact?: boolean;
  }

  let { withTagline = false, compact = false }: Props = $props();
</script>

<span class="wordmark" data-testid="wordmark">
  {#if compact}
    <BrandMark size={28} label={$t(BRAND_NAME_KEY)} />
  {:else}
    <BrandMark size={28} />
    <span class="wordmark__text">
      <span class="wordmark__name">{$t(BRAND_NAME_KEY)}</span>
      {#if withTagline}
        <span class="wordmark__tagline">{$t(BRAND_TAGLINE_KEY)}</span>
      {/if}
    </span>
  {/if}
</span>

<style>
  .wordmark {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .wordmark__text {
    display: flex;
    flex-direction: column;
  }

  .wordmark__name {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    letter-spacing: -0.01em;
  }

  .wordmark__tagline {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }
</style>
