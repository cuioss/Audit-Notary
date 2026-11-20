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
  }

  let { tone = 'info', title, body, live = false, actions }: Props = $props();

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
  <div class="notice__text">
    <strong class="notice__title">{title}</strong>
    {#if body}
      <p>{body}</p>
    {/if}
  </div>
  {#if actions}
    <div class="notice__actions">{@render actions()}</div>
  {/if}
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

  .notice__text {
    flex: 1 1 auto;
  }

  .notice__actions {
    flex: 0 0 auto;
  }
</style>
