<script lang="ts">
  import ColumnHead from '../../components/ColumnHead.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import ReasonBadge from '../../components/ReasonBadge.svelte';
  import RowLink from '../../components/RowLink.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import type { ThreatModelService } from '../../api/types';
  import { formatDate } from '../../format';
  import { currentLocale, humanizeKey, t } from '../../i18n';
  import { intervalMonths, linkTarget, statusTone } from '../../reports/reports';
  import { modelAddress, newAddress, serviceAddress } from '../../threats/model';
  import { stateTone } from '../samm/workflow';

  /**
   * A service of the lens Threat models (UC-TM-1, UC-TM-2): its threat models with the state of each and its review, the
   * review interval its protection needs give, the recipes the person has started and the way to a new model. A service
   * that is retired keeps its models readable and gets no new one.
   */
  interface Props {
    /** The service page, or `null` while it is read. */
    service: ThreatModelService | null;
    /** The selected model. */
    selected: string | null;
    /** Whether the person may create a model. */
    canCreate?: boolean;
  }

  let { service, selected, canCreate = false }: Props = $props();

  let months = $derived(service ? intervalMonths(service.service.reviewInterval) : null);
</script>

{#if service === null}
  <p class="column__loading">{$t('common.loading')}</p>
{:else}
  <ColumnHead
    kind="entry"
    kindLabel={$t('threats.kind.service')}
    title={service.service.name}
    href={serviceAddress(service.service.id)}
  >
    {#snippet meta()}
      <span class="meta-line">
        {$t('threats.review.need', { need: $t(`reports.need.${service.service.protectionNeed}`) })}
      </span>
      {#if months !== null}
        <span class="meta-line">{$t('reports.threat.interval', { months })}</span>
      {/if}
    {/snippet}
  </ColumnHead>
  {#if service.service.retired}
    <div class="column__notice" data-testid="service-retired">
      <Notice
        tone="info"
        title={$t('threats.service.retired.title')}
        body={$t('threats.service.retired.body')}
      />
    </div>
  {/if}
  {#if service.models.length === 0}
    <p class="column__empty" data-testid="service-no-models">{$t('threats.service.no-models')}</p>
  {:else}
    <ul class="column__list" data-testid="model-list">
      {#each service.models as entry (entry.model)}
        <li>
          <RowLink
            href={linkTarget(entry.address) ?? modelAddress(service.service.id, entry.model)}
            selected={entry.model === selected}
            testId="model-{entry.model}"
          >
            <span class="row__title">{entry.title}</span>
            <span class="row__line">
              <StatusLabel
                tone={stateTone(entry.state)}
                label={entry.version === null
                  ? $t(`workflow.${entry.state}`)
                  : $t('workflow.released-as', { version: `v${entry.version}` })}
              />
              {#if entry.status === 'overdue'}
                <ReasonBadge
                  tone="danger"
                  label={$t('reports.due.overdue', { count: -(entry.dueInDays ?? 0) })}
                />
              {:else if entry.status === 'due-soon'}
                <ReasonBadge
                  tone="attention"
                  label={$t('reports.due.soon', { count: entry.dueInDays ?? 0 })}
                />
              {:else}
                <StatusLabel
                  tone={statusTone(entry.status)}
                  label={$t(`reports.threat.status.${entry.status}`)}
                />
              {/if}
            </span>
            <span class="row__meta">
              {$t('threats.counts.short', {
                open: entry.threats.open,
                untreated: entry.threats.untreated,
              })}
            </span>
            {#if entry.reviewDue}
              <span class="row__meta">
                {$t('threats.review.due-on', { date: formatDate(entry.reviewDue, $currentLocale) })}
              </span>
            {/if}
          </RowLink>
        </li>
      {/each}
    </ul>
  {/if}
  {#if service.drafts.length > 0}
    <ul class="column__drafts" data-testid="recipe-drafts">
      {#each service.drafts as draft (draft.recipe)}
        <li>
          <Link
            href={newAddress(service.service.id, draft.recipe)}
            data-testid="continue-{draft.recipe}"
          >
            {$t('threats.draft.continue', { recipe: humanizeKey(draft.recipe) })}
          </Link>
        </li>
      {/each}
    </ul>
  {/if}
  {#if canCreate && !service.service.retired}
    <p class="column__act">
      <Link href={newAddress(service.service.id)} data-testid="new-threat-model-link">
        {$t('threats.new.act')}
      </Link>
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

  .column__notice {
    padding: 0 var(--space-4) var(--space-3);
  }

  .column__drafts {
    padding: var(--space-3) var(--space-4) 0;
    list-style: none;
    font-size: var(--text-sm);
  }

  .column__act {
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-sm);
  }

  .meta-line {
    display: block;
  }

  /* The links of the page are targets of the phone size (AUN-WEB-2). */
  @media (max-width: 767px) {
    .column__drafts :global(.link),
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
</style>
