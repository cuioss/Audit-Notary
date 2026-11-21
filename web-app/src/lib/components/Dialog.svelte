<script lang="ts">
  import type { Snippet } from 'svelte';
  import IconButton from './IconButton.svelte';

  /**
   * A modal dialog on the native `<dialog>` element: focus is trapped and Escape closes it.
   */
  interface Props {
    /** Whether the dialog is open, bindable. */
    open?: boolean;
    /** The accessible name and visible title. */
    title: string;
    /** The label of the close button. */
    closeLabel: string;
    /** Called after the dialog closed. */
    onclose?: () => void;
    /** The content. */
    children: Snippet;
  }

  let { open = $bindable(false), title, closeLabel, onclose, children }: Props = $props();

  let element: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!element) return;
    if (open && !element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.setAttribute('open', '');
    } else if (!open && element.open) {
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
    }
  });

  function handleClose() {
    open = false;
    onclose?.();
  }
</script>

<dialog bind:this={element} class="dialog" aria-label={title} onclose={handleClose}>
  <header class="dialog__header">
    <h2 class="dialog__title">{title}</h2>
    <IconButton icon="act.close" label={closeLabel} onclick={handleClose} />
  </header>
  <div class="dialog__body">{@render children()}</div>
</dialog>

<style>
  .dialog {
    margin: 10vh auto auto;
    inline-size: min(36rem, calc(100vw - 2 * var(--space-4)));
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background-color: var(--color-bg-raised);
    color: var(--color-text-primary);
    box-shadow: var(--shadow-overlay);
  }

  .dialog::backdrop {
    background-color: var(--color-overlay);
  }

  .dialog__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-block-end: 1px solid var(--color-border);
  }

  .dialog__title {
    font-size: var(--text-md);
  }

  .dialog__body {
    padding: var(--space-4);
  }
</style>
