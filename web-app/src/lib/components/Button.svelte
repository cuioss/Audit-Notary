<script lang="ts" module>
  /** The variants of a button. One `primary` act per screen (pm-web-app components.adoc). */
  export const BUTTON_VARIANTS = ['primary', 'secondary', 'danger', 'ghost'] as const;
  /** A variant of a button. */
  export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import { uniqueId } from './uniqueId';

  /**
   * An act: a button of the closed vocabulary. Its label says exactly what it does.
   *
   * A busy button keeps its label beside the spinner and ignores clicks.
   */
  interface Props extends Omit<HTMLButtonAttributes, 'children'> {
    /** The variant. */
    variant?: ButtonVariant;
    /** The icon left of the label. */
    icon?: string;
    /** Whether the act is running. */
    busy?: boolean;
    /**
     * Why the act cannot be taken now. The button stays focusable (`aria-disabled`), ignores clicks and says the
     * reason beneath itself, so a person learns what is missing instead of meeting a dead control.
     */
    disabledReason?: string | null;
    /** The label. */
    children: Snippet;
  }

  let {
    variant = 'secondary',
    icon,
    busy = false,
    disabledReason = null,
    type = 'button',
    disabled = false,
    onclick,
    children,
    ...rest
  }: Props = $props();

  const reasonId = uniqueId('reason');

  function handleClick(event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
    if (busy || disabledReason) {
      event.preventDefault();
      return;
    }
    onclick?.(event);
  }
</script>

<!--
  One structure whether or not a reason is shown, so the button is never rebuilt when the reason comes or goes and
  keeps the keyboard focus.
-->
<span class="btn-frame" class:btn-with-reason={!!disabledReason}>
  <button
    {...rest}
    {type}
    class="btn btn--{variant}"
    class:btn--unavailable={!!disabledReason}
    disabled={disabled || undefined}
    aria-disabled={disabledReason ? 'true' : undefined}
    aria-describedby={disabledReason ? reasonId : undefined}
    aria-busy={busy ? 'true' : undefined}
    onclick={handleClick}
  >
    {#if busy}
      <span class="btn__spinner" aria-hidden="true"></span>
    {:else if icon}
      <Icon name={icon} size={16} />
    {/if}
    <span>{@render children()}</span>
  </button>
  {#if disabledReason}
    <span class="btn__reason" id={reasonId}>{disabledReason}</span>
  {/if}
</span>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--control-height);
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    line-height: 1.25;
    border: 1px solid transparent;
    border-radius: var(--control-radius);
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
    white-space: nowrap;
  }

  .btn:disabled {
    background-color: var(--color-bg-subtle);
    color: var(--color-text-muted);
    border-color: var(--color-border);
    cursor: not-allowed;
  }

  .btn.btn--unavailable,
  .btn.btn--unavailable:hover {
    background-color: var(--color-bg-subtle);
    color: var(--color-text-muted);
    border-color: var(--color-border);
    cursor: not-allowed;
  }

  .btn-frame {
    display: contents;
  }

  .btn-frame.btn-with-reason {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
    max-inline-size: 22rem;
  }

  .btn__reason {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
    text-align: end;
  }

  .btn--primary {
    background-color: var(--color-brand);
    color: var(--color-on-brand);
  }

  .btn--primary:hover:not(:disabled) {
    background-color: var(--color-brand-hover);
  }

  .btn--secondary {
    background-color: var(--color-bg-surface);
    color: var(--color-text-primary);
    border-color: var(--color-border-strong);
  }

  .btn--secondary:hover:not(:disabled) {
    background-color: var(--color-bg-subtle);
  }

  .btn--danger {
    background-color: var(--color-danger);
    color: var(--color-on-brand);
  }

  .btn--ghost {
    background-color: transparent;
    color: var(--color-text-secondary);
  }

  .btn--ghost:hover:not(:disabled) {
    background-color: var(--color-bg-subtle);
    color: var(--color-text-primary);
  }

  .btn__spinner {
    inline-size: 1em;
    block-size: 1em;
    border: 2px solid currentcolor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .btn__spinner {
      animation: none;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
