<script lang="ts">
  import { untrack } from 'svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import ScoreMeter from '../../components/ScoreMeter.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import TrendLine from '../../components/TrendLine.svelte';
  import type { SammModel, SammScope } from '../../api/types';
  import { formatDate } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { formatScore } from '../../samm/scores';
  import { loadModel } from '../../samm/store';
  import { stateTone } from './workflow';

  /**
   * A scope as a sheet (AUN-SAMM-2, AUN-SAMM-6): its subject, the trend of its released assessments, the assessments
   * in order and its targets — the roadmap — practice by practice.
   */
  interface Props {
    scope: SammScope | null;
  }

  let { scope }: Props = $props();

  let model = $state<SammModel | null>(null);
  let failed = $state(false);
  $effect(() => {
    const version = scope?.modelVersion;
    if (!version) return;
    let current = true;
    failed = false;
    // Another version: the last model goes at once, so a failed load never shows the old practices.
    if (untrack(() => model?.version) !== version) model = null;
    loadModel(version)
      .then((loaded) => {
        if (current) model = loaded;
      })
      .catch(() => {
        if (current) failed = true;
      });
    return () => {
      current = false;
    };
  });

  let released = $derived(
    (scope?.assessments ?? [])
      .filter((entry) => entry.state === 'released' && entry.overall !== null)
      .slice()
      .reverse(),
  );
</script>

{#if scope === null}
  <Sheet><p class="muted">{$t('common.loading')}</p></Sheet>
{:else}
  <Sheet testId="scope-sheet">
    <SheetHead
      kind="scope"
      kindLabel={$t('kind.scope')}
      title={scope.title}
      lede={$t(`samm.subject.lede.${scope.subject.kind}`, { name: scope.subject.name })}
      facts={[
        { term: $t('samm.fact.model'), value: `${$t('samm.model.name')} ${scope.modelVersion}` },
        { term: $t('samm.fact.assessments'), value: String(scope.assessments.length) },
      ]}
    />

    {#if released.length > 1}
      <section class="section">
        <h2 class="section__title">{$t('samm.scope.trend')}</h2>
        <TrendLine
          points={released.map((entry) => ({
            label: entry.title,
            value: entry.overall ?? 0,
            text: formatScore(entry.overall ?? 0, $currentLocale),
          }))}
          max={3}
          label={$t('samm.scope.trend-label', { title: scope.title })}
        />
      </section>
    {/if}

    <section class="section">
      <h2 class="section__title">{$t('samm.scope.assessments')}</h2>
      <ol class="entries">
        {#each scope.assessments as entry (entry.id)}
          <li class="entry">
            <span class="entry__title"
              ><Link href="/samm/{scope.id}/{entry.id}">{entry.title}</Link></span
            >
            <StatusLabel tone={stateTone(entry.state)} label={$t(`workflow.${entry.state}`)} />
            <span class="entry__meta">{formatDate(entry.date, $currentLocale, 'long')}</span>
            <span class="entry__score">
              {#if entry.overall !== null}
                <ScoreMeter
                  value={entry.overall}
                  text={formatScore(entry.overall, $currentLocale)}
                  label={$t('samm.score.of', { score: formatScore(entry.overall, $currentLocale) })}
                />
              {/if}
            </span>
          </li>
        {/each}
      </ol>
    </section>

    {#if model}
      <section class="section">
        <h2 class="section__title">{$t('samm.scope.targets')}</h2>
        <p class="section__lede">{$t('samm.scope.targets-lede')}</p>
        <table class="targets">
          <caption class="sr-only">{$t('samm.scope.targets')}</caption>
          <thead>
            <tr>
              <th scope="col">{$t('kind.practice')}</th>
              <th scope="col" class="targets__num">{$t('samm.target')}</th>
              <th scope="col">{$t('samm.target.due')}</th>
            </tr>
          </thead>
          <tbody>
            {#each model.functions as fn (fn.id)}
              <tr class="targets__group">
                <th scope="rowgroup" colspan="3">{fn.name}</th>
              </tr>
              {#each fn.practices as practice (practice.id)}
                {@const target = scope.targets[practice.id]}
                <tr>
                  <th scope="row">{practice.name}</th>
                  <td class="targets__num"
                    >{target ? formatScore(target.target, $currentLocale) : '–'}</td
                  >
                  <td>{target?.due ? formatDate(target.due, $currentLocale) : '–'}</td>
                </tr>
              {/each}
            {/each}
          </tbody>
        </table>
      </section>
    {:else if failed}
      <section class="section">
        <Notice tone="danger" title={$t('error.unexpected')} live />
      </section>
    {/if}
  </Sheet>
{/if}

<style>
  .muted {
    color: var(--color-text-muted);
  }

  .section + .section {
    margin-block-start: var(--space-10);
  }

  .section__title {
    margin-block-end: var(--space-3);
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
  }

  .section__lede {
    max-inline-size: var(--measure);
    margin-block-end: var(--space-4);
    color: var(--color-text-secondary);
  }

  .entries {
    list-style: none;
  }

  .entry {
    display: grid;
    grid-template-columns: minmax(10rem, 1.4fr) auto minmax(8rem, 1fr) minmax(8rem, 12rem);
    align-items: center;
    gap: var(--space-2) var(--space-4);
    padding-block: var(--space-3);
    border-block-end: 1px solid var(--color-border);
  }

  .entry__title {
    font-family: var(--font-serif);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  .entry__meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .targets {
    inline-size: 100%;
    max-inline-size: 40rem;
    border-collapse: collapse;
  }

  .targets th,
  .targets td {
    padding: var(--space-2) var(--space-3) var(--space-2) 0;
    text-align: start;
    font-weight: var(--weight-regular);
    border-block-end: 1px solid var(--color-border);
  }

  .targets thead th {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
  }

  .targets__group th {
    padding-block-start: var(--space-4);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  .targets__num {
    inline-size: 6rem;
    font-feature-settings: 'tnum' 1;
  }

  @media (max-width: 767px) {
    .entry {
      grid-template-columns: 1fr auto;
    }
  }
</style>
