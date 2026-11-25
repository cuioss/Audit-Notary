<script lang="ts">
  import { onMount } from 'svelte';
  import Notice from '../../components/Notice.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey } from '../../api/errors';
  import type {
    DocumentSavedEvent,
    SammAssessment,
    SammModel,
    SammScope,
    SammScopeList,
  } from '../../api/types';
  import { t } from '../../i18n';
  import { findPractice } from '../../samm/scores';
  import { loadModel } from '../../samm/store';
  import { breadcrumb } from '../../stores/breadcrumb';
  import TriagePage, { type Level } from '../../templates/TriagePage.svelte';
  import AssessmentListColumn from './AssessmentListColumn.svelte';
  import AssessmentSheet from './AssessmentSheet.svelte';
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
   * Data is read per address and again when the event stream reports a save to the open assessment, so a practice
   * another assessor saved refreshes in place within the 5 seconds of AUN-WEB-5.
   */
  interface Props {
    /** The values of the address: `scope`, `assessment`, `practice`. */
    params: Record<string, string>;
  }

  let { params }: Props = $props();

  let scopes = $state<SammScopeList | null>(null);
  let scope = $state<SammScope | null>(null);
  let assessment = $state<SammAssessment | null>(null);
  let model = $state<SammModel | null>(null);
  let failure = $state<string | null>(null);

  let summary = $derived(
    scope?.assessments.find((entry) => entry.id === params.assessment) ?? null,
  );
  let practiceEntry = $derived(
    model && params.practice ? findPractice(model, params.practice) : null,
  );

  onMount(() => {
    apiClient
      .getSammScopes()
      .then((list) => (scopes = list))
      .catch((error) => (failure = errorMessageKey(error)));
    const stop = apiClient.subscribeEvents((event, data) => {
      const saved = data as DocumentSavedEvent;
      if (
        event === 'document-saved' &&
        saved?.repository === 'samm-assessments' &&
        assessment &&
        saved.id === assessment.id
      ) {
        void reloadAssessment(saved.id);
      }
    });
    return () => {
      stop();
      breadcrumb.set([]);
    };
  });

  // The scope of the address.
  $effect(() => {
    const id = params.scope;
    if (!id) {
      scope = null;
      return;
    }
    if (scope?.id === id) return;
    let current = true;
    failure = null;
    apiClient
      .getSammScope(id)
      .then((loaded) => {
        if (current) scope = loaded;
      })
      .catch((error) => {
        if (current) failure = errorMessageKey(error);
      });
    return () => {
      current = false;
    };
  });

  // The model the scope's assessments are taken with.
  $effect(() => {
    const version = summary?.modelVersion ?? scope?.modelVersion;
    if (!version || model?.version === version) return;
    loadModel(version)
      .then((loaded) => (model = loaded))
      .catch((error) => (failure = errorMessageKey(error)));
  });

  // The assessment of the address.
  $effect(() => {
    const id = summary?.document;
    if (!id) {
      assessment = null;
      return;
    }
    if (assessment?.id === id) return;
    void reloadAssessment(id);
  });

  async function reloadAssessment(id: string) {
    try {
      const loaded = await apiClient.getSammAssessment(id);
      if (summary?.document === loaded.id) assessment = loaded;
      failure = null;
    } catch (error) {
      failure = errorMessageKey(error);
    }
  }

  /** After an act changed the assessment (a submit): its scope is read again too, so the list shows its new state. */
  async function reloadAfterChange() {
    if (!assessment || !params.scope) return;
    const id = assessment.id;
    try {
      const loaded = await apiClient.getSammScope(params.scope);
      if (loaded.id === params.scope) scope = loaded;
    } catch (error) {
      failure = errorMessageKey(error);
    }
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

  let objectMin = $derived(params.practice ? 820 : params.assessment ? 780 : undefined);
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
      <ScopeListColumn {scopes} selected={params.scope ?? null} />
    {:else if level.key === 'overview'}
      <SammOverview {scopes} />
    {:else if level.kind === 'scope'}
      {#if object}
        <ScopeSheet {scope} />
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
      />
    {/if}
  {/snippet}
</TriagePage>

<style>
  .samm__failure {
    padding: var(--space-4) var(--space-6) 0;
  }
</style>
