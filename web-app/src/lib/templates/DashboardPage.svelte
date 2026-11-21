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
    padding: var(--space-6);
  }

  .dashboard__header {
    margin-block-end: var(--space-6);
  }

  .dashboard__title {
    font-size: var(--text-2xl);
    line-height: var(--line-height-2xl);
  }

  .dashboard__intro {
    margin-block-start: var(--space-1);
    color: var(--color-text-secondary);
  }

  .dashboard__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  @media (max-width: 767px) {
    .dashboard {
      padding: var(--space-4);
    }
  }
</style>
