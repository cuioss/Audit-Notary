<script lang="ts">
  import type { Snippet } from 'svelte';
  import KindMark, { type Kind } from './KindMark.svelte';

  /**
   * The head of a sheet: the kind, the title in the record's serif at the display size, a line on what it is, the
   * facts of the record as a list of terms, and the acts on the right. The page's one `h1`.
   */
  interface Props {
    /** The kind. */
    kind: Kind;
    /** The word of the kind. */
    kindLabel: string;
    /** The title. */
    title: string;
    /** The sentence under the title. */
    lede?: string;
    /** The state, beside the kind. */
    state?: Snippet;
    /** The facts of the record: terms and their values. */
    facts?: { term: string; value: string }[];
    /** The acts. */
    actions?: Snippet;
    /** The size of the title: `display` on its own page, `title` in a column. */
    size?: 'display' | 'title';
  }

  let {
    kind,
    kindLabel,
    title,
    lede,
    state,
    facts = [],
    actions,
    size = 'display',
  }: Props = $props();
</script>

<header class="sheet-head sheet-head--{size}">
  <div class="sheet-head__line">
    <KindMark {kind} label={kindLabel} />
    {#if state}{@render state()}{/if}
  </div>
  <div class="sheet-head__main">
    <div class="sheet-head__titles">
      <h1 class="sheet-head__title">{title}</h1>
      {#if lede}
        <p class="sheet-head__lede">{lede}</p>
      {/if}
    </div>
    {#if actions}
      <div class="sheet-head__actions">{@render actions()}</div>
    {/if}
  </div>
  {#if facts.length > 0}
    <dl class="sheet-head__facts">
      {#each facts as fact (fact.term)}
        <div class="sheet-head__fact">
          <dt>{fact.term}</dt>
          <dd>{fact.value}</dd>
        </div>
      {/each}
    </dl>
  {/if}
</header>

<style>
  .sheet-head {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-block-end: var(--space-6);
    margin-block-end: var(--space-8);
    border-block-end: 1px solid var(--color-border);
  }

  .sheet-head__line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
  }

  .sheet-head__main {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .sheet-head__titles {
    flex: 1 1 24rem;
    min-inline-size: 0;
  }

  .sheet-head__title {
    font-family: var(--font-serif);
    font-weight: var(--weight-semibold);
    letter-spacing: -0.01em;
    text-wrap: balance;
  }

  .sheet-head__title:focus {
    outline: 2px solid transparent;
  }

  .sheet-head--display .sheet-head__title {
    font-size: var(--text-display);
    line-height: var(--line-height-display);
  }

  .sheet-head--title .sheet-head__title {
    font-size: var(--text-2xl);
    line-height: var(--line-height-2xl);
  }

  .sheet-head__lede {
    margin-block-start: var(--space-2);
    max-inline-size: var(--measure);
    color: var(--color-text-secondary);
    font-size: var(--text-md);
    line-height: var(--line-height-md);
  }

  .sheet-head__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-inline-start: auto;
  }

  .sheet-head__facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-8);
  }

  .sheet-head__fact {
    display: flex;
    flex-direction: column;
  }

  .sheet-head__fact dt {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }

  .sheet-head__fact dd {
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    font-feature-settings: 'tnum' 1;
  }

  @media (max-width: 599px) {
    .sheet-head--display .sheet-head__title {
      font-size: var(--text-2xl);
      line-height: var(--line-height-2xl);
    }
  }
</style>
