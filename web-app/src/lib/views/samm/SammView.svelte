<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Notice from '../../components/Notice.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey } from '../../api/errors';
  import type {
    DocumentSavedEvent,
    SammAssessment,
    SammModel,
    SammModelList,
    SammScope,
    SammScopeList,
  } from '../../api/types';
  import { t } from '../../i18n';
  import { canEditSamm } from '../../samm/rights';
  import { findPractice } from '../../samm/scores';
  import { session } from '../../stores/app';
  import { loadModel } from '../../samm/store';
  import { breadcrumb } from '../../stores/breadcrumb';
  import TriagePage, { type Level } from '../../templates/TriagePage.svelte';
  import AssessmentListColumn from './AssessmentListColumn.svelte';
  import AssessmentSheet from './AssessmentSheet.svelte';
  import NewAssessmentSheet from './NewAssessmentSheet.svelte';
  import NewScopeSheet from './NewScopeSheet.svelte';
  import PracticeListColumn from './PracticeListColumn.svelte';
  import PracticeSheet from './PracticeSheet.svelte';
  import SammOverview from './SammOverview.svelte';
  import ScopeListColumn from './ScopeListColumn.svelte';
  import ScopeSheet from './ScopeSheet.svelte';

  /**
   * The SAMM lens (UC-SAMM-1 … UC-SAMM-6): the chain scope › assessment › practice as columns (`TriagePage`). The
   * scopes are always the first level; the object on the right is the overview of every scope, a scope, an
   * assessment with its maturity seal, or a practice as the workshop's sheet.
   *
   * Two addresses open a form instead of a record: `/samm/new` a new scope and `/samm/{scope}/new` a new assessment of the
   * scope; nothing is stored before the person creates it (rest-api.adoc, SAMM Requests, The Addresses).
   *
   * Data is read per address and again when the event stream reports a save to the open assessment or to the scope's
   * targets, a creation, or a transition (a submit or a release by someone else), so what another assessor did refreshes
   * in place within the 5 seconds of AUN-WEB-5.
   */
  interface Props {
    /** The values of the address: `scope`, `assessment`, `practice`. */
    params: Record<string, string>;
    /** The route id of the address: `samm.new` and `samm.assessment.new` are the forms; any other is a record. */
    route?: string;
    /** Opens an address inside the app; `replace` takes the place of the current one in the history. */
    onnavigate?: (href: string, options?: { replace?: boolean }) => void;
  }

  let { params, route = 'samm', onnavigate = (href) => apiClient.go(href) }: Props = $props();

  let isNewScope = $derived(route === 'samm.new');
  let isNewAssessment = $derived(route === 'samm.assessment.new');
  let canCreate = $derived(canEditSamm($session));

  let scopes = $state<SammScopeList | null>(null);
  let models = $state<SammModelList | null>(null);
  let scope = $state<SammScope | null>(null);
  let assessment = $state<SammAssessment | null>(null);
  let model = $state<SammModel | null>(null);

  /** The loads of the view; each keeps its own failure, so one that succeeds never hides another that failed. */
  type Load = 'scopes' | 'models' | 'scope' | 'model' | 'assessment';
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

  let summary = $derived(
    scope?.assessments.find((entry) => entry.id === params.assessment) ?? null,
  );
  let practiceEntry = $derived(
    model && params.practice ? findPractice(model, params.practice) : null,
  );

  /** The number of the latest read of the scopes; the answer of an older read is dropped. */
  let latestScopesRead = 0;

  /** Reads the scopes again: after a creation or a transition, here or in another tab. */
  function reloadScopes() {
    const read = ++latestScopesRead;
    apiClient
      .getSammScopes()
      .then((list) => {
        if (read !== latestScopesRead) return;
        scopes = list;
        succeed('scopes');
      })
      .catch((error) => {
        if (read === latestScopesRead) fail('scopes', error);
      });
  }

  /** The number of the latest read of the scope of the address; the answer of an older read is dropped. */
  let latestScopeRead = 0;

  /** Reads the scope of the address again, without dropping the one shown. */
  async function reloadScope() {
    const id = params.scope;
    if (!id) return;
    const read = ++latestScopeRead;
    try {
      const loaded = await apiClient.getSammScope(id);
      if (read === latestScopeRead && loaded.id === params.scope) {
        scope = loaded;
        succeed('scope');
      }
    } catch (error) {
      if (read === latestScopeRead) fail('scope', error);
    }
  }

  onMount(() => {
    reloadScopes();
    // The pinned model versions: a new scope and a new assessment choose among them.
    apiClient
      .getSammModels()
      .then((list) => {
        models = list;
        succeed('models');
      })
      .catch((error) => fail('models', error));
    // A save to the document of the address is read again, also while its first read is still under way: the reads
    // are ordered, so the newer snapshot wins.
    const stop = apiClient.subscribeEvents((event, data) => {
      const saved = data as DocumentSavedEvent;
      if (saved?.repository !== 'samm-assessments') return;
      if (event === 'document-saved' && summary && saved.id === summary.document) {
        void reloadAssessment(saved.id);
      } else if (event === 'document-saved' && scope && saved.id === scope.document) {
        // The roadmap of the scope was saved by someone else.
        void reloadScope();
      } else if (event === 'document-created') {
        // A scope or an assessment was created, here or in another tab: the lists follow.
        reloadScopes();
        void reloadScope();
      } else if (event === 'document-transitioned') {
        // A submit or a release, by someone else or here: the state of the assessment, of its scope (the open
        // assessment, the trend) and of the lists follow, whichever sheet is open.
        reloadScopes();
        void reloadScope();
        if (summary && saved.id === summary.document) void reloadAssessment(saved.id);
      }
    });
    return () => {
      stop();
      breadcrumb.set([]);
    };
  });

  // The scope of the address. Another scope drops the records of the last one at once, so its data never shows
  // under the new address, whether the new one loads or fails.
  $effect(() => {
    const id = params.scope;
    if (!id) {
      scope = null;
      succeed('scope');
      return;
    }
    if (untrack(() => scope?.id) === id) return;
    scope = null;
    assessment = null;
    let current = true;
    apiClient
      .getSammScope(id)
      .then((loaded) => {
        if (!current) return;
        scope = loaded;
        succeed('scope');
      })
      .catch((error) => {
        if (current) fail('scope', error);
      });
    return () => {
      current = false;
    };
  });

  // The model the scope's assessments are taken with.
  $effect(() => {
    const version = summary?.modelVersion ?? scope?.modelVersion;
    if (!version || untrack(() => model?.version) === version) return;
    let current = true;
    loadModel(version)
      .then((loaded) => {
        if (!current) return;
        model = loaded;
        succeed('model');
      })
      .catch((error) => {
        if (current) fail('model', error);
      });
    return () => {
      current = false;
    };
  });

  // The assessment of the address; another one drops the last at once.
  $effect(() => {
    const id = summary?.document;
    if (!id) {
      assessment = null;
      return;
    }
    if (untrack(() => assessment?.id) === id) return;
    assessment = null;
    void reloadAssessment(id);
  });

  /** The number of the latest read of the assessment; the answer of an older read is dropped. */
  let latestRead = 0;

  async function reloadAssessment(id: string) {
    const read = ++latestRead;
    try {
      const loaded = await apiClient.getSammAssessment(id);
      if (read !== latestRead || summary?.document !== loaded.id) return;
      assessment = loaded;
      succeed('assessment');
    } catch (error) {
      if (read === latestRead) fail('assessment', error);
    }
  }

  /** After an act changed the assessment (a submit): its scope is read again too, so the list shows its new state. */
  async function reloadAfterChange() {
    if (!assessment || !params.scope) return;
    const id = assessment.id;
    await reloadScope();
    await reloadAssessment(id);
  }

  const loading = $derived($t('common.loading'));

  let levels: Level[] = $derived.by(() => {
    const chain: Level[] = [
      {
        key: 'samm',
        kind: 'samm',
        kindLabel: $t('lens.samm'),
        title: $t('samm.scopes.title'),
        href: '/samm',
      },
    ];
    if (isNewScope) {
      chain.push({
        key: 'new-scope',
        kind: 'scope',
        kindLabel: $t('kind.scope'),
        title: $t('samm.new.scope.title'),
        href: '/samm/new',
      });
      return chain;
    }
    if (!params.scope) {
      chain.push({
        key: 'overview',
        kind: 'samm',
        kindLabel: $t('lens.samm'),
        title: $t('samm.overview.title'),
        href: '/samm',
      });
      return chain;
    }
    chain.push({
      key: `scope:${params.scope}`,
      kind: 'scope',
      kindLabel: $t('kind.scope'),
      title: scope?.title ?? loading,
      href: `/samm/${params.scope}`,
    });
    if (isNewAssessment) {
      chain.push({
        key: 'new-assessment',
        kind: 'assessment',
        kindLabel: $t('kind.assessment'),
        title: $t('samm.new.assessment.title'),
        href: `/samm/${params.scope}/new`,
      });
      return chain;
    }
    if (params.assessment) {
      chain.push({
        key: `assessment:${params.assessment}`,
        kind: 'assessment',
        kindLabel: $t('kind.assessment'),
        title: summary?.title ?? loading,
        href: `/samm/${params.scope}/${params.assessment}`,
      });
    }
    if (params.practice) {
      chain.push({
        key: `practice:${params.practice}`,
        kind: 'practice',
        kindLabel: $t('kind.practice'),
        title: practiceEntry?.practice.name ?? loading,
        href: `/samm/${params.scope}/${params.assessment}/${params.practice}`,
      });
    }
    return chain;
  });

  $effect(() => {
    breadcrumb.set(
      levels
        .slice(1)
        .filter((level) => level.key !== 'overview')
        .map((level) => ({
          label: level.title,
          href: level.href,
        })),
    );
  });

  let objectMin = $derived(
    params.practice ? 820 : params.assessment || isNewScope || isNewAssessment ? 780 : undefined,
  );
