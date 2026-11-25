<script lang="ts">
  import Link from '../../components/Link.svelte';
  import ScoreMeter from '../../components/ScoreMeter.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import type { SammScopeList } from '../../api/types';
  import { formatDate } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { formatScore } from '../../samm/scores';
  import { stateTone } from './workflow';

  /**
   * The object of the SAMM lens before a scope is chosen: every scope as one line of a register, with its latest
   * released score on the common 0 to 3 scale, so the scopes compare at a glance, and the assessment still open.
   */
  interface Props {
    scopes: SammScopeList | null;
  }

  let { scopes }: Props = $props();

  let released = $derived(scopes?.scopes.filter((entry) => entry.latest !== null).length ?? 0);
</script>

<Sheet testId="samm-overview">
  <SheetHead
    kind="samm"
    kindLabel={$t('lens.samm')}
    title={$t('samm.overview.title')}
    lede={$t('samm.overview.lede')}
  />
  {#if scopes === null}
    <p class="muted">{$t('common.loading')}</p>
  {:else}
    <p class="summary">
      {$t('samm.overview.summary', { count: scopes.scopes.length, released })}
    </p>
    <table class="register">
      <caption class="sr-only">{$t('samm.overview.caption')}</caption>
      <thead>
        <tr>
          <th scope="col">{$t('kind.scope')}</th>
          <th scope="col">{$t('samm.overview.latest')}</th>
          <th scope="col" class="register__score">{$t('samm.overview.score')}</th>
          <th scope="col">{$t('samm.overview.open')}</th>
        </tr>
      </thead>
      <tbody>
        {#each scopes.scopes as entry (entry.id)}
          <tr>
            <th scope="row">
              <Link href="/samm/{entry.id}">{entry.title}</Link>
              <span class="register__meta">{$t(`samm.subject.${entry.subject.kind}`)}</span>
            </th>
            <td>
              {#if entry.latest}
                <Link href="/samm/{entry.id}/{entry.latest.assessment}">{entry.latest.title}</Link>
                <span class="register__meta">{formatDate(entry.latest.date, $currentLocale)}</span>
              {:else}
                <span class="register__meta">{$t('samm.scope.none-released')}</span>
              {/if}
            </td>
            <td class="register__score">
              {#if entry.latest}
                <ScoreMeter
                  value={entry.latest.overall}
                  text={formatScore(entry.latest.overall, $currentLocale)}
                  label={$t('samm.score.of', {
                    score: formatScore(entry.latest.overall, $currentLocale),
                  })}
                />
              {/if}
            </td>
            <td>
              {#if entry.open}
                <Link href="/samm/{entry.id}/{entry.open.assessment}">{entry.open.title}</Link>
                <StatusLabel
                  tone={stateTone(entry.open.state)}
                  label={$t(`workflow.${entry.open.state}`)}
                />
              {:else}
                <span class="register__meta">{$t('samm.overview.none-open')}</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</Sheet>

<style>
  .muted {
    color: var(--color-text-muted);
  }

  .summary {
    margin-block-end: var(--space-5);
    color: var(--color-text-secondary);
  }

  .register {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--text-base);
  }

  .register th,
  .register td {
    padding: var(--space-3) var(--space-3) var(--space-3) 0;
    text-align: start;
    vertical-align: top;
    border-block-end: 1px solid var(--color-border);
  }

  .register thead th {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
    border-block-end-color: var(--color-border-strong);
  }

  .register tbody th {
    font-family: var(--font-serif);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  .register :global(.link) {
    display: block;
  }

  .register__meta {
    display: block;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--weight-regular);
    color: var(--color-text-muted);
  }

  .register__score {
    inline-size: 12rem;
  }

  @media (max-width: 767px) {
    .register thead {
      display: none;
    }

    .register tr {
      display: grid;
      gap: var(--space-1);
      padding-block: var(--space-3);
      border-block-end: 1px solid var(--color-border);
    }

    .register th,
    .register td {
      border: none;
      padding: 0;
    }

    .register__score {
      inline-size: auto;
    }
  }
</style>
