<script lang="ts">
  import ColumnHead from '../../components/ColumnHead.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Notice from '../../components/Notice.svelte';
  import ReasonBadge from '../../components/ReasonBadge.svelte';
  import RowLink from '../../components/RowLink.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import type { IncidentYears } from '../../api/types';
  import { formatDate } from '../../format';
  import { INCIDENTS_ADDRESS, yearAddress } from '../../incidents/model';
  import { currentLocale, t } from '../../i18n';

  /**
   * The first column of the lens Incidents (UC-IR-1, UC-IR-2): the years the person may read, newest first, each with
   * the incidents it holds, how many are not released yet, how many have a deadline that was missed, and how long the
   * repository is kept. A year with no repository for the year of today is told, since a new incident needs it.
   */
  interface Props {
    /** The years, or `null` while they are read. */
    years: IncidentYears | null;
    /** The selected year. */
    selected: string | null;
  }

  let { years, selected }: Props = $props();

  /** The year of today, when the server says it; the repository of that year is the one a new incident needs. */
  let todayYear = $derived(years?.today ? years.today.slice(0, 4) : null);
  let missingCurrent = $derived(
    years !== null && years.years.length > 0 && !years.years.some((year) => year.current),
  );
</script>

<ColumnHead
  kind="incident"
  kindLabel={$t('lens.incidents')}
  title={$t('incidents.years.title')}
  href={INCIDENTS_ADDRESS}
/>
<div class="column" data-testid="years-column">
  {#if years === null}
    <p class="column__loading">{$t('common.loading')}</p>
  {:else if years.years.length === 0}
    <div data-testid="years-none">
      <EmptyState title={$t('incidents.years.none.title')} body={$t('incidents.years.none.body')} />
    </div>
  {:else}
    {#if missingCurrent}
      <div class="column__notice" data-testid="year-missing">
        <Notice
          tone="attention"
          title={$t('incidents.years.missing.title', { year: todayYear ?? '' })}
          body={$t('incidents.years.missing.body')}
        />
      </div>
    {/if}
    <ul class="column__list" data-testid="year-list">
      {#each years.years as year (year.year)}
        <li>
          <RowLink
            href={year.address || yearAddress(year.year)}
            selected={String(year.year) === selected}
            testId="year-{year.year}"
          >
            <span class="row__title">{year.year}</span>
            <span class="row__line">
              {#if year.current}
                <StatusLabel tone="running" label={$t('incidents.year.current')} />
              {/if}
              {#if year.withMissedDeadline > 0}
                {#if year.open > 0}
                  <ReasonBadge
                    tone="danger"
                    label={$t('incidents.year.missed', { count: year.withMissedDeadline })}
                  />
                {:else}
                  <!-- Every incident of the year is released: a deadline missed is a fact of the record, nothing to do. -->
                  <StatusLabel
                    tone="danger"
                    label={$t('incidents.year.missed', { count: year.withMissedDeadline })}
                  />
                {/if}
              {/if}
            </span>
            <span class="row__meta">
              {$t('incidents.year.counts', { count: year.incidents, open: year.open })}
            </span>
            <span class="row__meta">
              {$t('incidents.year.retention', {
                date: formatDate(year.retentionEnd, $currentLocale),
              })}
            </span>
          </RowLink>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .column__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
  }

  .column__loading {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }

  .column__notice {
    padding: 0 var(--space-4) var(--space-3);
  }

  .row__title {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .row__line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
  }

  .row__meta {
    display: block;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
</style>
