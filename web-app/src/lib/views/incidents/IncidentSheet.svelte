<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Chip from '../../components/Chip.svelte';
  import DeadlineClock from '../../components/DeadlineClock.svelte';
  import HistoryList from '../../components/HistoryList.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import SaveState from '../../components/SaveState.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import StageTabs from '../../components/StageTabs.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import { apiClient } from '../../api/client';
  import type { DocumentTransition, IncidentRead, JsonSchema, Revision } from '../../api/types';
  import { stepUpMethodOf } from '../../access/access';
  import { actionsOn, kindName, transitionName } from '../../documents/categories';
  import { DocumentController, type DocumentSnapshot } from '../../documents/controller.svelte';
  import { versionOfTag } from '../../documents/history';
  import { saveLabel } from '../../documents/saveLabel';
  import { formatDate, formatDateTime, formatTime } from '../../format';
  import { currentLocale, messagesStore, t } from '../../i18n';
  import { incidentHistory } from '../../incidents/history';
  import {
    allStagesDone,
    clockRow,
    DATA_PART,
    defaultStage,
    INCIDENT_CATEGORY,
    INCIDENT_KIND,
    incidentAddress,
    knownStage,
    openStages,
    releaseAddress,
    stageTabs,
    SUBMIT_TRANSITION,
  } from '../../incidents/model';
  import { StageActs } from '../../incidents/stageActs.svelte';
  import StepUpDialog from '../../stepup/StepUpDialog.svelte';
  import { StepUpHandler } from '../../stepup/stepUp';
  import { saveRank } from '../../threats/model';
  import { session, status as appStatus } from '../../stores/app';
  import { now } from '../../stores/clock';
  import ConflictPanel from '../documents/ConflictPanel.svelte';
  import RevisionPicker from '../documents/RevisionPicker.svelte';
  import TransitionBar from '../documents/TransitionBar.svelte';
  import { stateTone } from '../samm/workflow';
  import ReportPreview from './ReportPreview.svelte';
  import StagePanel from './StagePanel.svelte';

  /**
   * An incident as a sheet (UC-IR-1, UC-IR-2, UC-IR-3): the head with the state and the facts, the deadline clock, the
   * stages as tabs with the form of the selected one, the steps of the workflow, the report, and in the margin the save
   * state, the release, the earlier states and the signed history.
   *
   * The document has one part for the title and one for each stage; the sheet keeps a document controller for each, so each
   * part has its own draft, blob and conflicts, and "Save for everyone" saves every part that changed. Completing and
   * reopening a stage go through the sheet's step-up handler, which the review stage asks. The sheet reads nothing itself:
   * the view hands it the read and reads it again when the sheet asks (`onrefresh`).
   */
  interface Props {
    /** The incident as read: the current state, or with `at` an earlier one. */
    incident: IncidentRead;
    /** The schema of the document type (`kinds[n].schema`). */
    schema: JsonSchema;
    /** The stage of the address, which selects the tab. */
    stage?: string;
    /** The revisions of the document, newest first; `null` while loading or when they could not be listed. */
    revisions: Revision[] | null;
    /** Whether the server holds more revisions than the list. */
    revisionsTruncated?: boolean;
    /** Whether listing the revisions failed. */
    revisionsFailed?: boolean;
    /** Called when the view should read the incident again: after a save, a step, a release meanwhile. */
    onrefresh: () => void;
    /** Opens an address inside the app; `replace` takes the place of the current one in the history. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
  }

  let {
    incident,
    schema,
    stage: stageQuery,
    revisions,
    revisionsTruncated = false,
    revisionsFailed = false,
    onrefresh,
    onnavigate,
  }: Props = $props();

  const PANEL = 'incident-stage-panel';

  let announcement = $state('');
  let busy = $state<string | null>(null);
  let askSave = $state<DocumentTransition | null>(null);
  let askStage = $state<string | null>(null);
  let confirming = $state<{ act: string; lede: string }>({ act: '', lede: '' });
  let showReport = $state(false);
  let panel: StagePanel | undefined = $state();
  let statusEl: HTMLElement | undefined = $state();
  /** The blob ids the saves of this sheet left, which a completion right after names as the part it signs off. */
  let fresh = $state<Record<string, string>>({});

  let rights = $derived(actionsOn($session, incident.repository));
  let reading = $derived(incident.at ?? null);
  let canEdit = $derived(rights.includes('edit') && reading === null);
  let address = $derived(incidentAddress(incident.year, incident.id));
  let releaseHref = $derived(releaseAddress(incident.year, incident.id));
  let stepUpOn = $derived(stepUpMethodOf($appStatus) !== 'off');

  /** The parts of the document: the title and one for each stage. */
  const parts = untrack(() => [DATA_PART, ...incident.stages.map((entry) => entry.part)]);

  // The step-up handler is the sheet's: every part saves through it, and so do the steps and the completion of a stage. With
  // the identity provider the changes of every part are kept as their draft before the app leaves.
  const stepUp = new StepUpHandler(apiClient, undefined, async () => {
    await Promise.all(Object.values(controllers).map((c) => (c.dirty ? c.keepDraft(true) : null)));
  });
  const controllers: Record<string, DocumentController> = {};
  for (const part of parts) {
    controllers[part] = new DocumentController({
      repository: untrack(() => incident.repository),
      stepUp,
      releasedOnce: true,
      onsaved: (answer) => {
        const blob = answer.parts?.[part]?.blob;
        if (blob) fresh = { ...fresh, [part]: blob };
        onrefresh();
      },
      onrefresh: () => onrefresh(),
      onremote: ({ by }) => {
        announcement = $t('documents.saved-by-other', { name: by.name });
      },
    });
  }
  const titleController = controllers[DATA_PART];
  const all = Object.values(controllers);
  const acts = new StageActs({
    repository: untrack(() => incident.repository),
    document: untrack(() => incident.id),
    stepUp,
    onchanged: () => onrefresh(),
  });
  const restored = untrack(() => (canEdit && !incident.frozen ? incident.draft : null));

  $effect.pre(() => {
    const read = incident;
    const editable = canEdit && !read.frozen;
    untrack(() => {
      fresh = {};
      for (const part of parts) {
        const data = read.parts[part];
        const own = read.stages.find((entry) => entry.part === part);
        const snapshot: DocumentSnapshot = {
          document: read.id,
          part,
          blob: data?.blob ?? '',
          savedBy: data?.savedBy ?? null,
          value: data?.value,
          draft: editable ? read.draft : null,
          // A completed stage is read-only until it is reopened; the title is never a stage.
          frozen: read.frozen || reading !== null || own?.status === 'completed',
          canEdit,
        };
        controllers[part].sync(snapshot);
      }
    });
  });

  // An earlier state never changes; the current one is read again when the stream names it.
  onMount(() => (reading ? undefined : titleController.watch()));
  onDestroy(() => all.forEach((controller) => controller.destroy()));

  let stages = $derived(incident.stages);
  let names = $derived(
    Object.fromEntries(
      stages.map((entry) => [entry.id, $t(`category.${INCIDENT_CATEGORY}.stage.${entry.id}`)]),
    ),
  );
  /**
   * The tab an address without a stage opens, found once when the sheet opens: a completion, or a read that brings the work
   * of someone else, never moves the person to another tab by itself.
   */
  const opened = untrack(() => defaultStage(incident.stages));
  let selectedId = $derived(
    knownStage(stageQuery, stages) ??
      knownStage(opened ?? undefined, stages) ??
      defaultStage(stages) ??
      '',
  );
  let selected = $derived(stages.find((entry) => entry.id === selectedId) ?? null);

  let dirty = $derived(all.some((controller) => controller.dirty));
  let open = $derived(all.reduce((sum, controller) => sum + controller.open, 0));
  let readonly = $derived(titleController.readonly);
  let frozen = $derived(incident.frozen && reading === null);
  let lead = $derived(
    all.reduce((lead, controller) =>
      saveRank(controller.saveState) > saveRank(lead.saveState) ? controller : lead,
    ),
  );
  let saveWaits = $derived(
    dirty ||
      open > 0 ||
      lead.saveState === 'saving' ||
      lead.saveState === 'failed' ||
      lead.saveState === 'conflict',
  );
  let remote = $derived(all.map((controller) => controller.remote).find(Boolean) ?? null);
  let draftStale = $derived(all.some((controller) => controller.draftStale));
  /** The failure of a step or of the title: a failure of a stage's part is told in the panel of the stage. */
  let failure = $derived(titleController.failure);

  let readonlyLabel = $derived.by(() => {
    if (!readonly) return null;
    if (reading) return $t('documents.read-only.revision');
    return rights.includes('edit')
      ? $t('incidents.read-only.frozen')
      : $t('documents.read-only.right');
  });
  let label = $derived(
    readonlyLabel ??
      (lead.saveState === 'conflict'
        ? $t('documents.save.conflict', { count: open })
        : saveLabel(lead, $t, $currentLocale, null)),
  );

  let tabs = $derived(
    stageTabs(
      stages,
      $t,
      Object.fromEntries(
        stages.flatMap((entry) => {
          const controller = controllers[entry.part];
          if (controller.open > 0) return [[entry.id, $t('incidents.stage.conflict')]];
          if (controller.saveState === 'failed')
            return [[entry.id, $t('incidents.stage.not-saved')]];
          return [];
        }),
      ),
    ),
  );

  /** The instant the clock is told against: the present while the incident is worked on, the release or revision once not. */
  let clockAt = $derived(incident.frozen || reading ? new Date(incident.asOf) : $now);
  let rows = $derived(
    incident.deadlines.map((deadline) =>
      clockRow(deadline, clockAt, $t, (instant) => formatDateTime(instant, $currentLocale)),
    ),
  );
  let clockUnanswered = $derived(stages.some((entry) => entry.unanswered));

  let version = $derived(versionOfTag(incident.release?.tag ?? ''));
  let stateLabel = $derived(
    incident.state === 'released' && incident.release
      ? $t('workflow.released-as', { version })
      : $t(`workflow.${incident.state}`),
  );
  let stepUpLines = $derived(
    reading
      ? []
      : [
          ...new Set(
            incident.transitions
              .filter(
                (transition) => transition.stepUp && rights.includes(transition.right) && stepUpOn,
              )
              .map(() => $t('release.check.step-up')),
          ),
        ],
  );
  let facts = $derived.by(() => {
    const triage = incident.parts.triage?.value ?? {};
    const response = incident.parts.response?.value ?? {};
    const aware = typeof triage['aware-at'] === 'string' ? triage['aware-at'] : null;
    const resolved = typeof response['resolved-at'] === 'string' ? response['resolved-at'] : null;
    return [
      ...(aware
        ? [{ term: $t('incidents.fact.aware'), value: formatDateTime(aware, $currentLocale) }]
        : []),
      ...(resolved
        ? [{ term: $t('incidents.fact.resolved'), value: formatDateTime(resolved, $currentLocale) }]
        : []),
      { term: $t('documents.fact.version'), value: String(incident.version) },
    ];
  });

  /** @returns the blob a stage's sign-off names: what this sheet saved last, else what was read */
  function blobOf(part: string): string | null {
    return fresh[part] ?? incident.parts[part]?.blob ?? null;
  }

  /** @returns the words of a step of the workflow */
  function actOf(transition: DocumentTransition): string {
    return transition.release
      ? $t('release.act')
      : transitionName($messagesStore, INCIDENT_CATEGORY, transition.id);
  }

  /** Saves for everyone: every part that changed, each as the signed commit of its part. */
  async function persist() {
    confirming = {
      act: $t('documents.save'),
      lede: $t('stepup.lede.save', { title: incident.title }),
    };
    for (const part of parts) {
      const controller = controllers[part];
      const waiting = controller.dirty && !controller.locked && controller.open === 0;
      await controller.save();
      // A save the person cancelled, or that left for the identity provider, changed nothing: the next part would ask the
      // same question again, so the rest waits for the next press.
      if (waiting && controller.dirty && controller.saveState === 'changed') break;
    }
  }

  async function save() {
    if (busy !== null || acts.busy !== null) return;
    await persist();
  }

  async function run(transition: DocumentTransition) {
    busy = transition.id;
    confirming = {
      act: actOf(transition),
      lede: $t('documents.stepup.lede', { act: actOf(transition), title: incident.title }),
    };
    try {
      const result = await titleController.transition(transition);
      if (result.kind === 'unsaved') {
        askSave = transition;
      } else if (result.kind === 'transitioned') {
        askSave = null;
        announcement = $t('documents.transition.done', {
          title: incident.title,
          state: $t(`workflow.${result.state}`),
        });
      }
    } finally {
      busy = null;
    }
  }

  /** The person takes a step of the workflow: with changes only they have, it asks to save first. */
  async function act(transition: DocumentTransition) {
    if (busy !== null || acts.busy !== null) return;
    if (dirty) {
      askSave = transition;
      return;
    }
    askSave = null;
    await run(transition);
  }

  async function saveFirst() {
    const transition = askSave;
    if (!transition || busy !== null) return;
    busy = transition.id;
    try {
      await persist();
    } finally {
      busy = null;
    }
    if (dirty || lead.saveState !== 'saved') return;
    askSave = null;
    await run(transition);
  }

  /** Why the incident cannot be submitted although the person may: a stage that applies is not completed. */
  function submitReason(transition: DocumentTransition): string | null {
    if (transition.release || transition.id !== SUBMIT_TRANSITION) return null;
    const waiting = openStages(stages);
    return allStagesDone(stages) || waiting.length === 0
      ? null
      : $t('incidents.submit.stages-open', {
          stages: waiting.map((entry) => names[entry.id] ?? entry.id).join(', '),
        });
  }

  /** Completes or reopens the selected stage; a completion acts on the saved part, so changes of the person go first. */
  async function takeAct() {
    const entry = selected;
    if (!entry || acts.busy !== null || busy !== null) return;
    const controller = controllers[entry.part];
    if (entry.status === 'open' && controller.dirty) {
      askStage = entry.id;
      return;
    }
    askStage = null;
    await runAct(entry.id);
  }

  async function runAct(id: string) {
    const entry = stages.find((candidate) => candidate.id === id);
    if (!entry) return;
    const name = names[entry.id] ?? entry.id;
    const completing = entry.status === 'open';
    confirming = {
      act: $t('incidents.stage.complete'),
      lede: $t('incidents.stage.step-up.lede', { stage: name, title: incident.title }),
    };
    const done = completing
      ? await acts.complete(entry, blobOf(entry.part))
      : await acts.reopen(entry, blobOf(entry.part));
    if (done) {
      announcement = $t(
        completing ? 'incidents.stage.done.complete' : 'incidents.stage.done.reopen',
        {
          stage: name,
        },
      );
    }
  }

  async function saveFirstStage() {
    const id = askStage;
    if (!id || busy !== null || acts.busy !== null) return;
    busy = id;
    try {
      await persist();
    } finally {
      busy = null;
    }
    const entry = stages.find((candidate) => candidate.id === id);
    if (!entry || controllers[entry.part].dirty || lead.saveState !== 'saved') return;
    askStage = null;
    await runAct(id);
  }

  // The refusal, the failure and the question to save first belong to the stage they were asked on: a link to another stage
  // (the stages that come first) or the way back in the history leaves them behind.
  $effect.pre(() => {
    void selectedId;
    untrack(() => {
      acts.clear();
      askStage = null;
    });
  });

  function choose(id: string) {
    acts.clear();
    askStage = null;
    onnavigate(incidentAddress(incident.year, incident.id, { stage: id, at: reading?.ref }), {
      replace: true,
    });
  }

  function goToField(pointer: string) {
    panel?.focusField(pointer);
  }

  function backToEditing() {
    const first = acts.refusal?.missing[0];
    acts.clear();
    if (first) goToField(first);
  }

  let stepUpLine = $derived(stepUpOn ? $t('incidents.stage.step-up') : null);
</script>

<Sheet testId="incident-sheet" marginLabel={$t('sheet.margin')}>
  <SheetHead
    kind="incident"
    kindLabel={kindName($messagesStore, INCIDENT_CATEGORY, INCIDENT_KIND)}
    title={incident.title}
    size="title"
    {facts}
  >
    {#snippet state()}
      <StatusLabel tone={stateTone(incident.state)} label={stateLabel} testId="document-state" />
    {/snippet}
  </SheetHead>

  <StepUpDialog
    handler={stepUp}
    lede={confirming.lede}
    actLabel={confirming.act}
    icon="act.save"
    testId="document"
  />

  {#if reading}
    <div class="notice" data-testid="revision-notice">
      <Notice
        tone="info"
        title={$t('documents.revision.reading.title')}
        body={$t('documents.revision.reading.body', {
          what:
            reading.kind === 'release'
              ? $t('documents.revision.kind.release', {
                  version: versionOfTag(reading.tag ?? reading.ref),
                })
              : $t(`documents.revision.kind.${reading.kind}`),
          name: reading.by.name,
          when: formatDateTime(reading.at, $currentLocale),
        })}
      >
        {#snippet actions()}
          <Link href={address}>{$t('documents.revision.back')}</Link>
        {/snippet}
      </Notice>
    </div>
  {:else if frozen}
    <div class="notice" data-testid="released-notice">
      <Notice
        tone="info"
        title={$t('documents.released.title', { version })}
        body={$t('incidents.released.body')}
      />
    </div>
  {/if}
  {#if restored && dirty}
    <div class="notice" data-testid="restored-notice">
      <Notice
        tone="info"
        title={$t('documents.draft.restored', {
          time: formatTime(restored.at, $currentLocale),
        })}
      />
    </div>
  {/if}
  {#if draftStale}
    <div class="notice" data-testid="stale-notice">
      <Notice tone="attention" title={$t('documents.draft.stale')} live />
    </div>
  {/if}
  {#if remote}
    <div class="notice" data-testid="remote-notice">
      <Notice tone="info" title={$t('documents.saved-by-other', { name: remote.name })} />
    </div>
  {/if}
  {#if failure}
    <div class="notice" data-testid="failure-notice">
      <Notice tone="danger" title={$t(failure)} live />
    </div>
  {/if}
  <ConflictPanel
    conflicts={titleController.conflicts}
    category={INCIDENT_CATEGORY}
    kind={`${INCIDENT_KIND}.${DATA_PART}`}
    locked={titleController.locked}
    onresolve={(pointer, keep) => titleController.resolve(pointer, keep)}
    ondecided={() => statusEl?.querySelector<HTMLElement>('button, [aria-disabled]')?.focus()}
  />

  {#if !reading}
    <TransitionBar
      category={INCIDENT_CATEGORY}
      transitions={incident.transitions}
      {rights}
      {releaseHref}
      {busy}
      primary={!saveWaits && allStagesDone(stages)}
      {askSave}
      missing={[]}
      onact={(transition) => void act(transition)}
      onsavefirst={() => void saveFirst()}
      ongo={goToField}
      onback={() => (askSave = null)}
      reasonFor={submitReason}
    />
  {/if}

  <section class="part" aria-labelledby="incident-clock" data-testid="clock-section">
    <h2 class="part__title" id="incident-clock">{$t('incidents.clock.title')}</h2>
    {#if rows.length === 0}
      <p class="meta" data-testid="clock-none">
        {$t(clockUnanswered ? 'incidents.clock.unanswered' : 'incidents.clock.none')}
      </p>
    {:else}
      <DeadlineClock label={$t('incidents.clock.label')} {rows} testId="deadline-clock" />
    {/if}
    {#if incident.frozen || reading}
      <p class="meta" data-testid="clock-stopped">
        {$t('incidents.clock.stopped', { when: formatDateTime(incident.asOf, $currentLocale) })}
      </p>
    {/if}
  </section>

  <section class="part" aria-labelledby="incident-stages" data-testid="stages-section">
    <h2 class="part__title" id="incident-stages">{$t('incidents.stages.title')}</h2>
    {#if selected}
      <StageTabs
        label={$t('incidents.stage.tabs')}
        {tabs}
        selected={selectedId}
        panel={PANEL}
        onselect={choose}
        testId="stage-tabs"
      />
      {#key selected.id}
        <StagePanel
          bind:this={panel}
          {incident}
          stage={selected}
          {schema}
          controller={controllers[selected.part]}
          {titleController}
          {acts}
          {names}
          panelId={PANEL}
          mayAct={canEdit && !incident.frozen}
          askSave={askStage === selected.id}
          stepUpLine={selected.stepUp ? stepUpLine : null}
          primary={!saveWaits}
          onact={() => void takeAct()}
          onsavefirst={() => void saveFirstStage()}
          onback={() => acts.clear()}
          ondecided={() => statusEl?.querySelector<HTMLElement>('button, [aria-disabled]')?.focus()}
        />
      {/key}
    {/if}
  </section>

  <section class="part" aria-labelledby="incident-report" data-testid="report-block">
    <h2 class="part__title" id="incident-report">{$t('incidents.report.title')}</h2>
    <p class="meta">{$t('incidents.report.lede')}</p>
    <div>
      <Button
        variant="secondary"
        icon="act.expand"
        onclick={() => (showReport = !showReport)}
        data-testid="report-toggle"
      >
        {showReport ? $t('incidents.report.hide') : $t('incidents.report.show')}
      </Button>
    </div>
    {#if showReport}
      <ReportPreview
        year={String(incident.year)}
        incident={incident.id}
        at={reading?.ref}
        stamp={`${incident.version}/${incident.asOf}/${Object.values(incident.parts)
          .map((part) => part.blob ?? '')
          .join(',')}/${incident.state}`}
      />
    {/if}
  </section>
  <p class="sr-only" role="status" aria-live="polite">{announcement}</p>

  {#snippet status()}
    <div class="status" bind:this={statusEl}>
      <SaveState state={readonly ? 'read-only' : lead.saveState} {label} testId="save-state" />
      {#if !readonly}
        <Button
          variant={saveWaits || incident.transitions.length === 0 ? 'primary' : 'secondary'}
          icon="act.save"
          busy={lead.saveState === 'saving'}
          onclick={() => void save()}
          disabledReason={open > 0
            ? $t('documents.save.resolve-first', { count: open })
            : (busy !== null || acts.busy !== null) && lead.saveState !== 'saving'
              ? $t('documents.save.step-running')
              : dirty
                ? null
                : $t('documents.save.nothing')}
          data-testid="save-everyone"
        >
          {$t('documents.save')}
        </Button>
      {/if}
    </div>
  {/snippet}

  {#snippet margin()}
    <div class="margin">
      {#if !readonly}
        <p class="margin__note">{$t('documents.save.note')}</p>
      {/if}
      {#each stepUpLines as line (line)}
        <p class="margin__note" data-testid="step-up-note">{line}</p>
      {/each}
      {#if incident.release}
        <section class="margin__block" data-testid="release-block">
          <h2 class="margin__title">{$t('documents.margin.release')}</h2>
          <p class="margin__text">
            {$t('sheet.released-by', {
              name: incident.release.by.name,
              date: formatDate(incident.release.at, $currentLocale),
            })}
          </p>
          <Chip value={incident.release.tag} label={$t('sheet.tag')} />
        </section>
      {/if}
      {#if incident.releaseRequest}
        <section class="margin__block" data-testid="release-request">
          <h2 class="margin__title">{$t('documents.margin.request')}</h2>
          <p class="margin__text">
            {$t('documents.request.by', {
              name: incident.releaseRequest.by.name,
              date: formatDate(incident.releaseRequest.at, $currentLocale),
            })}
          </p>
          <p class="margin__comment">{incident.releaseRequest.comment}</p>
        </section>
      {/if}
      <section class="margin__block">
        <h2 class="margin__title">{$t('documents.revision.title')}</h2>
        <RevisionPicker
          category={INCIDENT_CATEGORY}
          document={incident.id}
          {revisions}
          truncated={revisionsTruncated}
          failed={revisionsFailed}
          {reading}
          {onnavigate}
          addressFor={(ref) =>
            incidentAddress(incident.year, incident.id, {
              at: ref ?? undefined,
              stage: selectedId || undefined,
            })}
        />
      </section>
      <section class="margin__block">
        <h2 class="margin__title">{$t('sheet.history')}</h2>
        <HistoryList
          entries={incidentHistory(incident.history, $t, $currentLocale, $now, names)}
          label={$t('sheet.history')}
          testId="document-history"
        />
      </section>
    </div>
  {/snippet}
</Sheet>

<style>
  .notice {
    margin-block-end: var(--space-6);
  }

  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-block-start: var(--space-8);
    margin-block-start: var(--space-8);
    border-block-start: 1px solid var(--color-border);
  }

  /* The head of the sheet ends in a rule of its own: a part right under it does not draw a second one. */
  :global(.sheet-head) + :global(dialog) + .part {
    margin-block-start: 0;
    padding-block-start: 0;
    border-block-start: none;
  }

  .part__title {
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
    font-weight: var(--weight-semibold);
  }

  .meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
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
    align-items: stretch;
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

  .margin__text {
    color: var(--color-text-secondary);
  }

  .margin__comment {
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    padding-inline-start: var(--space-3);
    border-inline-start: 3px solid var(--color-border-strong);
    overflow-wrap: anywhere;
  }
</style>
