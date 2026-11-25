<script lang="ts" module>
  /** One line of the history, already worded. */
  export interface HistoryEntry {
    /** A stable key. */
    key: string;
    /** Who, as the directory names them. */
    who: string;
    /** What, one short sentence. */
    what: string;
    /** When, formatted. */
    when: string;
    /** The machine-readable time. */
    datetime: string;
    /** Whether it is a release: the line wears the seal. */
    release?: boolean;
  }
</script>

<script lang="ts">
  /**
   * The signed history of a document in its margin: every save is a signed commit, so every line names who did what
   * and when. A release line wears the seal.
   */
  interface Props {
    /** The lines, newest first. */
    entries: HistoryEntry[];
    /** The accessible name of the list. */
    label: string;
    /** A test id. */
    testId?: string;
  }

  let { entries, label, testId }: Props = $props();
</script>

<ol class="history" aria-label={label} data-testid={testId}>
  {#each entries as entry (entry.key)}
    <li class="history__line" class:history__line--release={entry.release}>
      <span class="history__mark" aria-hidden="true"></span>
      <span class="history__text">
        <span class="history__who">{entry.who}</span>
        <span class="history__what">{entry.what}</span>
        <time class="history__when" datetime={entry.datetime}>{entry.when}</time>
      </span>
    </li>
  {/each}
</ol>

<style>
  .history {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    list-style: none;
  }

  .history::before {
    content: '';
    position: absolute;
    inset-block: 6px;
    inset-inline-start: 4px;
    inline-size: 1px;
    background-color: var(--color-border-strong);
  }

  .history__line {
    position: relative;
    display: flex;
    gap: var(--space-3);
  }

  .history__mark {
    position: relative;
    flex: 0 0 auto;
    inline-size: 9px;
    block-size: 9px;
    margin-block-start: 5px;
    border-radius: var(--radius-full);
    background-color: var(--color-bg-subtle);
    border: 1.5px solid var(--color-text-muted);
  }

  .history__line--release .history__mark {
    background-color: var(--color-seal);
    border-color: var(--color-seal-rim);
  }

  .history__text {
    display: flex;
    flex-direction: column;
    font-size: var(--text-sm);
    line-height: var(--line-height-sm);
  }

  .history__who {
    font-weight: var(--weight-medium);
    color: var(--color-text-primary);
  }

  .history__what {
    color: var(--color-text-secondary);
  }

  .history__when {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }
</style>
