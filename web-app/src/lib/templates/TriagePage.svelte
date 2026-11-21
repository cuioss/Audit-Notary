<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * The column template of the lenses with a chain of levels (SAMM: scope › assessment › practice):
   * one column per level, the selected object on the right (doc/concepts/web-app.adoc, Structure of the
   * App). The bootstrap renders the columns the view hands it; the column engine with its widths and gap
   * strip follows with the first lens.
   */
  interface Props {
    /** The visible title, the page's `h1`. */
    title: string;
    /** A test id of the page. */
    testId?: string;
    /** The columns, left to right. */
    columns: Snippet;
  }

  let { title, testId, columns }: Props = $props();
</script>

<div class="triage" data-testid={testId}>
  <h1 class="sr-only">{title}</h1>
  <div class="triage__columns">{@render columns()}</div>
</div>

<style>
  .triage {
    flex: 1 1 auto;
    display: flex;
    min-inline-size: 0;
  }

  .triage__columns {
    display: flex;
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow-x: auto;
  }

  .triage__columns > :global(*) {
    flex: 0 0 auto;
    min-inline-size: 280px;
    border-inline-end: 1px solid var(--color-border);
  }

  .triage__columns > :global(*:last-child) {
    flex: 1 1 auto;
    border-inline-end: none;
  }
</style>
