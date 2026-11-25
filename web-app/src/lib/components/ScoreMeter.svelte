<script lang="ts">
  /**
   * A maturity score on its 0 to 3 scale, with the target as a tick: a thin bar for a row of a list or a table. The
   * figure stands beside it in text; the bar only repeats it.
   */
  interface Props {
    /** The score, 0 to 3. */
    value: number;
    /** The target, 0 to 3, if one is set. */
    target?: number | null;
    /** The text of the score, already formatted. */
    text: string;
    /** The accessible description, such as "1.5 of 3, target 2". */
    label: string;
    /** The tone of the bar: below target is `attention`. */
    tone?: 'ink' | 'attention' | 'muted';
  }

  let { value, target = null, text, label, tone = 'ink' }: Props = $props();

  const MAX = 3;
  let fill = $derived(`${(Math.max(0, Math.min(MAX, value)) / MAX) * 100}%`);
  let tick = $derived(
    target === null ? null : `${(Math.max(0, Math.min(MAX, target)) / MAX) * 100}%`,
  );
</script>

<span class="meter meter--{tone}" role="img" aria-label={label}>
  <span class="meter__track" aria-hidden="true">
    <span class="meter__fill" style:--meter-fill={fill}></span>
    {#if tick}
      <span class="meter__target" style:--meter-target={tick}></span>
    {/if}
  </span>
  <span class="meter__text" aria-hidden="true">{text}</span>
</span>

<style>
  .meter {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }

  .meter__track {
    position: relative;
    flex: 1 1 auto;
    min-inline-size: 48px;
    block-size: 6px;
    border-radius: var(--radius-full);
    background-color: var(--color-bg-sunken);
  }

  .meter__fill {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    inline-size: var(--meter-fill);
    border-radius: var(--radius-full);
    background-color: var(--color-brand);
    transition: inline-size var(--duration-base) var(--ease-standard);
  }

  .meter--attention .meter__fill {
    background-color: var(--color-attention);
  }

  .meter--muted .meter__fill {
    background-color: var(--color-neutral);
  }

  .meter__target {
    position: absolute;
    inset-block: -3px;
    inset-inline-start: var(--meter-target);
    inline-size: 2px;
    margin-inline-start: -1px;
    border-radius: 1px;
    background-color: var(--color-text-primary);
  }

  .meter__text {
    flex: 0 0 auto;
    min-inline-size: 2.5em;
    text-align: end;
    font-size: var(--text-sm);
    font-feature-settings: 'tnum' 1;
    color: var(--color-text-primary);
  }

  @media (forced-colors: active) {
    .meter__fill,
    .meter__target {
      background-color: CanvasText;
    }
  }
</style>
