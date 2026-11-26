<script lang="ts">
  import EmptyState from '../../components/EmptyState.svelte';
  import GridTable from '../../components/GridTable.svelte';
  import Link from '../../components/Link.svelte';
  import ReasonBadge from '../../components/ReasonBadge.svelte';
  import Select from '../../components/Select.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import type { ThreatEvaluation } from '../../api/types';
  import { formatDate } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import {
    intervalMonths,
    sortModels,
    statusTone,
    THREAT_SORTS,
    type ThreatSort,
  } from '../../reports/reports';

  /**
   * The threat models of the services, evaluated (UC-TM-4): one row for each model with its protection need, its last
   * review, the date the next one is due and its open, untreated and transferred threats, and under it the services that
   * have no model. A review that is overdue or due within 30 days is a box with its words, because it needs the person; one
   * in date and one never released are a dot. The report `/reports/threat-evaluation` and the lens Threat models draw this
   * component from the same answer, so both say the same.
   */
  interface Props {
    /** The answer of `GET /api/v1/reports/threat-evaluation`. */
    evaluation: ThreatEvaluation;
    /** Whether the order of the rows can be changed; the order of the server stays the first one. */
    sortable?: boolean;
    /** A test id prefix. */
    testId?: string;
  }

  let { evaluation, sortable = true, testId = 'threat-evaluation' }: Props = $props();

  let picked = $state('');
  let sort = $derived(
    (THREAT_SORTS as readonly string[]).includes(picked) ? (picked as ThreatSort) : 'due',
  );
  let rows = $derived(sortModels(evaluation.models, sort, $currentLocale));
  let overdue = $derived(evaluation.models.filter((model) => model.status === 'overdue').length);
  let open = $derived(evaluation.models.reduce((sum, model) => sum + model.threats.open, 0));
  let untreated = $derived(
    evaluation.models.reduce((sum, model) => sum + model.threats.untreated, 0),
  );
  let services = $derived(evaluation.models.length + evaluation.withoutModel.length > 0);
</script>

