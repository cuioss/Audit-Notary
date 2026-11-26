<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Disclosure from '../../components/Disclosure.svelte';
  import Dumbbell, { type DumbbellRow } from '../../components/Dumbbell.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import GridTable from '../../components/GridTable.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import Select from '../../components/Select.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError } from '../../api/errors';
  import type {
    SammAssessmentSummary,
    SammComparison,
    SammModel,
    SammScope,
    SammScopeList,
    ScoreDelta,
  } from '../../api/types';
  import { formatDate } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { slotOf } from '../../reports/chart';
  import { compareAddress, SAMM_COMPARE_ADDRESS, trendAddress } from '../../reports/reports';
  import { formatDelta, formatScore } from '../../samm/scores';
  import { loadModel } from '../../samm/store';
  import NotFoundView from '../NotFoundView.svelte';
  import ReportPage from './ReportPage.svelte';

  /**
   * The comparison of two assessments of one scope (`/reports/samm-compare?scope&from&to`, UC-SAMM-5): a dumbbell for
   * the overall score and for each business function, and under each function a dumbbell for its practices and their
   * streams. The ring is the earlier assessment, the filled dot the later one; every row says its two scores and the
   * change in words, and a table states the business functions again. Without `from` and `to` the page offers the pairs
   * of released assessments the scope has and two pickers. Two assessments taken with different model versions are not
   * compared: the page says which two and which versions, in the place of the comparison.
   */
  interface Props {
    /** The admitted query of the address: `scope`, `from` and `to`. */
    query?: Record<string, string>;
    /** Opens an address inside the app. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
  }

  let { query = {}, onnavigate }: Props = $props();

  let scopes = $state<SammScopeList | null>(null);
  let scope = $state<SammScope | null>(null);
  /** The scope of the address does not exist: the not-found view of the page. */
  let scopeMissing = $state(false);
  let failure = $state<string | null>(null);
  let comparison = $state<SammComparison | null>(null);
  /** The refusal of two model versions: the two assessments and their versions. */
  let differ = $state<{ from: string; fromVersion: string; to: string; toVersion: string } | null>(
    null,
  );
  /** One of the two assessments is none of the scope's. */
  let missing = $state(false);
  let compareFailure = $state<string | null>(null);
  let model = $state<SammModel | null>(null);

  let fromPick = $state('');
  let toPick = $state('');

  $effect(() => {
    let current = true;
    apiClient.getSammScopes().then(
      (loaded) => {
        if (current) scopes = loaded;
      },
      (error: unknown) => {
        if (current) failure = errorMessageKey(error);
      },
    );
    return () => {
      current = false;
    };
  });

  $effect(() => {
    const id = query.scope;
    scopeMissing = false;
    if (!id) {
      scope = null;
      return;
    }
    let current = true;
    if (untrack(() => scope?.id) !== id) scope = null;
    apiClient.getSammScope(id).then(
      (loaded) => {
        if (current) scope = loaded;
      },
      (error: unknown) => {
        if (!current) return;
        if (isApiError(error) && error.outcome === 'NOT_FOUND') scopeMissing = true;
        else failure = errorMessageKey(error);
      },
    );
    return () => {
      current = false;
    };
  });

  // The pickers follow the address: a pair chosen by a link shows in them.
  $effect(() => {
    fromPick = query.from ?? '';
    toPick = query.to ?? '';
  });

  $effect(() => {
    const { scope: id, from, to } = query;
    comparison = null;
    differ = null;
    missing = false;
    compareFailure = null;
    if (!id || !from || !to) return;
    let current = true;
    apiClient.compareSamm(id, from, to).then(
      (answer) => {
        if (current) comparison = answer;
      },
      (error: unknown) => {
        if (!current) return;
        if (isApiError(error) && error.outcome === 'MODEL_VERSIONS_DIFFER') {
          const side = (name: 'from' | 'to') =>
            error.details[name] as { assessment?: unknown; modelVersion?: unknown } | undefined;
          differ = {
            from: String(side('from')?.assessment ?? from),
            fromVersion: String(side('from')?.modelVersion ?? ''),
            to: String(side('to')?.assessment ?? to),
            toVersion: String(side('to')?.modelVersion ?? ''),
          };
        } else if (isApiError(error) && error.outcome === 'NOT_FOUND') {
          missing = true;
        } else if (
          isApiError(error) &&
          (error.outcome === 'FORBIDDEN' || error.outcome === 'GIT_UNAVAILABLE')
        ) {
          compareFailure = errorMessageKey(error);
        } else {
          compareFailure = 'reports.compare.failed';
        }
      },
    );
    return () => {
      current = false;
    };
  });

  $effect(() => {
    const version = comparison?.modelVersion;
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

  /** The assessments of the scope, the earliest first. */
  let assessments = $derived(
    [...(scope?.assessments ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
  );
  const describe = (entry: SammAssessmentSummary) =>
    $t('reports.compare.assessment', {
      title: entry.title,
      date: formatDate(entry.date, $currentLocale),
      state: $t(`workflow.${entry.state}`),
    });
  let assessmentOptions = $derived(
    assessments.map((entry) => ({ value: entry.id, label: describe(entry) })),
  );
  /** Pairs of neighbouring released assessments: the comparisons a scope offers first. */
  let pairs = $derived.by(() => {
    const released = assessments.filter((entry) => entry.state === 'released');
    return released.slice(1).map((entry, index) => ({ from: released[index], to: entry }));
  });
  let nameOf = $derived((id: string) => assessments.find((entry) => entry.id === id)?.title ?? id);

  let reason = $derived(
    !query.scope || fromPick === '' || toPick === ''
      ? $t('reports.compare.pick.both')
      : fromPick === toPick
        ? $t('reports.compare.pick.same')
        : null,
  );

  /** The address of the pair the pickers hold, the earlier assessment first, whichever way round it was picked. */
  let showAddress = $derived.by(() => {
    const first = assessments.find((entry) => entry.id === fromPick);
    const second = assessments.find((entry) => entry.id === toPick);
    const swap = first !== undefined && second !== undefined && first.date > second.date;
    return compareAddress(query.scope, swap ? toPick : fromPick, swap ? fromPick : toPick);
  });

  const fmt = (value: number) => formatScore(value, $currentLocale);
  const rowOf = (
    id: string,
    label: string,
    delta: ScoreDelta,
    level: 0 | 1 | 2,
    slot?: number,
  ): DumbbellRow => ({
    id,
    label,
    from: delta.from,
    to: delta.to,
    values: $t('reports.compare.values', { from: fmt(delta.from), to: fmt(delta.to) }),
    change: formatDelta(delta.delta, $currentLocale),
    level,
    slot,
  });

  let functions = $derived(
    (comparison?.functions ?? []).map((fn, index) => ({
      fn,
      slot: slotOf(index) ?? undefined,
      name: model?.functions.find((entry) => entry.id === fn.id)?.name ?? fn.id,
    })),
  );
  let functionRows = $derived(
    comparison
      ? [
          rowOf('overall', $t('reports.compare.overall'), comparison.overall, 0),
          ...functions.map(({ fn, slot, name }) => rowOf(fn.id, name, fn, 0, slot)),
        ]
      : [],
  );
  const practiceRows = (entry: (typeof functions)[number]): DumbbellRow[] => {
    const known = model?.functions.find((candidate) => candidate.id === entry.fn.id);
    return entry.fn.practices.flatMap((practice) => [
      rowOf(
        `${entry.fn.id}-${practice.id}`,
        known?.practices.find((candidate) => candidate.id === practice.id)?.name ?? practice.id,
        practice,
        1,
        entry.slot,
      ),
      ...practice.streams.map((stream) =>
        rowOf(
          `${entry.fn.id}-${practice.id}-${stream.letter}`,
          $t('reports.compare.stream', { letter: stream.letter }),
          stream,
          2,
          entry.slot,
        ),
      ),
    ]);
  };

  let fromEntry = $derived(assessments.find((entry) => entry.id === query.from));
  let toEntry = $derived(assessments.find((entry) => entry.id === query.to));

  function scopeChosen(id: string) {
    onnavigate(compareAddress(id === '' ? undefined : id));
  }
</script>

{#if scopeMissing}
  <NotFoundView />
{:else}
  <ReportPage
    title={$t('reports.compare.title')}
    intro={$t('reports.compare.lede')}
    address={SAMM_COMPARE_ADDRESS}
    testId="samm-compare-view"
  >
    {#if failure}
      <Notice tone="danger" title={$t(failure)} live />
    {:else if scopes === null}
      <p class="muted">{$t('common.loading')}</p>
    {:else if scopes.scopes.length === 0}
      <EmptyState
        icon="state.na"
        title={$t('reports.compare.no-scopes.title')}
        body={$t('reports.compare.no-scopes.body')}
      />
    {:else}
      <div class="pickers">
        <Select
          label={$t('reports.compare.scope')}
          options={scopes.scopes.map((entry) => ({ value: entry.id, label: entry.title }))}
          value={query.scope ?? ''}
          placeholder={$t('reports.compare.scope.placeholder')}
          onchange={scopeChosen}
          testId="compare-scope"
        />
        {#if query.scope && scope}
          <Select
            label={$t('reports.compare.from')}
            options={assessmentOptions}
            bind:value={fromPick}
            placeholder={$t('reports.compare.pick.placeholder')}
            testId="compare-from"
          />
          <Select
            label={$t('reports.compare.to')}
            options={assessmentOptions}
            bind:value={toPick}
            placeholder={$t('reports.compare.pick.placeholder')}
            testId="compare-to"
          />
          <div class="pickers__act">
            {#if reason}
              <Button variant="primary" disabledReason={reason} data-testid="compare-show">
                {$t('reports.compare.show')}
              </Button>
            {:else}
              <Link href={showAddress} look="primary" data-testid="compare-show">
                {$t('reports.compare.show')}
              </Link>
            {/if}
          </div>
        {/if}
      </div>

      {#if scope && !query.from && !query.to}
        {#if assessments.length < 2}
          <p class="note" data-testid="compare-too-few">{$t('reports.compare.too-few')}</p>
        {:else if pairs.length > 0}
          <section class="section" aria-labelledby="compare-pairs-title">
            <h2 class="section__title" id="compare-pairs-title">{$t('reports.compare.pairs')}</h2>
            <ul class="pairs" data-testid="compare-pairs">
              {#each pairs as pair (pair.to.id)}
                <li>
                  <Link href={compareAddress(scope.id, pair.from.id, pair.to.id)}>
                    {$t('reports.compare.pair', { from: pair.from.title, to: pair.to.title })}
                  </Link>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      {/if}

      {#if differ}
        <div data-testid="compare-differ">
          <Notice
            tone="info"
            title={$t('samm.differ.title')}
            body={$t('samm.differ.body', {
              from: nameOf(differ.from),
              fromVersion: differ.fromVersion,
              to: nameOf(differ.to),
              toVersion: differ.toVersion,
            })}
          />
        </div>
      {:else if missing}
        <div data-testid="compare-missing">
          <Notice
            tone="attention"
            title={$t('reports.compare.missing.title')}
            body={$t('reports.compare.missing.body')}
            live
          />
        </div>
      {:else if compareFailure}
        <Notice tone="danger" title={$t(compareFailure)} live />
      {:else if comparison}
        <section class="section" aria-labelledby="compare-title" data-testid="compare-result">
          <h2 class="section__title" id="compare-title">{$t('reports.compare.functions')}</h2>
          <Dumbbell
            rows={functionRows}
            max={3}
            fromLabel={fromEntry ? describe(fromEntry) : comparison.from}
            toLabel={toEntry ? describe(toEntry) : comparison.to}
            label={$t('reports.compare.chart', {
              from: nameOf(comparison.from),
              to: nameOf(comparison.to),
            })}
            testId="compare-chart"
          />
          <GridTable
            caption={$t('reports.compare.table')}
            heads={[
              $t('reports.compare.col.function'),
              $t('reports.compare.col.from'),
              $t('reports.compare.col.to'),
              $t('reports.compare.col.change'),
            ]}
            testId="compare-table"
          >
            {#each functionRows as row (row.id)}
              <tr data-testid="compare-row-{row.id}">
                <th scope="row">{row.label}</th>
                <td data-label={$t('reports.compare.col.from')}>{fmt(row.from)}</td>
                <td data-label={$t('reports.compare.col.to')}>{fmt(row.to)}</td>
                <td data-label={$t('reports.compare.col.change')}>{row.change}</td>
              </tr>
            {/each}
          </GridTable>
          {#each functions as entry (entry.fn.id)}
            <Disclosure testId="compare-practices-{entry.fn.id}">
              {#snippet summary()}
                {$t('reports.compare.practices-of', { name: entry.name })}
              {/snippet}
              <Dumbbell
                rows={practiceRows(entry)}
                max={3}
                fromLabel={fromEntry ? describe(fromEntry) : comparison.from}
                toLabel={toEntry ? describe(toEntry) : comparison.to}
                label={$t('reports.compare.practices-chart', { name: entry.name })}
                legend={false}
              />
            </Disclosure>
          {/each}
        </section>
        <p class="links">
          <Link href={trendAddress(query.scope)} data-testid="compare-trend"
            >{$t('reports.samm.open-trend')}</Link
          >
        </p>
      {:else if query.from && query.to}
        <p class="muted">{$t('common.loading')}</p>
      {/if}
    {/if}
  </ReportPage>
{/if}

<style>
  .muted {
    color: var(--color-text-muted);
  }

  .note {
    max-inline-size: var(--measure);
    color: var(--color-text-secondary);
  }

  .pickers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
    align-items: start;
    gap: var(--space-4);
  }

  .pickers__act {
    align-self: end;
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

  .pairs {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pairs :global(.link),
  .links :global(.link) {
    display: inline-block;
    padding-block: var(--space-2);
  }

  /* A link of a list and the summary of a disclosure have the 44 px of a target on a phone. */
  @media (max-width: 767px) {
    .pairs :global(.link),
    .links :global(.link) {
      padding-block: var(--space-3);
    }

    .section :global(.disclosure__summary) {
      min-block-size: 44px;
    }
  }
</style>
