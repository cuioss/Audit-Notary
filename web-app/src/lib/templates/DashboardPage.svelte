<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * The launcher template (Due, Reports): a title, an introduction and a column of sections, at most
   * 1440 px wide (pm-web-app view-density-and-filtering.adoc).
   */
  interface Props {
    /** The visible title, the page's `h1`. */
    title: string;
    /** The sentence under the title. */
    intro?: string;
    /** A test id of the page. */
    testId?: string;
    /** The sections. */
    children: Snippet;
  }

  let { title, intro, testId, children }: Props = $props();
</script>

<div class="dashboard" data-testid={testId}>
  <header class="dashboard__header">
    <h1 class="dashboard__title">{title}</h1>
    {#if intro}
      <p class="dashboard__intro">{intro}</p>
    {/if}
  </header>
  <div class="dashboard__body">{@render children()}</div>
</div>

<style>
  .dashboard {
    inline-size: 100%;
    max-inline-size: 1440px;
    padding: var(--space-8) var(--space-6) var(--space-12);
  }

  .dashboard__header {
    margin-block-end: var(--space-6);
  }

  .dashboard__title {
    font-family: var(--font-serif);
    font-size: var(--text-display);
    line-height: var(--line-height-display);
    font-weight: var(--weight-semibold);
    letter-spacing: -0.01em;
  }

  .dashboard__intro {
    max-inline-size: var(--measure);
    margin-block-start: var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-md);
    line-height: var(--line-height-md);
  }

  .dashboard__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  @media (max-width: 767px) {
    .dashboard {
      padding: var(--space-5) var(--space-3) var(--space-8);
    }

    .dashboard__title {
      font-size: var(--text-2xl);
      line-height: var(--line-height-2xl);
    }
  }
</style>