<div class="evaluation" data-testid={testId}>
  <section class="part" aria-labelledby="{testId}-models">
    <h2 class="part__title sr-only" id="{testId}-models">{$t('reports.threat.table')}</h2>
    {#if evaluation.models.length === 0}
      {#if !services}
        <EmptyState
          icon="state.na"
          title={$t('reports.threat.no-services.title')}
          body={$t('reports.threat.no-services.body')}
        />
      {:else}
        <p class="note" data-testid="{testId}-none">{$t('reports.threat.models.empty')}</p>
      {/if}
    {:else}
      <p class="summary" data-testid="{testId}-summary">
        {$t('reports.threat.summary', {
          models: evaluation.models.length,
          open,
          untreated,
          overdue,
        })}
      </p>
      {#if sortable}
        <div class="sort">
          <Select
            label={$t('reports.threat.sort')}
            options={THREAT_SORTS.filter((value) => value !== 'due').map((value) => ({
              value,
              label: $t(`reports.threat.sort.${value}`),
            }))}
            bind:value={picked}
            placeholder={$t('reports.threat.sort.due')}
            testId="{testId}-sort"
          />
        </div>
      {/if}
      <GridTable
        caption={$t('reports.threat.table')}
        heads={[
          $t('reports.threat.col.service'),
          $t('reports.threat.col.need'),
          $t('reports.threat.col.last'),
          $t('reports.threat.col.due'),
          $t('reports.threat.col.open'),
          $t('reports.threat.col.untreated'),
          $t('reports.threat.col.transferred'),
        ]}
        testId="{testId}-table"
      >
        {#each rows as model (`${model.service.id}/${model.model}`)}
          {@const months = intervalMonths(model.reviewInterval)}
          <tr data-testid="threat-row-{model.service.id}-{model.model}">
            <th scope="row">
              <Link href={model.address}>{model.service.name}</Link>
              <span class="meta">{$t('reports.threat.model', { model: model.model })}</span>
              <span class="meta">
                {model.version === null
                  ? $t(`workflow.${model.state}`)
                  : $t('reports.threat.release', { version: model.version })}
              </span>
            </th>
            <td data-label={$t('reports.threat.col.need')}>
              {$t(`reports.need.${model.protectionNeed}`)}
            </td>
            <td data-label={$t('reports.threat.col.last')}>
              {#if model.lastReview}
                {formatDate(model.lastReview, $currentLocale)}
                <span class="meta">
                  {$t('reports.threat.days-ago', { count: model.daysSinceReview ?? 0 })}
                </span>
              {:else}
                {$t('reports.threat.no-review')}
              {/if}
            </td>
            <td data-label={$t('reports.threat.col.due')}>
              {#if model.status === 'overdue'}
                <ReasonBadge
                  tone="danger"
                  label={$t('reports.due.overdue', { count: -(model.dueInDays ?? 0) })}
                  testId="threat-status-{model.service.id}-{model.model}"
                />
              {:else if model.status === 'due-soon'}
                <ReasonBadge
                  tone="attention"
                  label={$t('reports.due.soon', { count: model.dueInDays ?? 0 })}
                  testId="threat-status-{model.service.id}-{model.model}"
                />
              {:else}
                <StatusLabel
                  tone={statusTone(model.status)}
                  label={$t(`reports.threat.status.${model.status}`)}
                  testId="threat-status-{model.service.id}-{model.model}"
                />
              {/if}
              {#if model.reviewDue}
                <span class="meta">{formatDate(model.reviewDue, $currentLocale)}</span>
              {/if}
              {#if months !== null}
                <span class="meta">{$t('reports.threat.interval', { months })}</span>
              {/if}
            </td>
            <td data-label={$t('reports.threat.col.open')}
              ><span class="count">{model.threats.open}</span></td
            >
            <td data-label={$t('reports.threat.col.untreated')}>
              <span class="count">{model.threats.untreated}</span>
            </td>
            <td data-label={$t('reports.threat.col.transferred')}>
              <span class="count">{model.threats.transferred}</span>
            </td>
          </tr>
        {/each}
      </GridTable>
    {/if}
  </section>

  <section class="part" aria-labelledby="{testId}-without" data-testid="{testId}-without">
    <h2 class="part__title" id="{testId}-without">{$t('reports.threat.without.title')}</h2>
    {#if evaluation.withoutModel.length === 0}
      <p class="note">{$t('reports.threat.without.empty')}</p>
    {:else}
      <GridTable
        caption={$t('reports.threat.without.table')}
        heads={[
          $t('reports.threat.without.col.service'),
          $t('reports.threat.without.col.owner'),
          $t('reports.threat.without.col.need'),
          $t('reports.threat.without.col.state'),
        ]}
        testId="{testId}-without-table"
      >
        {#each evaluation.withoutModel as entry (entry.service.id)}
          <tr data-testid="threat-without-{entry.service.id}">
            <th scope="row"><Link href={entry.address}>{entry.service.name}</Link></th>
            <td data-label={$t('reports.threat.without.col.owner')}>{entry.owner.name}</td>
            <td data-label={$t('reports.threat.without.col.need')}>
              {$t(`reports.need.${entry.protectionNeed}`)}
            </td>
            <td data-label={$t('reports.threat.without.col.state')}>
              <StatusLabel tone="neutral" label={$t(`reports.lifecycle.${entry.lifecycle}`)} />
            </td>
          </tr>
        {/each}
      </GridTable>
    {/if}
  </section>
</div>

<style>
  .evaluation {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .part__title {
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
    font-weight: var(--weight-semibold);
  }

  .summary {
    color: var(--color-text-primary);
    font-weight: var(--weight-medium);
  }

  .note {
    max-inline-size: var(--measure);
    color: var(--color-text-secondary);
  }

  .sort {
    max-inline-size: 18rem;
  }

  .meta {
    display: block;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--weight-regular);
    color: var(--color-text-muted);
  }

  .count {
    font-family: var(--font-serif);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    font-feature-settings: 'lnum' 1;
  }

  .evaluation :global(tbody th) {
    font-family: var(--font-serif);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
</style>
