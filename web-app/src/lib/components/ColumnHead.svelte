<script lang="ts">
  import type { Snippet } from 'svelte';
  import KindMark, { type Kind } from './KindMark.svelte';
  import Link from './Link.svelte';

  /**
   * The head of a list column: the level's kind, its title as the link that closes the levels to its right, and an
   * optional line below. Compact, so the list starts high.
   */
  interface Props {
    /** The level's kind. */
    kind: Kind;
    /** The word of the kind. */
    kindLabel: string;
    /** The title. */
    title: string;
    /** The level's own address. */
    href: string;
    /** A line under the title. */
    meta?: Snippet;
  }

  let { kind, kindLabel, title, href, meta }: Props = $props();
</script>

<header class="column-head">
  <KindMark {kind} label={kindLabel} />
  <h2 class="column-head__title"><Link {href} quiet>{title}</Link></h2>
  {#if meta}
    <div class="column-head__meta">{@render meta()}</div>
  {/if}
</header>

<style>
  .column-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-1) var(--space-4) var(--space-3);
  }

  .column-head__title {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
    font-weight: var(--weight-semibold);
  }

  .column-head__title :global(.link:hover) {
    text-decoration: underline;
  }

  /* On the phone the title is a touch target of 44 px; the negative margin keeps the head as high as before. */
  @media (max-width: 767px) {
    .column-head__title :global(.link) {
      display: inline-block;
      padding-block: var(--space-3);
      margin-block: calc(var(--space-3) * -1);
    }
  }

  .column-head__meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
</style>
