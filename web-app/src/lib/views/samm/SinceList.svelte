<script lang="ts">
  import type { SammComparison, SammModel } from '../../api/types';
  import { currentLocale, t } from '../../i18n';
  import { formatDelta, formatScore } from '../../samm/scores';

  /**
   * The change of each business function between two released assessments (AUN-SAMM-5) as a dumbbell on the 0 to 3
   * scale: the earlier score as a hollow mark, the later as a full one, the span between them in the colour of the
   * direction. The figures and the signed difference stand beside it in text, so the colour never speaks alone.
   */
  interface Props {
    comparison: SammComparison;
    model: SammModel;
  }

  let { comparison, model }: Props = $props();
</script>

<ul class="since" data-testid="since-list">
  {#each comparison.functions as change, index (change.id)}
    <li class="since__row">
      <span class="since__name">
        <span class="since__swatch since__swatch--{index}" aria-hidden="true"></span>
        {model.functions[index]?.name ?? change.id}
      </span>
      <span class="since__bar" aria-hidden="true">
        <span
          class="since__span"
          class:since__span--down={change.delta < 0}
          style:--from={`${(Math.min(change.from, change.to) / 3) * 100}%`}
          style:--to={`${(Math.max(change.from, change.to) / 3) * 100}%`}
        ></span>
        <span class="since__dot since__dot--from" style:--at={`${(change.from / 3) * 100}%`}></span>
        <span class="since__dot since__dot--to" style:--at={`${(change.to / 3) * 100}%`}></span>
      </span>
      <span class="since__figures">
        {$t('samm.since.row', {
          from: formatScore(change.from, $currentLocale),
          to: formatScore(change.to, $currentLocale),
        })}
        <strong class="since__delta" class:since__delta--down={change.delta < 0}>
          {formatDelta(change.delta, $currentLocale)}
        </strong>
      </span>
    </li>
  {/each}
</ul>

<style>
  .since {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    list-style: none;
  }

  .since__row {
    display: grid;
    grid-template-columns: minmax(8rem, 12rem) minmax(8rem, 1fr) auto;
    align-items: center;
    gap: var(--space-4);
  }

  .since__name {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: var(--weight-medium);
  }

  .since__swatch {
    inline-size: 10px;
    block-size: 10px;
    border-radius: 3px;
  }

  .since__swatch--0 {
    background-color: var(--color-series-1);
  }

  .since__swatch--1 {
    background-color: var(--color-series-2);
  }

  .since__swatch--2 {
    background-color: var(--color-series-3);
  }

  .since__swatch--3 {
    background-color: var(--color-series-4);
  }

  .since__swatch--4 {
    background-color: var(--color-series-5);
  }

  .since__bar {
    position: relative;
    block-size: 12px;
    border-inline: 1px solid var(--color-chart-axis);
    background-image:
      linear-gradient(var(--color-chart-axis), var(--color-chart-axis)),
      linear-gradient(
        to right,
        transparent calc(33.333% - 0.5px),
        var(--color-chart-grid) calc(33.333% - 0.5px) calc(33.333% + 0.5px),
        transparent calc(33.333% + 0.5px) calc(66.666% - 0.5px),
        var(--color-chart-grid) calc(66.666% - 0.5px) calc(66.666% + 0.5px),
        transparent calc(66.666% + 0.5px)
      );
    background-size:
      100% 1px,
      100% 100%;
    background-position:
      0 50%,
      0 0;
    background-repeat: no-repeat;
  }

  .since__span {
    position: absolute;
    inset-block: 5px;
    inset-inline-start: var(--from);
    inline-size: calc(var(--to) - var(--from));
    background-color: var(--color-success);
    border-radius: 1px;
  }

  .since__span--down {
    background-color: var(--color-danger);
  }

  .since__dot {
    position: absolute;
    inset-block-start: 1px;
    inset-inline-start: var(--at);
    inline-size: 10px;
    block-size: 10px;
    margin-inline-start: -5px;
    border-radius: var(--radius-full);
  }

  .since__dot--from {
    background-color: var(--color-bg-surface);
    border: 2px solid var(--color-text-muted);
  }

  .since__dot--to {
    background-color: var(--color-text-primary);
    border: 2px solid var(--color-bg-surface);
  }

  .since__figures {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    font-feature-settings: 'tnum' 1;
    white-space: nowrap;
  }

  .since__delta {
    margin-inline-start: var(--space-2);
    color: var(--color-success);
  }

  .since__delta--down {
    color: var(--color-danger);
  }

  @media (max-width: 767px) {
    .since__row {
      grid-template-columns: 1fr;
      gap: var(--space-1);
    }
  }

  @media (forced-colors: active) {
    .since__span,
    .since__dot--to {
      background-color: CanvasText;
    }
  }
</style>
