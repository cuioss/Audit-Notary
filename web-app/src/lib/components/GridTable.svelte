<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * A table of facts read row by row: the import's result, the persons of the directory. The first cell of a row is its
   * row head (`<th scope="row">`), each further cell carries `data-label`, the word of its column, which names it on a
   * narrow column where a row stands as a block of labelled lines and nothing scrolls sideways. A link of a stacked row
   * is a touch target of 44 px (its padding, not a box).
   */
  interface Props {
    /** The name of the table for a screen reader; not drawn. */
    caption: string;
    /** The heads of the columns, in order. */
    heads: string[];
    /** The rows, as `<tr>` with their cells. */
    children: Snippet;
    /** A test id. */
    testId?: string;
  }

  let { caption, heads, children, testId }: Props = $props();
</script>

<div class="grid-frame">
  <table class="grid" data-testid={testId}>
    <caption class="sr-only">{caption}</caption>
    <thead class="grid__head">
      <tr>
        {#each heads as head, position (position)}
          <th scope="col">{head}</th>
        {/each}
      </tr>
    </thead>
    <tbody>{@render children()}</tbody>
  </table>
</div>

<style>
  .grid-frame {
    container-type: inline-size;
  }

  .grid {
    inline-size: 100%;
    border-collapse: collapse;
  }

  .grid :global(th),
  .grid :global(td) {
    padding: var(--space-2) var(--space-3) var(--space-2) 0;
    text-align: start;
    vertical-align: middle;
    border-block-end: 1px solid var(--color-border);
    font-weight: var(--weight-regular);
    overflow-wrap: break-word;
  }

  .grid :global(thead th) {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
  }

  .grid :global(tbody th) {
    font-weight: var(--weight-medium);
  }

  @container (max-width: 40rem) {
    .grid,
    .grid :global(tbody),
    .grid :global(tr),
    .grid :global(th),
    .grid :global(td) {
      display: block;
    }

    .grid__head {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    .grid :global(tr) {
      padding-block: var(--space-2);
      border-block-end: 1px solid var(--color-border);
    }

    .grid :global(th),
    .grid :global(td) {
      border-block-end: none;
      padding-block: var(--space-1);
    }

    .grid :global(td) {
      display: grid;
      grid-template-columns: minmax(5rem, 9rem) minmax(0, 1fr);
      gap: var(--space-2);
      align-items: baseline;
    }

    .grid :global(a) {
      display: inline-block;
      padding-block: var(--space-3);
    }

    /* A control in a stacked cell keeps its own width instead of filling the column. */
    .grid :global(td > *) {
      justify-self: start;
    }

    .grid :global(td[data-label])::before {
      content: attr(data-label);
      font-size: var(--text-xs);
      color: var(--color-text-muted);
    }
  }
</style>
