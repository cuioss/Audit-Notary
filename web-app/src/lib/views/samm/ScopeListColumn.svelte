<script lang="ts">
  import ColumnHead from '../../components/ColumnHead.svelte';
  import Link from '../../components/Link.svelte';
  import RowLink from '../../components/RowLink.svelte';
  import ScoreMeter from '../../components/ScoreMeter.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import type { SammScopeList } from '../../api/types';
  import { currentLocale, t } from '../../i18n';
  import { formatScore } from '../../samm/scores';
  import { stateTone } from './workflow';

  /**
   * The first column of the SAMM lens: every scope, with the score of its latest released assessment and the state
   * of an assessment still open.
   */
  interface Props {
    /** The scopes, or `null` while loading. */
    scopes: SammScopeList | null;
    /** The selected scope. */
    selected: string | null;
    /** Whether the user may create a scope: the link to the form is offered only then. */
    canCreate?: boolean;
  }

  let { scopes, selected, canCreate = false }: Props = $props();
</script>

<ColumnHead kind="samm" kindLabel={$t('lens.samm')} title={$t('samm.scopes.title')} href="/samm" />
{#if scopes === null}
  <p class="column__loading">{$t('common.loading')}</p>
{:else}
  <ul class="column__list" data-testid="scope-list">
    {#each scopes.scopes as entry (entry.id)}
      <li>
        <RowLink href="/samm/{entry.id}" selected={entry.id === selected} testId="scope-{entry.id}">
          <span class="row__title">{entry.title}</span>
          <span class="row__meta">{$t(`samm.subject.${entry.subject.kind}`)}</span>
          {#if entry.latest}
            <ScoreMeter
              value={entry.latest.overall}
              text={formatScore(entry.latest.overall, $currentLocale)}
              label={$t('samm.score.of', {
                score: formatScore(entry.latest.overall, $currentLocale),
              })}
            />
          {:else}
            <span class="row__meta">{$t('samm.scope.none-released')}</span>
          {/if}
          {#if entry.open}
            <StatusLabel
              tone={stateTone(entry.open.state)}
              label={$t(`samm.open.${entry.open.state}`)}
            />
          {/if}
        </RowLink>
      </li>
    {/each}
  </ul>
  {#if canCreate}
    <p class="column__act">
      <Link href="/samm/new" data-testid="new-scope-link">{$t('samm.new.scope.act')}</Link>
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

  .column__loading {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }

  .column__act {
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-sm);
  }

  .row__title {
    font-weight: var(--weight-medium);
  }

  .row__meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
</style>
