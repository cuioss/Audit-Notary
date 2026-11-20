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
    /** The label. */
    children: Snippet;
  }

  let {
    variant = 'secondary',
    icon,
    busy = false,
    type = 'button',
    disabled = false,
    onclick,
    children,
    ...rest
  }: Props = $props();

  function handleClick(event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
    if (busy) {
      event.preventDefault();
      return;
    }
    onclick?.(event);
  }
</script>

<button
  {...rest}
  {type}
  class="btn btn--{variant}"
  disabled={disabled || undefined}
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
