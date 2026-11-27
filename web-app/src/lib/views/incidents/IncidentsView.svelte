<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Notice from '../../components/Notice.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError } from '../../api/errors';
  import type {
    CategorySchema,
    DocumentSavedEvent,
    IncidentRead,
    IncidentYearList,
    IncidentYears,
    Revision,
  } from '../../api/types';
  import { LIFECYCLE_EVENTS } from '../../api/types';
  import { actionsOn } from '../../documents/categories';
  import {
    INCIDENT_CATEGORY,
    INCIDENT_KIND,
    INCIDENTS_ADDRESS,
    incidentAddress,
    newAddress,
    repositoryOf,
    yearAddress,
  } from '../../incidents/model';
  import { t } from '../../i18n';
  import { session } from '../../stores/app';
  import { breadcrumb } from '../../stores/breadcrumb';
  import TriagePage, { type Level } from '../../templates/TriagePage.svelte';
  import NotFoundView from '../NotFoundView.svelte';
  import IncidentSheet from './IncidentSheet.svelte';
  import NewIncidentSheet from './NewIncidentSheet.svelte';
  import YearColumn from './YearColumn.svelte';
  import YearsColumn from './YearsColumn.svelte';

  /**
   * The lens Incidents (UC-IR-1, UC-IR-2, UC-IR-3): the chain years › year › incident as columns (`TriagePage`). The years the
   * person may read are always the first level, a year lists its incidents with the status of every stage and its
   * deadlines, and the incident is the sheet with the stages as tabs. The address `?stage=` chooses the tab and `?at=` an
   * earlier state. The address `/incidents/{year}/new` is the form of a new incident, a sheet in the place of the incident.
   * The release of an incident is a page of its own (`IncidentReleaseView`).
   *
   * Data is read per address and again when the event stream names a document of an incident repository: a save, a
   * completion or a creation by someone else refreshes the years, the year and the open incident within the 5 seconds of
   * AUN-WEB-5.
   */
  interface Props {
    /** The route id: `incidents`, `incidents.year`, `incidents.new` or `incidents.incident`. */
    route: string;
    /** The values of the address: `year`, `incident`. */
    params: Record<string, string>;
    /** The admitted query of the address: `at` of an earlier state, `stage` of the tab. */
    query?: Record<string, string>;
    /** Opens an address inside the app; `replace` takes the place of the current one in the history. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
  }

  let { route, params, query = {}, onnavigate }: Props = $props();

  // The parts of the address as values: a change of the tab (`stage`) gives the view a new `query` and must not read the
  // incident again, so everything that decides a read depends on these and never on the objects.
  let yearId = $derived(params.year);
  let incidentId = $derived(params.incident);
  let at = $derived(query.at);

  let years = $state<IncidentYears | null>(null);
  let list = $state<IncidentYearList | null>(null);
  let incident = $state<IncidentRead | null>(null);
  let schemas = $state<CategorySchema | null>(null);
  let revisions = $state<{ list: Revision[]; truncated: boolean } | null>(null);
  let revisionsFailed = $state(false);
  /** The address names a year that does not exist. */
  let yearMissing = $state(false);
  /** The address names an incident that does not exist, or an earlier state that does not; it goes with the address. */
  let incidentMissing = $state(false);
  let missing = $derived(yearMissing || incidentMissing);
  /** The person may not read the year, or the incident. */
  let yearForbidden = $state(false);
  let incidentForbidden = $state(false);

  /** The loads of the view; each keeps its own failure, so one that succeeds never hides another that failed. */
  type Load = 'years' | 'year' | 'incident' | 'schema';
  let failures = $state<Partial<Record<Load, string>>>({});
  let failure = $derived(Object.values(failures).find(Boolean) ?? null);

  function fail(load: Load, error: unknown) {
    failures = { ...failures, [load]: errorMessageKey(error) };
  }

  function succeed(load: Load) {
    if (!failures[load]) return;
    const rest = { ...failures };
    delete rest[load];
    failures = rest;
  }

  let schema = $derived(schemas?.kinds.find((entry) => entry.id === INCIDENT_KIND)?.schema ?? null);
  let canCreate = $derived(
    yearId !== undefined &&
      actionsOn($session, repositoryOf(yearId)).includes('edit') &&
      (years?.years.find((entry) => String(entry.year) === yearId)?.current ?? false),
  );

  /** What the person may do on the form of a new incident: it is made in the current year, by a person who may edit it. */
  let newAccess = $derived<'loading' | 'allowed' | 'right' | 'year'>(
    years === null
      ? 'loading'
      : !actionsOn($session, repositoryOf(yearId ?? '')).includes('edit')
        ? 'right'
        : years.years.find((entry) => String(entry.year) === yearId)?.current
          ? 'allowed'
          : 'year',
  );

  let latestYears = 0;

  /** Reads the years again: after a creation, a save or a completion, here or in another tab. */
  function reloadYears() {
    const read = ++latestYears;
    apiClient
      .getIncidentYears()
      .then((loaded) => {
        if (read !== latestYears) return;
        years = loaded;
        succeed('years');
      })
      .catch((error) => {
        if (read === latestYears) fail('years', error);
      });
  }

  let latestYear = 0;

  /** Reads the incidents of the year of the address again, without dropping the list shown. */
  async function reloadYear() {
    const year = yearId;
    if (!year) return;
    const read = ++latestYear;
    try {
      const loaded = await apiClient.getIncidentYear(year);
      if (read !== latestYear || String(loaded.year) !== yearId) return;
      list = loaded;
      yearForbidden = false;
      succeed('year');
    } catch (error) {
      if (read !== latestYear) return;
      if (isApiError(error) && error.outcome === 'NOT_FOUND') yearMissing = true;
      else if (isApiError(error) && error.outcome === 'FORBIDDEN') yearForbidden = true;
      else fail('year', error);
    }
  }

  let latestIncident = 0;

  async function readIncident() {
    const year = yearId;
    const id = incidentId;
    if (!year || !id) return;
    const read = ++latestIncident;
    try {
      const loaded = await apiClient.getIncident(year, id, at);
      if (read !== latestIncident) return;
      incident = loaded;
      incidentForbidden = false;
      succeed('incident');
      void readRevisions(year, loaded.id);
    } catch (error) {
      if (read !== latestIncident) return;
      if (isApiError(error) && (error.outcome === 'NOT_FOUND' || error.outcome === 'VALIDATION')) {
        incidentMissing = true;
      } else if (isApiError(error) && error.outcome === 'FORBIDDEN') {
        incidentForbidden = true;
      } else {
        fail('incident', error);
      }
    }
  }

  let latestRevisions = 0;

  async function readRevisions(year: string, id: string) {
    const read = ++latestRevisions;
    try {
      const answer = await apiClient.listRevisions(repositoryOf(year), id);
      if (read !== latestRevisions) return;
      revisions = { list: answer.revisions, truncated: answer.truncated };
      revisionsFailed = false;
    } catch {
      if (read === latestRevisions) revisionsFailed = true;
    }
  }

  onMount(() => {
    reloadYears();
    // A document of an incident repository that is created, saved or moved along its workflow changes the years, the list of
    // its year and the clock of the open incident; the open incident follows by its own sheet, which reads it again when the
    // stream names it.
    const stop = apiClient.subscribeEvents((event, data) => {
      const named = data as DocumentSavedEvent | null;
      if (!(LIFECYCLE_EVENTS as readonly string[]).includes(event)) return;
      if (!named || typeof named.repository !== 'string') return;
      if (!named.repository.startsWith('isms-incidents-')) return;
      reloadYears();
      void reloadYear();
    });
    return () => {
      stop();
      breadcrumb.set([]);
    };
  });

  // The year of the address. Another year drops the list of the last at once, so it never shows under the new one.
  $effect(() => {
    const year = yearId;
    untrack(() => {
      latestYear += 1;
      if (!year) {
        list = null;
        yearMissing = false;
        yearForbidden = false;
        succeed('year');
        return;
      }
      if (list !== null && String(list.year) === year) return;
      list = null;
      yearMissing = false;
      yearForbidden = false;
      void reloadYear();
    });
  });

  // The incident of the address (and its earlier state); another one drops the last at once.
  $effect(() => {
    const year = yearId;
    const id = incidentId;
    void at;
    untrack(() => {
      latestIncident += 1;
      latestRevisions += 1;
      incident = null;
      revisions = null;
      revisionsFailed = false;
      // An incident or an earlier state that was missing must not keep the page at "not found" for the next address,
      // nor after the person came back to the year (the year of the address did not change then); a missing year stays.
      incidentMissing = false;
      if (route === 'incidents.incident' && year && id) {
        incidentForbidden = false;
        void readIncident();
      } else {
        succeed('incident');
      }
    });
  });

  /** The number of the reads of the schema the person asked for again after one failed. */
  let schemaAttempt = $state(0);

  // The schema of the document type, for the forms of the stages.
  $effect(() => {
    void schemaAttempt;
    if (route !== 'incidents.incident' && route !== 'incidents.new') {
      untrack(() => succeed('schema'));
      return;
    }
    if (untrack(() => schemas) !== null) return;
    let live = true;
    apiClient
      .getCategorySchema(INCIDENT_CATEGORY)
      .then((answer) => {
        if (!live) return;
        schemas = answer;
        succeed('schema');
      })
      .catch((error) => {
        if (live) fail('schema', error);
      });
    return () => {
      live = false;
    };
  });

  const loading = $derived($t('common.loading'));

  let levels: Level[] = $derived.by(() => {
    const chain: Level[] = [
      {
        key: 'years',
        kind: 'incident',
        kindLabel: $t('lens.incidents'),
        title: $t('incidents.years.title'),
        href: INCIDENTS_ADDRESS,
      },
    ];
    if (yearId) {
      chain.push({
        key: `year:${yearId}`,
        kind: 'entry',
        kindLabel: $t('incidents.kind.year'),
        title: $t('incidents.year.title', { year: yearId }),
        href: yearAddress(yearId),
      });
    }
    if (route === 'incidents.new' && yearId) {
      chain.push({
        key: 'new',
        kind: 'incident',
        kindLabel: $t('incidents.kind.incident'),
        title: $t('incidents.new.title'),
        href: newAddress(yearId),
      });
    } else if (incidentId && yearId) {
      chain.push({
        key: `incident:${incidentId}`,
        kind: 'incident',
        kindLabel: $t('incidents.kind.incident'),
        title: incident?.title ?? loading,
        href: incidentAddress(yearId, incidentId),
      });
    }
    return chain;
  });

  $effect(() => {
    // An address that leads nowhere has no chain: the crumb must not stay at "Loading…".
    breadcrumb.set(
      missing ? [] : levels.slice(1).map((level) => ({ label: level.title, href: level.href })),
    );
  });

  // The sheet holds a table of notices and the forms of a stage: it keeps the room they need to stand as tables, and the
  // window hides a list column instead.
  let objectMin = $derived(
    route === 'incidents.incident' ? 860 : route === 'incidents.new' ? 780 : undefined,
  );
  /** The key of a sheet: another incident or another earlier state is another sheet, never an edited one. */
  let sheetKey = $derived(`${yearId}/${incidentId}@${at ?? ''}`);
</script>

{#if missing}
  <NotFoundView />
{:else}
  {#if failure}
    <div class="incidents__failure">
      <Notice tone="danger" title={$t(failure)} live />
    </div>
  {/if}
  {#snippet blocked()}
    <div class="incidents__forbidden" data-testid="incidents-forbidden">
      <Notice
        tone="info"
        title={$t('incidents.forbidden.title')}
        body={$t('incidents.forbidden.body')}
      />
    </div>
  {/snippet}
  <TriagePage
    {levels}
    {objectMin}
    stripLabel={$t('triage.strip')}
    returnLabel={$t('triage.return')}
    upLabel={(parent) => $t('triage.up', { title: parent.title })}
    announce={(object) => $t('triage.announce', { kind: object.kindLabel, title: object.title })}
    testId="incidents-view"
  >
    {#snippet column(level)}
      {#if level.key === 'years'}
        <YearsColumn {years} selected={yearId ?? null} />
      {:else if level.key.startsWith('year:')}
        {#if yearForbidden}
          {@render blocked()}
        {:else}
          <YearColumn {list} year={yearId ?? ''} selected={incidentId ?? null} {canCreate} />
        {/if}
      {:else if level.key === 'new'}
        <NewIncidentSheet
          year={yearId ?? ''}
          access={newAccess}
          {schema}
          {onnavigate}
          oncreated={() => {
            reloadYears();
            void reloadYear();
          }}
        />
      {:else if incidentForbidden}
        {@render blocked()}
      {:else if incident && schema}
        {#key sheetKey}
          <IncidentSheet
            {incident}
            {schema}
            stage={query.stage}
            revisions={revisions?.list ?? null}
            revisionsTruncated={revisions?.truncated ?? false}
            {revisionsFailed}
            onrefresh={() => void readIncident()}
            {onnavigate}
          />
        {/key}
      {:else}
        <Sheet><p class="muted">{$t('common.loading')}</p></Sheet>
      {/if}
    {/snippet}
  </TriagePage>
{/if}

<style>
  .incidents__failure,
  .incidents__forbidden {
    padding: var(--space-4) var(--space-6) 0;
  }

  .muted {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }
</style>
