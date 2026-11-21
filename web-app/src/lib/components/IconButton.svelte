<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';

  /**
   * An act shown as an icon alone; `label` is its accessible name and its advisory.
   */
  interface Props extends HTMLButtonAttributes {
    /** The icon name. */
    icon: string;
    /** The accessible name. */
    label: string;
    /** Whether the control is pressed, for a toggle. */
    pressed?: boolean;
  }

  let { icon, label, pressed, type = 'button', ...rest }: Props = $props();
</script>

<button
  {...rest}
  {type}
  class="icon-btn"
  aria-label={label}
  title={label}
  aria-pressed={pressed === undefined ? undefined : pressed}
>
  <Icon name={icon} size={20} />
</button>

<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--control-height);
    block-size: var(--control-height);
    border-radius: var(--control-radius);
    color: var(--color-text-secondary);
  }

  .icon-btn:hover {
    background-color: var(--color-bg-subtle);
    color: var(--color-text-primary);
  }
</style>
