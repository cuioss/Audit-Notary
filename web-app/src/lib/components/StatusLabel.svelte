<script lang="ts" module>
  /** The tones of a state word; one meaning per colour (doc/concepts/visual-design.adoc, Tags). */
  export type StatusTone = 'neutral' | 'running' | 'attention' | 'danger' | 'success' | 'sealed';
</script>

<script lang="ts">
  /**
   * A state for information: a dot and its word, never a box (a box means "needs you", {@link ReasonBadge}). The
   * word always carries the state; the dot only repeats it. `sealed` is the state of a released document: its mark
   * is a small seal, the only place the seal gold appears outside a seal.
   */
  interface Props {
    /** The tone. */
    tone?: StatusTone;
    /** The word of the state. */
    label: string;
    /** A test id. */
    testId?: string;
    /** The word is a sentence: it wraps beside the dot instead of staying on one line. */
    wrap?: boolean;
  }

  let { tone = 'neutral', label, testId, wrap = false }: Props = $props();
</script>

<span class="status status--{tone}" class:status--wrap={wrap} data-testid={testId} data-tone={tone}>
  <span class="status__dot" aria-hidden="true"></span>
  <span class="status__word">{label}</span>
</span>

<style>
  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    line-height: var(--line-height-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .status--wrap {
    white-space: normal;
    align-items: flex-start;
  }

  .status--wrap .status__dot {
    margin-block-start: 0.5em;
  }

  .status__dot {
    inline-size: 8px;
    block-size: 8px;
    flex: 0 0 auto;
    border-radius: var(--radius-full);
    background-color: var(--color-neutral);
  }

  .status--running .status__dot {
    background-color: var(--color-running);
  }

  .status--attention .status__dot {
    background-color: var(--color-attention);
  }

  .status--danger .status__dot {
    background-color: var(--color-danger);
  }

  .status--success .status__dot {
    background-color: var(--color-success);
  }

  .status--sealed .status__dot {
    inline-size: 10px;
    block-size: 10px;
    background-color: var(--color-seal);
    box-shadow: 0 0 0 1px var(--color-seal-rim);
  }

  .status--sealed .status__word {
    color: var(--color-text-primary);
    font-weight: var(--weight-medium);
  }

  @media (forced-colors: active) {
    .status__dot {
      background-color: CanvasText;
    }
  }
</style>