</script>

{#if failure}
  <div class="samm__failure">
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
  testId="samm-view"
>
  {#snippet column(level, { object })}
    {#if level.key === 'samm'}
      <ScopeListColumn {scopes} selected={params.scope ?? null} {canCreate} />
    {:else if level.key === 'overview'}
      <SammOverview {scopes} {models} {canCreate} />
    {:else if level.key === 'new-scope'}
      <NewScopeSheet {models} {canCreate} {onnavigate} oncreated={reloadScopes} />
    {:else if level.key === 'new-assessment'}
      <NewAssessmentSheet
        {scope}
        {models}
        {canCreate}
        {onnavigate}
        oncreated={() => {
          reloadScopes();
          void reloadScope();
        }}
      />
    {:else if level.kind === 'scope'}
      {#if object}
        <ScopeSheet
          {scope}
          {models}
          onsaved={() => void reloadScope()}
          onrefresh={() => void reloadScope()}
        />
      {:else}
        <AssessmentListColumn {scope} selected={params.assessment ?? null} />
      {/if}
    {:else if level.kind === 'assessment'}
      {#if object}
        <AssessmentSheet {scope} {assessment} {model} onchanged={() => void reloadAfterChange()} />
      {:else}
        <PracticeListColumn {scope} {assessment} {model} selected={params.practice ?? null} />
      {/if}
    {:else if level.kind === 'practice'}
      <PracticeSheet
        {scope}
        {assessment}
        {model}
        practiceId={params.practice}
        onsaved={() => {
          if (assessment) void reloadAssessment(assessment.id);
        }}
        onrefresh={() => {
          // A refusal that names a release (`DOCUMENT_RELEASED`) changed the scope's open assessment too.
          void reloadAfterChange();
        }}
      />
    {/if}
  {/snippet}
</TriagePage>

<style>
  .samm__failure {
    padding: var(--space-4) var(--space-6) 0;
  }
</style>
