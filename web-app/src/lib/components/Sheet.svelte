<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * A document as a sheet of paper on the desk: the record on the left, the register margin on the right
   * (doc/concepts/visual-design.adoc, The Sheet and Its Margin). The margin holds what the record does not: the save
   * state, the signed history, who works on it, the version.
   *
   * The sheet measures its own width, never the viewport: in a column it is as narrow as the column. From
   * {@link WIDE} pixels the margin stands beside the record, divided by the double rule of a ledger's margin, with the
   * `status` at its top. Below, the `status` stands as a band above the record — the save state and its act must
   * never scroll out of reach — and the rest of the margin follows the record. Each part is rendered once, in one
   * place: only the grid moves it, so a focused act in the status keeps its focus when the width changes.
   */
  interface Props {
    /** The record: the document's head and its sections. */
    children: Snippet;
    /** The register margin. */
    margin?: Snippet;
    /** What must stay in reach: the save state and its act. First in the margin, or a band above the record. */
    status?: Snippet;
    /** The accessible name of the margin. */
    marginLabel?: string;
    /** A test id. */
    testId?: string;
  }

  let { children, margin, status, marginLabel, testId }: Props = $props();

  /** The width from which the margin stands beside the record. */
  const WIDE = 760;

  let width = $state(0);
  let wide = $derived(width >= WIDE);
</script>

<div class="sheet-frame" bind:clientWidth={width} data-testid={testId}>
  <div
    class="sheet"
    class:sheet--wide={wide && (!!margin || !!status)}
    class:sheet--status={!!status}
    class:sheet--narrow={width > 0 && width < 600}
  >
    {#if status}
      <div class="sheet__status">{@render status()}</div>
    {/if}
    <div class="sheet__record">{@render children()}</div>
    {#if margin}
      <aside class="sheet__margin" aria-label={marginLabel}>{@render margin()}</aside>
    {/if}
  </div>
</div>

<style>
  .sheet-frame {
    inline-size: 100%;
  }

  /* Narrow: status band, record, margin, one below the other in source order. */
  .sheet {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'status' 'record' 'margin';
    background-color: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sheet);
    box-shadow: var(--shadow-sheet);
  }

  .sheet__record {
    grid-area: record;
    min-inline-size: 0;
    padding: var(--space-8) var(--space-10) var(--space-12);
  }

  .sheet--narrow .sheet__record {
    padding: var(--space-5) var(--space-4) var(--space-8);
  }

  .sheet__status {
    grid-area: status;
    position: sticky;
    inset-block-start: 56px;
    z-index: var(--layer-sticky);
    padding: var(--space-3) var(--space-5);
    background-color: var(--color-bg-subtle);
    border-block-end: 1px solid var(--color-border);
    border-start-start-radius: var(--radius-sheet);
    border-start-end-radius: var(--radius-sheet);
  }

  .sheet__margin {
    grid-area: margin;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6) var(--space-5) var(--space-8);
    background-color: var(--color-bg-subtle);
    border-block-start: 3px double var(--color-border-strong);
    border-end-start-radius: var(--radius-sheet);
    border-end-end-radius: var(--radius-sheet);
  }

  /* Wide: the margin column beside the record, the status at its top, divided by a ledger's double rule. */
  .sheet--wide {
    grid-template-columns: minmax(0, 1fr) 16rem;
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: 'record margin';
  }

  .sheet--wide.sheet--status {
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'record status' 'record margin';
  }

  .sheet--wide .sheet__status,
  .sheet--wide .sheet__margin {
    position: static;
    border: none;
    border-radius: 0;
    box-shadow:
      inset 1px 0 0 var(--color-border-strong),
      inset 4px 0 0 var(--color-bg-subtle),
      inset 5px 0 0 var(--color-border-strong);
  }

  .sheet--wide .sheet__status {
    padding: var(--space-8) var(--space-6) var(--space-6);
    border-start-end-radius: var(--radius-sheet);
  }

  .sheet--wide .sheet__margin {
    display: block;
    padding: var(--space-8) var(--space-6);
    border-end-end-radius: var(--radius-sheet);
  }

  .sheet--wide.sheet--status .sheet__margin {
    padding-block-start: var(--space-2);
  }

  .sheet--wide:not(.sheet--status) .sheet__margin {
    border-start-end-radius: var(--radius-sheet);
  }
</style>
