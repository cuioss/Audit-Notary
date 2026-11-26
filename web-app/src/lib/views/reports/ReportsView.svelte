<script lang="ts">
  import { onMount } from 'svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import ScoreMeter from '../../components/ScoreMeter.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey } from '../../api/errors';
  import { RISK_RATINGS, type ReportsSummary } from '../../api/types';
  import { formatDate } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import {
    RISK_REGISTER_ADDRESS,
    SAMM_COMPARE_ADDRESS,
    SAMM_TREND_ADDRESS,
    THREAT_EVALUATION_ADDRESS,
    trendAddress,
  } from '../../reports/reports';
  import { formatDelta, formatScore } from '../../samm/scores';
  import DashboardPage from '../../templates/DashboardPage.svelte';

  /**
   * The dashboard of the lens Reports (`/reports`): one section for each register the person may read, with its figures
   * and the link to its report. The figures come from one request, so a figure and its report never disagree; a section
   * of a register the person may not read is not drawn. A figure that needs attention is written in the colour of its
   * state, and its term says the same in words.
   */
  let summary = $state<ReportsSummary | null>(null);
  let failure = $state<string | null>(null);

  onMount(() => {
    let current = true;
    apiClient.getReportsSummary().then(
      (loaded) => {
        if (current) summary = loaded;
      },
      (error: unknown) => {
        if (current) failure = errorMessageKey(error);
      },
    );
    return () => {
      current = false;
    };
  });

  let empty = $derived(
    summary !== null && !summary.samm && !summary.threatModels && !summary.risks,
  );
</script>

