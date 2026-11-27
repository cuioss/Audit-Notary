<script lang="ts" module>
  /** One deadline of the clock, worded. */
  export interface ClockRow {
    /** A stable key of the row. */
    key: string;
    /** The name of the deadline. */
    name: string;
    /** The legal basis, under the name. */
    basis: string;
    /** `OPEN`, `MET` or `MISSED`. */
    status: 'OPEN' | 'MET' | 'MISSED';
    /** The word of the status. */
    statusLabel: string;
    /** Whether the deadline needs the person: missed and never sent, or open and past its time. */
    needsYou: boolean;
    /** The due time, ISO 8601; `null` while the clock has not started. */
    due: string | null;
    /** The due time as the person reads it; `null` when there is none. */
    dueText: string | null;
    /** The sentence about the time: how long is left, how long overdue, when it was sent. */
    detail: string;
  }
</script>

<script lang="ts">
  import ReasonBadge from './ReasonBadge.svelte';
  import StatusLabel from './StatusLabel.svelte';

  /**
   * The notification deadlines of an incident (doc/concepts/category-incident-reports.adoc, The Deadline Clock): for
   * each one its name and legal basis, the due time, and where it stands: open with the time left, met, or missed. A
   * missed deadline stays visible whether the notice was sent late or never. The clock is sober by design: no mascot, no
   * gold, no animation; the colour of a state never speaks alone, every row says its state in a word.
   *
   * A deadline that needs the person (missed and never sent) is a box (`ReasonBadge`); every other state is information
   * and stands as a dot with its word. The component holds nothing: the caller computes the rows from the read.
   */
  interface Props {
    /** The accessible name of the list. */
    label: string;
    /** The deadlines, in the order of the rules. */
    rows: ClockRow[];
    /** A test id; the rows are `<testId>-<key>` with the `/` of an element read as `-`. */
    testId?: string;
  }

  let { label, rows, testId }: Props = $props();

  const TONES = { OPEN: 'running', MET: 'success', MISSED: 'danger' } as const;
</script>

<ul class="clock" aria-label={label} data-testid={testId}>
  {#each rows as row (row.key)}
    <li
      class="clock__row"
      data-status={row.status}
      data-testid={testId ? `${testId}-${row.key.replaceAll('/', '-')}` : undefined}
    >
      <div class="clock__what">
        <span class="clock__name">{row.name}</span>
        <span class="clock__basis">{row.basis}</span>
      </div>
      <div class="clock__state">
        {#if row.needsYou}
          <ReasonBadge tone="danger" label={row.statusLabel} />
        {:else}
          <StatusLabel tone={TONES[row.status]} label={row.statusLabel} />
        {/if}
      </div>
      <p class="clock__when">
        {#if row.due && row.dueText}
          <span class="clock__due"><time datetime={row.due}>{row.dueText}</time></span>
        {/if}
        <span class="clock__detail">{row.detail}</span>
      </p>
    </li>
  {/each}
</ul>

<style>
  .clock {
    display: flex;
    flex-direction: column;
    list-style: none;
    border-block-start: 1px solid var(--color-border);
  }

  .clock__row {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(8rem, 1fr) minmax(0, 3fr);
    align-items: baseline;
    gap: var(--space-1) var(--space-4);
    padding-block: var(--space-3);
    border-block-end: 1px solid var(--color-border);
  }

  .clock__what {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .clock__name {
    font-weight: var(--weight-medium);
  }

  .clock__basis {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }

  .clock__state {
    display: flex;
    align-items: baseline;
  }

  .clock__when {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-sm);
    line-height: var(--line-height-sm);
    color: var(--color-text-secondary);
  }

  /* The due time is a figure of the record: the serif, with tabular numerals. */
  .clock__due {
    font-family: var(--font-serif);
    font-variant-numeric: tabular-nums;
    color: var(--color-text-primary);
  }

  .clock__row[data-status='MISSED'] .clock__due {
    font-weight: var(--weight-semibold);
  }

  @media (max-width: 767px) {
    .clock__row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
