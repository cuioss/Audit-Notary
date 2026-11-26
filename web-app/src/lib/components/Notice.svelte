<script lang="ts" module>
  /** The tones of a notice; a state always carries its word, never a colour alone. */
  export type NoticeTone = 'attention' | 'danger' | 'success' | 'info';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  /**
   * A notice above a view: the degraded state, a refused save, a finished step.
   */
  interface Props {
    /** The tone. */
    tone?: NoticeTone;
    /** The title, the word of the state. */
    title: string;
    /** The sentence below. */
    body?: string;
    /** Announced to screen readers as it appears. */
    live?: boolean;
    /** An optional act. */
    actions?: Snippet;
    /** Whether the act stands under the text at every width: for a row of acts rather than one. */
    stacked?: boolean;
  }

  let { tone = 'info', title, body, live = false, actions, stacked = false }: Props = $props();

  const ICONS: Record<NoticeTone, string> = {
    attention: 'state.alert',
    danger: 'state.alert',
    success: 'state.check',
    info: 'state.dot',
  };
</script>

<div
  class="notice notice--{tone}"
  role={live ? (tone === 'danger' ? 'alert' : 'status') : undefined}
  data-testid="notice"
  data-tone={tone}
>
  <span class="notice__icon"><Icon name={ICONS[tone]} size={20} /></span>
  <div class="notice__main">
    <div class="notice__row" class:notice__row--stacked={stacked}>
      <div class="notice__text">
        <strong class="notice__title" class:notice__title--lone={!body}>{title}</strong>
        {#if body}
          <p>{body}</p>
        {/if}
      </div>
      {#if actions}
        <div class="notice__actions">{@render actions()}</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .notice {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background-color: var(--color-bg-surface);
    color: var(--color-text-primary);
  }

  .notice--attention {
    background-color: var(--color-attention-subtle);
    border-color: var(--color-attention);
  }

  .notice--attention .notice__icon {
    color: var(--color-attention-text);
  }

  .notice--danger {
    background-color: var(--color-danger-subtle);
    border-color: var(--color-danger);
  }

  .notice--danger .notice__icon {
    color: var(--color-danger);
  }

  .notice--success {
    background-color: var(--color-success-subtle);
    border-color: var(--color-success);
  }

  .notice--success .notice__icon {
    color: var(--color-success);
  }

  /* The notice measures its own width: the act stands beside the text where there is room, under it where not. */
  .notice__main {
    container-type: inline-size;
    flex: 1 1 0;
    min-inline-size: 0;
  }

  .notice__row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .notice__text {
    flex: 1 1 auto;
  }

  .notice__actions {
    flex: 0 0 auto;
  }

  /* A link as the act of a notice is a target like a button. */
  .notice__actions :global(a.link:not(.link--button)) {
    display: inline-flex;
    align-items: center;
    min-block-size: 44px;
  }

  @container (min-width: 30rem) {
    .notice__row:not(.notice__row--stacked) {
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
    }
  }

  /* A title with no sentence below it is the sentence itself: it reads as text, not as a heading. */
  .notice__title--lone {
    font-weight: var(--weight-medium);
  }
</style>
