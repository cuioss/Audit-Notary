<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import SaveState from '../../components/SaveState.svelte';
  import ScoreMeter from '../../components/ScoreMeter.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import TrendLine from '../../components/TrendLine.svelte';
  import { apiClient } from '../../api/client';
  import type {
    JsonObject,
    SammModel,
    SammModelList,
    SammScope,
    SammTarget,
    SammTrend,
  } from '../../api/types';
  import { DocumentController, type DocumentSnapshot } from '../../documents/controller.svelte';
  import LeaveGuard from '../../documents/LeaveGuard.svelte';
  import { saveLabel } from '../../documents/saveLabel';
  import { formatDate } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { TARGET_KEYS } from '../../samm/fieldKeys';
  import { canEditSamm } from '../../samm/rights';
  import { formatScore } from '../../samm/scores';
  import { loadModel } from '../../samm/store';
  import { targetErrorsOf } from '../../samm/targets';
  import StepUpDialog from '../../stepup/StepUpDialog.svelte';
  import { session } from '../../stores/app';
  import TargetsEditor from './TargetsEditor.svelte';
  import { stateTone } from './workflow';

  /**
   * A scope as a sheet (AUN-SAMM-2, AUN-SAMM-6, UC-SAMM-1): its subject, the trend of its released assessments, the
   * assessments in order and its targets — the roadmap — practice by practice. The targets are edited here and saved for
   * everyone like a document, as the part `targets` (rest-api.adoc, SAMM Requests, A Scope and Its Targets): a scope has
   * no draft, so what is typed stays on the page until it is saved, and leaving asks. The act that starts an assessment
   * stands in the head; it says why when it cannot be taken (one is open already, no model version is pinned, no right).
   */
  interface Props {
    scope: SammScope | null;
    /** The pinned model versions, for the act that starts an assessment; `null` while they are read. */
    models?: SammModelList | null;
    /** Called after the targets were saved for everyone, so the view reads the scope again. */
    onsaved?: () => void;
    /** Called when the view should read the scope again: a save answered with a refusal that names a newer version. */
    onrefresh?: () => void;
  }

  let { scope, models = null, onsaved, onrefresh }: Props = $props();

  let model = $state<SammModel | null>(null);
  let failed = $state(false);
  let trend = $state<SammTrend | null>(null);
  /** The scope the trend belongs to. */
  let trendOf: string | null = null;
  let announcement = $state('');

  let canEdit = $derived(canEditSamm($session));

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

  // The trend of the scope: the released assessments of one model version, read again when the scope changes (a release).
  $effect(() => {
    const id = scope?.id;
    // The assessments are what a release changes: the trend follows them.
    const released = scope?.assessments.filter((entry) => entry.state === 'released').length ?? 0;
    if (!id) {
      trend = null;
      trendOf = null;
      return;
    }
    let current = true;
    void released;
    // Another scope: the trend of the last one goes at once, so it never stands under this scope's name.
    if (trendOf !== id) {
      trend = null;
      trendOf = id;
    }
    apiClient
      .getSammTrend(id)
      .then((loaded) => {
        if (current) trend = loaded;
      })
      .catch(() => {
        if (current) trend = null;
      });
    return () => {
      current = false;
    };
  });

  const controller = new DocumentController({
    repository: 'samm-assessments',
    keys: TARGET_KEYS,
    // A scope has no draft: its targets stay on the page until they are saved for everyone.
    drafts: false,
    releasedOnce: true,
    onsaved: () => onsaved?.(),
    onrefresh: () => onrefresh?.(),
    onremote: ({ by }) => {
      announcement = $t('samm.targets.saved-by-other', { name: by.name });
    },
  });

  // The roadmap belongs to one scope: when the scope changes the controller starts fresh. It runs before the sheet is
  // drawn, so the first draw already knows the rights and the loaded version.
  $effect.pre(() => {
    const part = scope?.parts?.targets;
    const next: DocumentSnapshot | null = scope
      ? {
          document: scope.document,
          part: 'targets',
          blob: part?.blob ?? '',
          savedBy: part?.savedBy ?? null,
          value: scope.targets as unknown as JsonObject,
          frozen: false,
          canEdit,
        }
      : null;
    untrack(() => controller.sync(next));
  });

  onDestroy(() => controller.destroy());

  let targets = $derived(controller.value as unknown as Record<string, SammTarget>);
  let errors = $derived(targetErrorsOf(controller.errors, ''));
  let readonly = $derived(controller.locked);
  let open = $derived(scope?.assessments.find((entry) => entry.state !== 'released') ?? null);
  let startReason = $derived(
    !canEdit
      ? $t('samm.scope.start.no-right')
      : models !== null && models.models.length === 0
        ? $t('samm.scope.start.no-model')
        : open
          ? $t('samm.scope.start.open', { title: open.title })
          : null,
  );
  let label = $derived.by(() => {
    switch (controller.saveState) {
      case 'changed':
        return $t('samm.targets.save.changed');
      case 'conflict':
        return $t('samm.targets.save.conflict', { count: controller.open });
      case 'failed':
        return controller.draftRefused
          ? $t('samm.targets.save.invalid')
          : $t('samm.targets.save.failed');
      default:
        return saveLabel(
          controller,
          $t,
          $currentLocale,
          readonly ? $t('samm.targets.read-only') : null,
        );
    }
  });

  /** @param entry the target of a practice @returns its text: the maturity and the day, or none */
  function describe(entry: unknown): string {
    const target = entry as SammTarget | null | undefined;
    if (!target) return $t('samm.targets.none');
    return target.due
      ? $t('samm.targets.described-due', {
          target: formatScore(target.target, $currentLocale),
          due: formatDate(target.due, $currentLocale),
        })
      : formatScore(target.target, $currentLocale);
  }

  /** @param key the key of a conflict, `/<practice>` @returns the name of the practice */
  function practiceName(key: string): string {
    const id = key.slice(1);
    return (
      model?.functions.flatMap((fn) => fn.practices).find((practice) => practice.id === id)?.name ??
      id
    );
  }

  let released = $derived(trend?.points ?? []);
