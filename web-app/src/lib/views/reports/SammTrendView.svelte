<script lang="ts">
  import { untrack } from 'svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import GridTable from '../../components/GridTable.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import Select from '../../components/Select.svelte';
  import SeriesChart, { type Series } from '../../components/SeriesChart.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey } from '../../api/errors';
  import type { SammModel, SammTrendReport } from '../../api/types';
  import { formatDate } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { dayNumber, slotOf, type AxisTick } from '../../reports/chart';
  import { compareAddress, SAMM_TREND_ADDRESS, trendAddress } from '../../reports/reports';
  import { formatScore } from '../../samm/scores';
  import { loadModel } from '../../samm/store';
  import ReportPage from './ReportPage.svelte';

  /**
   * The trend of the SAMM scores (`/reports/samm-trend`, UC-SAMM-5): the overall score of every scope over its released
   * assessments as one line each, or, with `scope`, the five business functions of one scope. A scope is a series colour
   * in the order of the scope list; a sixth and later scope is in the table only, and the page says so. Scopes are drawn
   * on one scale (0 to 3) even when their model versions differ; the page then names the versions, and the
   * assessments of another version than a scope's own are counted, never drawn. The table below the chart states every
   * point again.
   */
  interface Props {
    /** The admitted query of the address: `scope` shows the business functions of that scope. */
    query?: Record<string, string>;
    /** Opens an address inside the app. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
  }

  let { query = {}, onnavigate }: Props = $props();

  /** One chart: its lines, the labels of its horizontal axis and the span of the axis. */
  interface Figure {
    series: Series[];
    ticks: AxisTick[];
    domain: [number, number];
  }

  let report = $state<SammTrendReport | null>(null);
  let failure = $state<string | null>(null);
  let model = $state<SammModel | null>(null);

  $effect(() => {
    let current = true;
    apiClient.getSammTrendReport().then(
      (loaded) => {
        if (current) report = loaded;
      },
      (error: unknown) => {
        if (current) failure = errorMessageKey(error);
      },
    );
    return () => {
      current = false;
    };
  });

  let chosen = $derived(
    report && query.scope
      ? (report.scopes.find((entry) => entry.scope === query.scope) ?? null)
      : null,
  );
  let unknown = $derived(report !== null && query.scope !== undefined && chosen === null);

  // The names and the order of the business functions come from the model the scope was assessed with.
  $effect(() => {
    const version = chosen?.modelVersion;
    if (!version) {
      model = null;
      return;
    }
    let current = true;
    if (untrack(() => model?.version) !== version) model = null;
    loadModel(version).then(
      (loaded) => {
        if (current) model = loaded;
      },
      () => {
        if (current) model = null;
      },
    );
    return () => {
      current = false;
    };
  });

  /** The scopes with at least one released assessment among the first five: the ones that have a line. */
  let drawn = $derived(
    (report?.scopes ?? []).flatMap((scope, index) => {
      const slot = slotOf(index);
      return slot !== null && scope.points.length > 0 ? [{ scope, slot }] : [];
    }),
  );
  let beyond = $derived(
    (report?.scopes ?? []).filter(
      (scope, index) => slotOf(index) === null && scope.points.length > 0,
    ),
  );

  let overview: Figure = $derived.by(() => {
    const days = drawn.flatMap(({ scope }) => scope.points.map((point) => dayNumber(point.date)));
    const dates = [
      ...new Set(drawn.flatMap(({ scope }) => scope.points.map((point) => point.date))),
    ].sort();
    return {
      domain: [Math.min(...days), Math.max(...days)],
      ticks: dates.map((date) => ({
        x: dayNumber(date),
        label: formatDate(date, $currentLocale),
      })),
      series: drawn.map(({ scope, slot }) => ({
        id: scope.scope,
        label: scope.title,
        slot,
        points: scope.points.map((point) => ({
          x: dayNumber(point.date),
          value: point.overall,
          text: formatScore(point.overall, $currentLocale),
        })),
      })),
    };
  });

  /** The versions that occur among the scopes with points, each with the scopes that have it. */
  let versions = $derived.by(() => {
    const byVersion = new Map<string, string[]>();
    for (const { scope } of drawn) {
      if (!scope.modelVersion) continue;
      byVersion.set(scope.modelVersion, [
        ...(byVersion.get(scope.modelVersion) ?? []),
        scope.title,
      ]);
    }
    return byVersion;
  });
  let versionsText = $derived(
    [...versions]
      .map(([version, scopes]) =>
        $t('reports.trend.versions.item', { version, scopes: scopes.join(', ') }),
      )
      .join('; '),
  );
  let omitted = $derived((report?.scopes ?? []).filter((scope) => scope.omitted > 0));

  /** The business functions of the chosen scope: the model's order and names, the ids while the model is not read. */
  let functions = $derived.by(() => {
    const first = chosen?.points[0];
    if (!first) return [];
    const ids = model ? model.functions.map((fn) => fn.id) : Object.keys(first.functions);
    return ids.map((id, index) => ({
      id,
      name: model?.functions.find((fn) => fn.id === id)?.name ?? id,
      slot: slotOf(index),
    }));
  });
  let byFunction: Figure | null = $derived.by(() => {
    if (!chosen) return null;
    const points = chosen.points;
    const lines: Series[] = functions.flatMap((fn) =>
      fn.slot === null
        ? []
        : [
            {
              id: fn.id,
              label: fn.name,
              slot: fn.slot,
              points: points.map((point, index) => ({
                x: index,
                value: point.functions[fn.id] ?? 0,
                text: formatScore(point.functions[fn.id] ?? 0, $currentLocale),
              })),
            },
          ],
    );
    return {
      series: lines,
      ticks: points.map((point, index) => ({ x: index, label: point.title })),
      domain: [0, Math.max(0, points.length - 1)],
    };
  });

  let scopeOptions = $derived(
    (report?.scopes ?? []).map((scope) => ({ value: scope.scope, label: scope.title })),
  );

  /** Opens another scope by business function, or every scope again. */
  function pick(scope: string) {
    onnavigate(trendAddress(scope === '' ? undefined : scope));
  }
</script>

<ReportPage
  title={$t('reports.trend.title')}
  intro={chosen
    ? $t('reports.trend.lede.scope', { scope: chosen.title })
    : $t('reports.trend.lede')}
  address={SAMM_TREND_ADDRESS}
  testId="samm-trend-view"
>
  {#if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {:else if report === null}
    <p class="muted">{$t('common.loading')}</p>
  {:else if report.scopes.length === 0}
    <EmptyState
      icon="state.na"
      title={$t('reports.trend.empty.title')}
      body={$t('reports.trend.empty.body')}
    />
  {:else}
    {#if unknown}
      <div data-testid="trend-scope-unknown">
        <Notice
          tone="attention"
          title={$t('reports.trend.scope-unknown.title')}
          body={$t('reports.trend.scope-unknown.body')}
          live
        />
      </div>
    {/if}
    <div class="pick">
      <Select
        label={$t('reports.trend.pick')}
        options={scopeOptions}
        value={chosen?.scope ?? ''}
        placeholder={$t('reports.trend.all-scopes')}
        onchange={pick}
        testId="trend-scope"
      />
    </div>

    {#if chosen}
      <section
        class="section"
        aria-labelledby="trend-scope-title"
        data-testid="trend-scope-section"
      >
        <h2 class="section__title" id="trend-scope-title">{chosen.title}</h2>
        {#if chosen.points.length === 0}
          <EmptyState
            icon="state.na"
            title={$t('reports.trend.scope-empty.title')}
            body={$t('reports.trend.scope-empty.body', { scope: chosen.title })}
          />
        {:else if byFunction}
          <SeriesChart
            series={byFunction.series}
            ticks={byFunction.ticks}
            domain={byFunction.domain}
            max={3}
            label={$t('reports.trend.function-chart', { scope: chosen.title })}
            legendLabel={$t('reports.trend.functions-legend')}
            testId="trend-functions-chart"
          />
          <GridTable
            caption={$t('reports.trend.table.scope', { scope: chosen.title })}
            heads={[
              $t('reports.trend.col.assessment'),
              $t('reports.trend.col.date'),
              $t('reports.trend.col.overall'),
              ...functions.map((fn) => fn.name),
            ]}
            testId="trend-functions-table"
          >
            {#each chosen.points as point (point.assessment)}
              <tr data-testid="trend-point-{point.assessment}">
                <th scope="row">
                  <Link href="/samm/{chosen.scope}/{point.assessment}">{point.title}</Link>
                </th>
                <td data-label={$t('reports.trend.col.date')}
                  >{formatDate(point.date, $currentLocale)}</td
                >
                <td data-label={$t('reports.trend.col.overall')}>
                  {formatScore(point.overall, $currentLocale)}
                </td>
                {#each functions as fn (fn.id)}
                  <td data-label={fn.name}
                    >{formatScore(point.functions[fn.id] ?? 0, $currentLocale)}</td
                  >
                {/each}
              </tr>
            {/each}
          </GridTable>
        {/if}
        {#if chosen.omitted > 0 && chosen.modelVersion}
          <p class="note" data-testid="trend-omitted">
            {$t('reports.trend.omitted', {
              title: chosen.title,
              count: chosen.omitted,
              version: chosen.modelVersion,
            })}
          </p>
        {/if}
        <p class="links">
          <Link href={trendAddress()} data-testid="trend-all">{$t('reports.trend.all-scopes')}</Link
          >
          <Link href={compareAddress(chosen.scope)} data-testid="trend-compare"
            >{$t('reports.trend.compare')}</Link
          >
          <Link href="/samm/{chosen.scope}">{$t('reports.trend.open-scope')}</Link>
        </p>
      </section>
    {:else}
      {#if versions.size > 1}
        <div data-testid="trend-versions">
          <Notice
            tone="info"
            title={$t('reports.trend.versions.title')}
            body={$t('reports.trend.versions.body', { versions: versionsText })}
          />
        </div>
      {/if}
      {#if drawn.length > 0}
        <section class="section" aria-labelledby="trend-chart-title">
          <h2 class="sr-only" id="trend-chart-title">{$t('reports.trend.chart')}</h2>
          <SeriesChart
            series={overview.series}
            ticks={overview.ticks}
            domain={overview.domain}
            max={3}
            label={$t('reports.trend.chart')}
            legendLabel={$t('reports.trend.legend')}
            testId="trend-chart"
          />
        </section>
      {/if}
      {#if beyond.length > 0}
        <p class="note" data-testid="trend-beyond">
          {$t('reports.trend.beyond', {
            count: beyond.length,
            names: beyond.map((scope) => scope.title).join(', '),
          })}
        </p>
      {/if}
      <section class="section" aria-labelledby="trend-table-title">
        <h2 class="section__title" id="trend-table-title">{$t('reports.trend.table')}</h2>
        <GridTable
          caption={$t('reports.trend.table')}
          heads={[
            $t('reports.trend.col.assessment'),
            $t('reports.trend.col.scope'),
            $t('reports.trend.col.date'),
            $t('reports.trend.col.overall'),
            $t('reports.trend.col.version'),
          ]}
          testId="trend-table"
        >
          {#each report.scopes as scope (scope.scope)}
            {#if scope.points.length === 0}
              <tr data-testid="trend-none-{scope.scope}">
                <th scope="row">{$t('samm.scope.none-released')}</th>
                <td data-label={$t('reports.trend.col.scope')}>
                  <Link href={trendAddress(scope.scope)}>{scope.title}</Link>
                </td>
                <td data-label={$t('reports.trend.col.date')}>{$t('reports.none')}</td>
                <td data-label={$t('reports.trend.col.overall')}>{$t('reports.none')}</td>
                <td data-label={$t('reports.trend.col.version')}>{$t('reports.none')}</td>
              </tr>
            {:else}
              {#each scope.points as point (point.assessment)}
                <tr data-testid="trend-row-{scope.scope}-{point.assessment}">
                  <th scope="row">
                    <Link href="/samm/{scope.scope}/{point.assessment}">{point.title}</Link>
                  </th>
                  <td data-label={$t('reports.trend.col.scope')}>
                    <Link href={trendAddress(scope.scope)}>{scope.title}</Link>
                  </td>
                  <td data-label={$t('reports.trend.col.date')}
                    >{formatDate(point.date, $currentLocale)}</td
                  >
                  <td data-label={$t('reports.trend.col.overall')}>
                    {formatScore(point.overall, $currentLocale)}
                  </td>
                  <td data-label={$t('reports.trend.col.version')}>{scope.modelVersion}</td>
                </tr>
              {/each}
            {/if}
          {/each}
        </GridTable>
      </section>
      {#if omitted.length > 0}
        <ul class="notes" data-testid="trend-omitted">
          {#each omitted as scope (scope.scope)}
            <li class="note">
              {$t('reports.trend.omitted', {
                title: scope.title,
                count: scope.omitted,
                version: scope.modelVersion ?? '',
              })}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/if}
</ReportPage>

<style>
  .muted {
    color: var(--color-text-muted);
  }

  .pick {
    max-inline-size: 22rem;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .section__title {
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
    font-weight: var(--weight-semibold);
  }

  .note {
    max-inline-size: var(--measure);
    color: var(--color-text-secondary);
  }

  .notes {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-6);
  }

  .links :global(.link) {
    display: inline-block;
    padding-block: var(--space-2);
  }
</style>