{#snippet figure(term: string, value: number, tone: 'plain' | 'danger' | 'attention' = 'plain')}
  <div class="figure figure--{tone}">
    <dt>{term}</dt>
    <dd>{value}</dd>
  </div>
{/snippet}

<DashboardPage
  title={$t('lens.reports')}
  intro={summary
    ? $t('reports.dashboard.intro', { date: formatDate(summary.today, $currentLocale) })
    : undefined}
  testId="reports-view"
>
  {#if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {:else if summary === null}
    <p class="reports__muted">{$t('common.loading')}</p>
  {:else if empty}
    <EmptyState
      icon="state.na"
      title={$t('reports.dashboard.empty.title')}
      body={$t('reports.dashboard.empty.body')}
    />
  {:else}
    <div class="reports">
      {#if summary.samm}
        {@const samm = summary.samm}
        <section class="part" aria-labelledby="reports-samm" data-testid="reports-samm">
          <h2 class="part__title" id="reports-samm">
            <Link href={SAMM_TREND_ADDRESS}>{$t('reports.samm.title')}</Link>
          </h2>
          <p class="part__lede">{$t('reports.samm.lede')}</p>
          <dl class="figures">
            {@render figure($t('reports.fig.scopes'), samm.scopes)}
            {@render figure($t('reports.fig.without-release'), samm.withoutRelease)}
            {@render figure($t('reports.fig.open'), samm.open)}
          </dl>
          {#if samm.latest.length === 0}
            <p class="reports__muted">{$t('reports.samm.latest.empty')}</p>
          {:else}
            <h3 class="part__sub">{$t('reports.samm.latest')}</h3>
            <ul class="latest">
              {#each samm.latest as entry (entry.scope)}
                <li class="latest__row" data-testid="reports-latest-{entry.scope}">
                  <span class="latest__name">
                    <Link href={trendAddress(entry.scope)}>{entry.name}</Link>
                    <span class="latest__meta">{formatDate(entry.date, $currentLocale)}</span>
                  </span>
                  <ScoreMeter
                    value={entry.overall}
                    text={formatScore(entry.overall, $currentLocale)}
                    label={$t('samm.score.of', {
                      score: formatScore(entry.overall, $currentLocale),
                    })}
                  />
                  <span class="latest__change">
                    {entry.change === null
                      ? $t('reports.samm.change.none')
                      : $t('reports.samm.change', {
                          change: formatDelta(entry.change, $currentLocale),
                        })}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
          <p class="part__links">
            <Link href={SAMM_TREND_ADDRESS} data-testid="reports-open-trend"
              >{$t('reports.samm.open-trend')}</Link
            >
            <Link href={SAMM_COMPARE_ADDRESS} data-testid="reports-open-compare"
              >{$t('reports.samm.open-compare')}</Link
            >
          </p>
        </section>
      {/if}

      {#if summary.threatModels}
        {@const threats = summary.threatModels}
        <section class="part" aria-labelledby="reports-threats" data-testid="reports-threats">
          <h2 class="part__title" id="reports-threats">
            <Link href={THREAT_EVALUATION_ADDRESS}>{$t('reports.threats.title')}</Link>
          </h2>
          <p class="part__lede">{$t('reports.threats.lede')}</p>
          <dl class="figures">
            {@render figure($t('reports.fig.services'), threats.services)}
            {@render figure($t('reports.fig.with-model'), threats.withModel)}
            {@render figure($t('reports.fig.without-model'), threats.withoutModel)}
            {@render figure($t('reports.fig.open-threats'), threats.openThreats)}
            {@render figure($t('reports.fig.untreated-threats'), threats.untreatedThreats)}
            {@render figure(
              $t('reports.fig.reviews-overdue'),
              threats.overdue,
              threats.overdue > 0 ? 'danger' : 'plain',
            )}
            {@render figure(
              $t('reports.fig.reviews-soon'),
              threats.dueSoon,
              threats.dueSoon > 0 ? 'attention' : 'plain',
            )}
          </dl>
          <p class="part__links">
            <Link href={THREAT_EVALUATION_ADDRESS} data-testid="reports-open-threats"
              >{$t('reports.threats.open')}</Link
            >
          </p>
        </section>
      {/if}

      {#if summary.risks}
        {@const risks = summary.risks}
        <section class="part" aria-labelledby="reports-risks" data-testid="reports-risks">
          <h2 class="part__title" id="reports-risks">
            <Link href={RISK_REGISTER_ADDRESS}>{$t('reports.risks.title')}</Link>
          </h2>
          <p class="part__lede">{$t('reports.risks.lede')}</p>
          <dl class="figures">
            {@render figure($t('reports.fig.risks'), risks.entries)}
            {#each [...RISK_RATINGS].reverse() as rating (rating)}
              {@render figure($t(`reports.rating.${rating}`), risks.byRating[rating] ?? 0)}
            {/each}
            {@render figure(
              $t('reports.fig.risk-reviews-overdue'),
              risks.overdue,
              risks.overdue > 0 ? 'danger' : 'plain',
            )}
            {@render figure(
              $t('reports.fig.risk-reviews-soon'),
              risks.dueSoon,
              risks.dueSoon > 0 ? 'attention' : 'plain',
            )}
          </dl>
          <p class="part__lede">
            {risks.latestRelease
              ? $t('reports.risks.latest-release', {
                  date: formatDate(risks.latestRelease, $currentLocale),
                })
              : $t('reports.risks.none')}
          </p>
          <p class="part__links">
            <Link href={RISK_REGISTER_ADDRESS} data-testid="reports-open-risks"
              >{$t('reports.risks.open')}</Link
            >
          </p>
        </section>
      {/if}
    </div>
  {/if}
</DashboardPage>

<style>
  .reports {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    max-inline-size: 64rem;
  }

  .reports__muted {
    color: var(--color-text-muted);
  }

  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-block-end: var(--space-8);
    border-block-end: 1px solid var(--color-border);
  }

  .part:last-child {
    border-block-end: none;
  }

  .part__title {
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
    font-weight: var(--weight-semibold);
  }

  .part__title :global(.link) {
    color: var(--color-text-primary);
    text-decoration-color: var(--color-border-strong);
  }

  .part__lede {
    max-inline-size: var(--measure);
    color: var(--color-text-secondary);
  }

  .part__sub {
    margin-block-start: var(--space-2);
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
  }

  .part__links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-6);
  }

  .part__links :global(.link) {
    display: inline-block;
    padding-block: var(--space-2);
  }

  .figures {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
    gap: var(--space-4) var(--space-5);
    margin: 0;
  }

  .figure {
    display: flex;
    flex-direction: column-reverse;
    gap: var(--space-1);
    min-inline-size: 0;
  }

  .figure dt {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .figure dd {
    margin: 0;
    font-family: var(--font-serif);
    font-size: var(--text-2xl);
    line-height: 1;
    font-weight: var(--weight-semibold);
    font-feature-settings: 'lnum' 1;
  }

  .figure--danger dd {
    color: var(--color-danger);
  }

  .figure--attention dd {
    color: var(--color-attention-text);
  }

  .latest {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .latest__row {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) minmax(8rem, 12rem) minmax(8rem, 1fr);
    align-items: center;
    gap: var(--space-4);
    padding-block: var(--space-3);
    border-block-end: 1px solid var(--color-border);
  }

  .latest__name {
    display: flex;
    flex-direction: column;
    font-family: var(--font-serif);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  .latest__meta,
  .latest__change {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--weight-regular);
    color: var(--color-text-secondary);
  }

  @media (max-width: 767px) {
    .latest__row {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-1);
    }

    .latest__name :global(.link) {
      padding-block: var(--space-3);
    }
  }
</style>
