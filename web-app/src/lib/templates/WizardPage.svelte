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
    /** A wide flow (the release, which shows the document it releases): up to 1120 px instead of 720 px. */
    wide?: boolean;
  }

  let { title, intro, testId, children, actions, wide = false }: Props = $props();
</script>

<div class="wizard" class:wizard--wide={wide} data-testid={testId}>
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

  .wizard--wide {
    max-inline-size: 1120px;
  }

  .wizard__header {
    margin-block-end: var(--space-6);
  }

  .wizard__title {
    font-family: var(--font-serif);
    font-size: var(--text-display);
    line-height: var(--line-height-display);
    font-weight: var(--weight-semibold);
    letter-spacing: -0.01em;
  }

  .wizard__intro {
    max-inline-size: var(--measure);
    margin-block-start: var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-md);
    line-height: var(--line-height-md);
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

    .wizard__title {
      font-size: var(--text-2xl);
      line-height: var(--line-height-2xl);
    }
  }
</style>