</script>

<LeaveGuard dirty={() => controller.dirty} />

{#if scope === null}
  <Sheet><p class="muted">{$t('common.loading')}</p></Sheet>
{:else}
  <Sheet testId="scope-sheet" marginLabel={$t('sheet.margin')}>
    <SheetHead
      kind="scope"
      kindLabel={$t('kind.scope')}
      title={scope.title}
      lede={$t(`samm.subject.lede.${scope.subject.kind}`, { name: scope.subject.name })}
      facts={[
        { term: $t('samm.fact.model'), value: `${$t('samm.model.name')} ${scope.modelVersion}` },
        { term: $t('samm.fact.assessments'), value: String(scope.assessments.length) },
      ]}
    >
      {#snippet actions()}
        {#if startReason}
          <Button disabledReason={startReason} data-testid="start-assessment">
            {$t('samm.scope.start')}
          </Button>
        {:else}
          <Link href="/samm/{scope.id}/new" look="secondary" data-testid="start-assessment">
            {$t('samm.scope.start')}
          </Link>
        {/if}
      {/snippet}
    </SheetHead>

    <StepUpDialog
      handler={controller.stepUp}
      lede={$t('stepup.lede.save', { title: scope.title })}
      actLabel={$t('samm.targets.save')}
      icon="act.save"
      testId="scope"
    />

    {#if released.length > 1}
      <section class="section">
        <h2 class="section__title">{$t('samm.scope.trend')}</h2>
        <TrendLine
          points={released.map((entry) => ({
            label: entry.title,
            value: entry.overall,
            text: formatScore(entry.overall, $currentLocale),
          }))}
          max={3}
          label={$t('samm.scope.trend-label', { title: scope.title })}
        />
        {#if trend && trend.omitted > 0}
          <p class="section__note" data-testid="trend-omitted">
            {$t('samm.scope.trend-omitted', {
              count: trend.omitted,
              version: trend.modelVersion ?? '',
            })}
          </p>
        {/if}
      </section>
    {/if}

    <section class="section">
      <h2 class="section__title">{$t('samm.scope.assessments')}</h2>
      {#if scope.assessments.length === 0}
        <p class="section__lede" data-testid="assessments-none">
          {$t('samm.scope.assessments-none')}
        </p>
      {/if}
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

    <!-- The refusal stands at the targets it is about, not above the trend: the rows it marks are below. -->
    {#if controller.failure}
      <div class="notice" data-testid="targets-failure">
        <Notice tone="danger" title={$t(controller.failure)} live />
      </div>
    {/if}

    {#if model}
      <section class="section" aria-labelledby="targets-title">
        <h2 class="section__title" id="targets-title">{$t('samm.scope.targets')}</h2>
        <p class="section__lede">{$t('samm.scope.targets-lede')}</p>
        {#if controller.open > 0}
          <div class="notice">
            <Notice
              tone="attention"
              title={$t('samm.targets.conflict.title', { count: controller.open })}
              body={$t('samm.targets.conflict.body')}
              live
            />
          </div>
        {/if}
        {#each Object.entries(controller.conflicts) as [key, conflict] (key)}
          <div class="conflict" data-testid="conflict-target-{key.slice(1)}">
            <p class="conflict__text">
              {$t('samm.targets.conflict.field', {
                name: conflict.by.name,
                practice: practiceName(key),
                other: describe(conflict.other),
                own: describe(conflict.own),
              })}
            </p>
            <div class="conflict__acts">
              <Button
                onclick={() => controller.resolve(key, 'own')}
                disabledReason={controller.locked ? $t('practice.conflict.locked') : null}
              >
                {$t('practice.conflict.keep-own')}
              </Button>
              <Button
                onclick={() => controller.resolve(key, 'other')}
                disabledReason={controller.locked ? $t('practice.conflict.locked') : null}
              >
                {$t('samm.targets.conflict.take-other', { name: conflict.by.name })}
              </Button>
            </div>
          </div>
        {/each}
        <TargetsEditor
          {model}
          {targets}
          {readonly}
          {errors}
          onchange={(next) => controller.setValue(next as unknown as JsonObject)}
          testId="targets"
        />
      </section>
    {:else if failed}
      <section class="section">
        <Notice tone="danger" title={$t('error.unexpected')} live />
      </section>
    {/if}
    <p class="sr-only" role="status" aria-live="polite">{announcement}</p>

    {#snippet status()}
      <div class="status">
        <SaveState
          state={readonly && controller.saveState === 'clean' ? 'read-only' : controller.saveState}
          {label}
          testId="save-state"
        />
        {#if canEdit}
          <Button
            variant="primary"
            icon="act.save"
            busy={controller.saveState === 'saving'}
            onclick={() => void controller.save()}
            disabledReason={controller.open > 0
              ? $t('practice.save.resolve-first', { count: controller.open })
              : controller.dirty
                ? null
                : $t('practice.save.nothing')}
            data-testid="save-targets"
          >
            {$t('samm.targets.save')}
          </Button>
        {/if}
      </div>
    {/snippet}

    {#snippet margin()}
      <div class="margin">
        {#if canEdit}
          <p class="margin__note">{$t('samm.targets.note')}</p>
        {/if}
        {#if scope.parts.targets}
          <section class="margin__block">
            <h2 class="margin__title">{$t('samm.targets.saved')}</h2>
            <p class="margin__text">
              {$t('samm.targets.saved-by', {
                name: scope.parts.targets.savedBy.name,
                date: formatDate(scope.parts.targets.savedAt, $currentLocale, 'long'),
              })}
            </p>
          </section>
        {/if}
      </div>
    {/snippet}
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

  .section__note {
    margin-block-start: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .notice {
    margin-block: var(--space-8) var(--space-4);
  }

  .section__lede {
    max-inline-size: var(--measure);
    margin-block-end: var(--space-4);
    color: var(--color-text-secondary);
  }

  .entries {
    list-style: none;
    container-type: inline-size;
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

  .conflict {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-block-end: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-attention);
    border-radius: var(--radius-md);
    background-color: var(--color-attention-subtle);
    max-inline-size: 44rem;
  }

  .conflict__text {
    font-size: var(--text-sm);
  }

  .conflict__acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .status {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    align-items: center;
    gap: var(--space-3);
  }

  .status :global(.btn-with-reason) {
    max-inline-size: none;
    align-items: stretch;
  }

  .status :global(.btn) {
    inline-size: 100%;
  }

  .status :global(.btn__reason) {
    text-align: start;
  }

  .margin {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .margin__block {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .margin__title {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  .margin__note,
  .margin__text {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }

  /* The sheet's own width decides, not the screen's: beside the list column the sheet is narrow on a tablet. */
  @container (max-width: 40rem) {
    .entry {
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }
</style>
