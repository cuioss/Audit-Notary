<script lang="ts">
  import ColumnHead from '../../components/ColumnHead.svelte';
  import Icon from '../../components/Icon.svelte';
  import Link from '../../components/Link.svelte';
  import ReasonBadge from '../../components/ReasonBadge.svelte';
  import RowLink from '../../components/RowLink.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import type { IncidentRow, IncidentYearList } from '../../api/types';
  import { formatDate } from '../../format';
  import {
    INCIDENT_CATEGORY,
    incidentAddress,
    newAddress,
    yearAddress,
  } from '../../incidents/model';
  import { currentLocale, messagesStore, t } from '../../i18n';
  import { optionOf } from '../../forms/texts';
  import { stateTone } from '../samm/workflow';

  /**
   * The second column of the lens Incidents (UC-IR-1, UC-IR-2): the incidents of a year, newest awareness first. Each
   * row says where the report stands in words (the state, the severity), the status of each stage, and the deadlines:
   * how many are missed, which is next. A missed deadline is a box because it needs the person; everything else is
   * information.
   */
  interface Props {
    /** The year's incidents, or `null` while they are read. */
    list: IncidentYearList | null;
    /** The year of the address. */
    year: string;
    /** The selected incident. */
    selected: string | null;
    /** Whether the person may create an incident of this year: the repository exists and they may edit it. */
    canCreate?: boolean;
  }

  let { list, year, selected, canCreate = false }: Props = $props();

  /** @returns the words of a stage: its name */
  function stageName(id: string): string {
    return $t(`category.${INCIDENT_CATEGORY}.stage.${id}`);
  }

  /** @returns the line that names the severity in the words of the form, or `null` for an unanswered one */
  function severityOf(row: IncidentRow): string | null {
    return row.severity === null
      ? null
      : optionOf($messagesStore, INCIDENT_CATEGORY, 'incident.triage', ['severity'], row.severity);
  }
</script>

<ColumnHead
  kind="entry"
  kindLabel={$t('incidents.kind.year')}
  title={$t('incidents.year.title', { year })}
  href={yearAddress(year)}
/>
{#if canCreate}
  <p class="column__act">
    <Link href={newAddress(year)} look="primary" data-testid="new-incident-link">
      {$t('incidents.new.act')}
    </Link>
  </p>
{/if}
{#if list === null}
  <p class="column__loading">{$t('common.loading')}</p>
{:else if list.incidents.length === 0}
  <p class="column__empty" data-testid="year-no-incidents">
    {$t('incidents.year.empty', { year })}
  </p>
{:else}
  <ul class="column__list" data-testid="incident-list">
    {#each list.incidents as row (row.id)}
      <li>
        <RowLink
          href={row.address || incidentAddress(year, row.id)}
          selected={row.id === selected}
          testId="incident-{row.id}"
        >
          <span class="row__title">{row.title}</span>
          <span class="row__line">
            <StatusLabel
              tone={stateTone(row.state)}
              label={row.release
                ? $t('workflow.released-as', { version: `v${row.version}` })
                : $t(`workflow.${row.state}`)}
            />
            {#if severityOf(row)}
              <span class="row__meta">
                {$t('incidents.row.severity', { severity: severityOf(row) ?? '' })}
              </span>
            {/if}
          </span>
          <ul class="row__stages" aria-label={$t('incidents.row.stages')}>
            {#each row.stages as stage (stage.id)}
              <li class="stage stage--{stage.status}" data-status={stage.status}>
                <span class="stage__mark" aria-hidden="true">
                  {#if stage.status === 'completed'}
                    <Icon name="state.check" size={16} />
                  {:else if stage.status === 'open'}
                    <span class="stage__open"></span>
                  {:else}
                    <span class="stage__none"></span>
                  {/if}
                </span>
                <span class="stage__name">{stageName(stage.id)}</span>
                <span class="sr-only">{$t(`incidents.stage.status.${stage.status}`)}</span>
              </li>
            {/each}
          </ul>
          <span class="row__line">
            {#if row.deadlines.missed > 0}
              {#if row.frozen}
                <!-- A released incident: a deadline missed is a fact of the record, nothing is left to do. -->
                <StatusLabel
                  tone="danger"
                  label={$t('incidents.row.missed', { count: row.deadlines.missed })}
                />
              {:else}
                <ReasonBadge
                  tone="danger"
                  label={$t('incidents.row.missed', { count: row.deadlines.missed })}
                />
              {/if}
            {/if}
            {#if row.deadlines.open + row.deadlines.met + row.deadlines.missed === 0}
              <span class="row__meta">{$t('incidents.row.no-deadlines')}</span>
            {:else}
              <span class="row__meta">
                {$t('incidents.row.deadlines', {
                  open: row.deadlines.open,
                  met: row.deadlines.met,
                })}
              </span>
            {/if}
          </span>
          {#if row.deadlines.next}
            <span class="row__meta">
              {$t('incidents.row.next', {
                rule: $t(`category.${INCIDENT_CATEGORY}.deadline.${row.deadlines.next.rule}`),
                when: formatDate(row.deadlines.next.due, $currentLocale),
              })}
            </span>
          {/if}
          {#if row.awareAt}
            <span class="row__meta">
              {$t('incidents.row.aware', { date: formatDate(row.awareAt, $currentLocale) })}
            </span>
          {/if}
        </RowLink>
      </li>
    {/each}
  </ul>
  {#if list.truncated}
    <p class="column__note" data-testid="incident-list-truncated">
      {$t('incidents.year.truncated', { count: list.incidents.length })}
    </p>
  {/if}
{/if}

<style>
  .column__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
  }

  .column__loading,
  .column__empty {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }

  .column__note {
    padding: var(--space-4);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .column__act {
    padding: var(--space-2) var(--space-4) var(--space-3);
    font-size: var(--text-sm);
  }

  @media (max-width: 767px) {
    .column__act :global(.link) {
      display: inline-flex;
      align-items: center;
      min-block-size: 44px;
    }
  }

  .row__title {
    font-weight: var(--weight-medium);
  }

  .row__line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
  }

  .row__meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .row__stages {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    list-style: none;
    padding: var(--space-1) 0;
  }

  .stage {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-secondary);
  }

  .stage--not-applicable {
    color: var(--color-text-muted);
  }

  .stage__mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 16px;
    block-size: 16px;
    color: var(--color-success);
  }

  /* An open stage is an empty ring, one that does not apply a dash: the word beside the mark says it as well. */
  .stage__open {
    inline-size: 10px;
    block-size: 10px;
    border: 2px solid var(--color-running);
    border-radius: var(--radius-full);
  }

  .stage__none {
    inline-size: 8px;
    block-size: 2px;
    background-color: var(--color-neutral);
  }

  @media (forced-colors: active) {
    .stage__open {
      border-color: CanvasText;
    }

    .stage__none {
      background-color: CanvasText;
    }
  }
</style>
