<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * The flow template (first login, release, Settings): one column of at most 720 px, the step's
   * content and its act bar.
   */
  interface Props {
    /** The visible title, the page's `h1`. */
    title: string;
    /** The sentence under the title. */
    intro?: string;
    /** A test id of the page. */
    testId?: string;
    /** The step's content. */
    children: Snippet;
    /** The acts at the end of the step. */
    actions?: Snippet;
  }

  let { title, intro, testId, children, actions }: Props = $props();
</script>

<div class="wizard" data-testid={testId}>
  <header class="wizard__header">
    <h1 class="wizard__title">{title}</h1>
    {#if intro}
      <p class="wizard__intro">{intro}</p>
    {/if}
  </header>
  <div class="wizard__body">{@render children()}</div>
  {#if actions}
    <footer class="wizard__actions">{@render actions()}</footer>
  {/if}
</div>

<style>
  .wizard {
    inline-size: 100%;
    max-inline-size: 720px;
    margin-inline: auto;
    padding: var(--space-8) var(--space-6);
  }

  .wizard__header {
    margin-block-end: var(--space-6);
  }

  .wizard__title {
    font-size: var(--text-2xl);
    line-height: var(--line-height-2xl);
  }

  .wizard__intro {
    margin-block-start: var(--space-2);
    color: var(--color-text-secondary);
  }

  .wizard__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .wizard__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-block-start: var(--space-8);
    padding-block-start: var(--space-4);
    border-block-start: 1px solid var(--color-border);
  }

  @media (max-width: 767px) {
    .wizard {
      padding: var(--space-6) var(--space-4);
    }
  }
</style>
