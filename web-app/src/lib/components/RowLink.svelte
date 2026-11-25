<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * A row of a list column that is one link as a whole: the object it opens. The selected row says so with
   * `aria-current` and the ink edge, never with colour alone.
   */
  interface Props {
    /** The address the row opens. */
    href: string;
    /** Whether the row is the selected object of the column. */
    selected?: boolean;
    /** The accessible name, where the row's content is not a good one. */
    label?: string;
    /** A test id. */
    testId?: string;
    /** The row's content. */
    children: Snippet;
  }

  let { href, selected = false, label, testId, children }: Props = $props();
</script>

<a
  class="row"
  class:row--selected={selected}
  {href}
  aria-current={selected ? 'page' : undefined}
  aria-label={label}
  data-testid={testId}
>
  {@render children()}
</a>

<style>
  .row {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-3) var(--space-4);
    min-block-size: 44px;
    color: var(--color-text-primary);
    text-decoration: none;
    border-radius: var(--radius-sm);
    transition: background-color var(--duration-fast) var(--ease-standard);
  }

  .row:hover {
    color: var(--color-text-primary);
    background-color: var(--color-bg-sunken);
  }

  .row--selected,
  .row--selected:hover {
    background-color: var(--color-bg-surface);
    box-shadow:
      inset 3px 0 0 var(--color-brand),
      var(--shadow-1);
  }

  .row:focus-visible {
    box-shadow: var(--focus-ring);
  }
</style>
