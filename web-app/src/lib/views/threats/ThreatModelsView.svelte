<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Notice from '../../components/Notice.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError } from '../../api/errors';
  import type {
    CategorySchema,
    DocumentSavedEvent,
    Revision,
    ThreatEvaluation,
    ThreatModelRead,
    ThreatModelService,
  } from '../../api/types';
  import { LIFECYCLE_EVENTS } from '../../api/types';
  import { actionsOn } from '../../documents/categories';
  import { t } from '../../i18n';
  import { session } from '../../stores/app';
  import { breadcrumb } from '../../stores/breadcrumb';
  import TriagePage, { type Level } from '../../templates/TriagePage.svelte';
  import {
    EVALUATION_ADDRESS,
    modelAddress,
    newAddress,
    serviceAddress,
    THREAT_CATEGORY,
    THREAT_KIND,
    THREAT_REPOSITORY,
  } from '../../threats/model';
  import NotFoundView from '../NotFoundView.svelte';
  import EvaluationColumn from './EvaluationColumn.svelte';
  import NewModelSheet from './NewModelSheet.svelte';
  import ServiceColumn from './ServiceColumn.svelte';
  import ThreatModelSheet from './ThreatModelSheet.svelte';

  /**
   * The lens Threat models (UC-TM-1, UC-TM-2, UC-TM-4): the chain evaluation › service › model as columns
   * (`TriagePage`). The evaluation of every service is always the first level (the table of the report, and the services
   * without a model with the act *New threat model*); the service lists its models; the model is the sheet. The address
   * `/threat-models/{service}/new` is the recipe wizard (the choice of the recipe, then its steps), and the release of a
   * model has a page of its own.
   *
   * Data is read per address and again when the event stream names a document of `threat-models`: a save, a step or a
   * creation by someone else refreshes the evaluation, the service and the open model within the 5 seconds of AUN-WEB-5.
   */
  interface Props {
    /** The route id: `threat-models`, `threat-models.service`, `threat-models.new` or `threat-models.model`. */
    route: string;
    /** The values of the address: `service`, `model`. */
    params: Record<string, string>;
    /** The admitted query of the address: `at` of an earlier state, `recipe` of the wizard. */
    query?: Record<string, string>;
    /** Opens an address inside the app; `replace` takes the place of the current one in the history. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
  }

  let { route, params, query = {}, onnavigate }: Props = $props();

  let evaluation = $state<ThreatEvaluation | null>(null);
  let forbidden = $state(false);
  let service = $state<ThreatModelService | null>(null);
  let model = $state<ThreatModelRead | null>(null);
  let schemas = $state<CategorySchema | null>(null);
  let revisions = $state<{ list: Revision[]; truncated: boolean } | null>(null);
  let revisionsFailed = $state(false);
  /** The address names a service or a model that does not exist (or an earlier state that does not). */
  let missing = $state(false);

  /** The loads of the view; each keeps its own failure, so one that succeeds never hides another that failed. */
  type Load = 'evaluation' | 'service' | 'model' | 'schema';
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

  let canCreate = $derived(actionsOn($session, THREAT_REPOSITORY).includes('edit'));
  let schema = $derived(schemas?.kinds.find((entry) => entry.id === THREAT_KIND)?.schema ?? null);

  /** The number of the latest read of the evaluation; the answer of an older read is dropped. */
  let latestEvaluation = 0;

  /** Reads the evaluation again: after a creation, a save or a step, here or in another tab. */
  function reloadEvaluation() {
    const read = ++latestEvaluation;
    apiClient
      .getThreatEvaluation()
      .then((loaded) => {
        if (read !== latestEvaluation) return;
        evaluation = loaded;
        forbidden = false;
        succeed('evaluation');
      })
      .catch((error) => {
        if (read !== latestEvaluation) return;
        if (isApiError(error) && error.outcome === 'FORBIDDEN') {
          forbidden = true;
          succeed('evaluation');
        } else {
          fail('evaluation', error);
        }
      });
  }

  /** The number of the latest read of the service; the answer of an older read is dropped. */
  let latestService = 0;

  /** Reads the service of the address again, without dropping the one shown. */
  async function reloadService() {
    const id = params.service;
    if (!id) return;
    const read = ++latestService;
    try {
      const loaded = await apiClient.getThreatModelService(id);
      if (read !== latestService || loaded.service.id !== params.service) return;
      service = loaded;
      succeed('service');
    } catch (error) {
      if (read !== latestService) return;
      if (isApiError(error) && error.outcome === 'NOT_FOUND') missing = true;
      else fail('service', error);
    }
  }

  /** The number of the latest read of the model; the answer of an older read is dropped. */
  let latestModel = 0;

  async function readModel() {
    const serviceId = params.service;
    const segment = params.model;
    if (!serviceId || !segment) return;
    const read = ++latestModel;
    try {
      const loaded = await apiClient.getThreatModel(serviceId, segment, query.at);
      if (read !== latestModel) return;
      model = loaded;
      succeed('model');
      void readRevisions(loaded.id);
    } catch (error) {
      if (read !== latestModel) return;
      if (isApiError(error) && (error.outcome === 'NOT_FOUND' || error.outcome === 'VALIDATION')) {
        missing = true;
      } else {
        fail('model', error);
      }
    }
  }

  let latestRevisions = 0;

  async function readRevisions(id: string) {
    const read = ++latestRevisions;
    try {
      const answer = await apiClient.listRevisions(THREAT_REPOSITORY, id);
      if (read !== latestRevisions) return;
      revisions = { list: answer.revisions, truncated: answer.truncated };
      revisionsFailed = false;
    } catch {
      if (read === latestRevisions) revisionsFailed = true;
    }
  }

  onMount(() => {
    reloadEvaluation();
    // A document of the threat models that is created, saved or moved along its workflow changes the evaluation and the
    // page of its service; the open model follows by its own sheet, which reads it again when the stream names it.
    const stop = apiClient.subscribeEvents((event, data) => {
      const named = data as DocumentSavedEvent | null;
      if (!(LIFECYCLE_EVENTS as readonly string[]).includes(event)) return;
      if (!named || named.repository !== THREAT_REPOSITORY) return;
      reloadEvaluation();
      void reloadService();
    });
    return () => {
      stop();
      breadcrumb.set([]);
    };
  });

  // The service of the address. Another service drops the data of the last at once, so it never shows under the new one.
  $effect(() => {
    const id = params.service;
    untrack(() => {
      latestService += 1;
      if (!id) {
        service = null;
        missing = false;
        succeed('service');
        return;
      }
      if (service?.service.id === id) return;
      service = null;
      missing = false;
      void reloadService();
    });
  });

  // The model of the address (and its earlier state); another one drops the last at once.
  $effect(() => {
    const serviceId = params.service;
    const segment = params.model;
    void query.at;
    untrack(() => {
      latestModel += 1;
      latestRevisions += 1;
      model = null;
      revisions = null;
      revisionsFailed = false;
      // A model or an earlier state that was missing must not keep the page at "not found" for the next address.
      missing = false;
      if (route !== 'threat-models.model' || !serviceId || !segment) {
        succeed('model');
        return;
      }
      // An earlier address of this view may have found nothing (a state that does not exist): the new one is read afresh.
      missing = false;
      void readModel();
    });
  });

  // The schema of the document type, for the sheet of a model and for the forms of the wizard.
  $effect(() => {
    if (route !== 'threat-models.model' && route !== 'threat-models.new') {
      untrack(() => succeed('schema'));
      return;
    }
    if (untrack(() => schemas) !== null) return;
    let live = true;
    apiClient
      .getCategorySchema(THREAT_CATEGORY)
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
        key: 'evaluation',
        kind: 'threat-model',
        kindLabel: $t('lens.threat-models'),
        title: $t('threats.evaluation.title'),
        href: EVALUATION_ADDRESS,
      },
    ];
    if (params.service) {
      chain.push({
        key: `service:${params.service}`,
        kind: 'entry',
        kindLabel: $t('threats.kind.service'),
        title: service?.service.name ?? loading,
        href: serviceAddress(params.service),
      });
    }
    if (route === 'threat-models.new' && params.service) {
      chain.push({
        key: 'new',
        kind: 'threat-model',
        kindLabel: $t('threats.kind.model'),
        title: $t('threats.new.title'),
        href: newAddress(params.service),
      });
    } else if (params.model && params.service) {
      chain.push({
        key: `model:${params.model}`,
        kind: 'threat-model',
        kindLabel: $t('threats.kind.model'),
        title: model?.title ?? loading,
        href: modelAddress(params.service, params.model),
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

  // The sheet of a model holds tables of four columns: it keeps the room they need to stand as tables, and the window hides a
  // list column instead (below 704 px of record a table stands as blocks, `DataTable`).
  let objectMin = $derived(
    route === 'threat-models.model' ? 1000 : route === 'threat-models.new' ? 780 : undefined,
  );
  /** The key of a sheet: another model or another earlier state is another sheet, never an edited one. */
  let sheetKey = $derived(`${params.service}/${params.model}@${query.at ?? ''}`);
</script>

{#if missing}
  <NotFoundView />
{:else}
  {#if failure}
    <div class="threats__failure">
      <Notice tone="danger" title={$t(failure)} live />
    </div>
  {/if}
  <TriagePage
    {levels}
    {objectMin}
    stripLabel={$t('triage.strip')}
    returnLabel={$t('triage.return')}
    upLabel={(parent) => $t('triage.up', { title: parent.title })}
    announce={(object) => $t('triage.announce', { kind: object.kindLabel, title: object.title })}
    testId="threat-models-view"
  >
    {#snippet column(level)}
      {#if level.key === 'evaluation'}
        <EvaluationColumn {evaluation} {forbidden} {canCreate} />
      {:else if level.key === 'new'}
        <NewModelSheet
          {service}
          recipe={query.recipe}
          {canCreate}
          {schema}
          {onnavigate}
          oncreated={() => {
            reloadEvaluation();
            void reloadService();
          }}
          onkept={() => void reloadService()}
        />
      {:else if level.key.startsWith('service:')}
        <ServiceColumn {service} selected={params.model ?? null} {canCreate} />
      {:else if model && schema}
        {#key sheetKey}
          <ThreatModelSheet
            {model}
            {schema}
            revisions={revisions?.list ?? null}
            revisionsTruncated={revisions?.truncated ?? false}
            {revisionsFailed}
            onrefresh={() => void readModel()}
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
  .threats__failure {
    padding: var(--space-4) var(--space-6) 0;
  }

  .muted {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }
</style>
