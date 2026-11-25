<script lang="ts">
  import ColumnHead from '../../components/ColumnHead.svelte';
  import RowLink from '../../components/RowLink.svelte';
  import ScoreMeter from '../../components/ScoreMeter.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import type { SammScope } from '../../api/types';
  import { formatDate } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { formatScore } from '../../samm/scores';
  import { stateTone } from './workflow';

  /**
   * The assessments of a scope as a list column, newest first.
   */
  interface Props {
    /** The scope, or `null` while loading. */
    scope: SammScope | null;
    /** The selected assessment. */
    selected: string | null;
  }

  let { scope, selected }: Props = $props();
</script>

{#if scope === null}
  <p class="column__loading">{$t('common.loading')}</p>
{:else}
  <ColumnHead kind="scope" kindLabel={$t('kind.scope')} title={scope.title} href="/samm/{scope.id}">
    {#snippet meta()}{$t(`samm.subject.${scope.subject.kind}`)}{/snippet}
  </ColumnHead>
  <ul class="column__list" data-testid="assessment-list">
    {#each scope.assessments as entry (entry.id)}
      <li>
        <RowLink
          href="/samm/{scope.id}/{entry.id}"
          selected={entry.id === selected}
          testId="assessment-{entry.id}"
        >
          <span class="row__title">{entry.title}</span>
          <span class="row__line">
            <StatusLabel tone={stateTone(entry.state)} label={$t(`workflow.${entry.state}`)} />
            <span class="row__meta">{formatDate(entry.date, $currentLocale)}</span>
          </span>
          {#if entry.overall !== null}
            <ScoreMeter
              value={entry.overall}
              text={formatScore(entry.overall, $currentLocale)}
              label={$t('samm.score.of', { score: formatScore(entry.overall, $currentLocale) })}
              tone={entry.state === 'released' ? 'ink' : 'muted'}
            />
          {:else}
            <span class="row__meta"
              >{$t('samm.answered', { count: entry.answered, total: 90 })}</span
            >
          {/if}
        </RowLink>
      </li>
    {/each}
  </ul>
{/if}

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
