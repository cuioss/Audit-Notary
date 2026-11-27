<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Chip from '../../components/Chip.svelte';
  import HistoryList from '../../components/HistoryList.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import ReasonBadge from '../../components/ReasonBadge.svelte';
  import SaveState from '../../components/SaveState.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import type {
    DocumentTransition,
    JsonObject,
    JsonSchema,
    OtmMitigation,
    OtmThreat,
    Revision,
    ThreatModelRead,
  } from '../../api/types';
  import { actionsOn, fieldLabel, kindName, transitionName } from '../../documents/categories';
  import { DocumentController, type DocumentSnapshot } from '../../documents/controller.svelte';
  import { documentHistory, versionOfTag } from '../../documents/history';
  import { saveLabel } from '../../documents/saveLabel';
  import { isWithin } from '../../forms/fieldErrors';
  import SchemaForm from '../../forms/SchemaForm.svelte';
  import { formatDate, formatDateTime, formatTime } from '../../format';
  import { currentLocale, messagesStore, t } from '../../i18n';
  import { intervalMonths, statusTone } from '../../reports/reports';
  import StepUpDialog from '../../stepup/StepUpDialog.svelte';
  import { session } from '../../stores/app';
  import { now } from '../../stores/clock';
  import {
    addMonths,
    componentNames,
    DATA_PART,
    describeList,
    isDiagramUrl,
    MODEL_PART,
    mitigationsOf,
    modelAddress,
    modelSchemaOf,
    omitProperties,
    pickProperties,
    releaseAddress,
    rowErrors,
    saveRank,
    splitPointer,
    THREAT_CATEGORY,
    THREAT_KIND,
    THREAT_REPOSITORY,
    threatsOf,
  } from '../../threats/model';
  import ConflictPanel from '../documents/ConflictPanel.svelte';
  import RevisionPicker from '../documents/RevisionPicker.svelte';
  import TransitionBar from '../documents/TransitionBar.svelte';
  import { stateTone } from '../samm/workflow';
  import CountermeasureEditor from './CountermeasureEditor.svelte';
  import ThreatTable from './ThreatTable.svelte';

  /**
   * A threat model as a sheet (UC-TM-2, AUN-TM-1 to AUN-TM-4): the review, the generated diagram, the threats with their
   * status, the countermeasures, the data of the model, the steps of the workflow, and in the margin the save state, the
   * signed history, the release and the earlier states.
   *
   * The document has two parts, the data of the document (the owner and the review date) and the file of the model; the
   * sheet keeps one document controller for each, so each part has its own draft, blob and conflicts, and "Save for
   * everyone" saves both. The lists of the file (`/threats`, `/mitigations`) are changed and saved as wholes, and a conflict
   * is decided per list. The sheet reads nothing itself: the view hands it the read and reads it again when the sheet
   * asks (`onrefresh`).
   */
  interface Props {
    /** The model as read: the current state, or with `at` an earlier one. */
    model: ThreatModelRead;
    /** The schema of the document type (`kinds[n].schema`). */
    schema: JsonSchema;
    /** The revisions of the document, newest first; `null` while loading or when they could not be listed. */
    revisions: Revision[] | null;
    /** Whether the server holds more revisions than the list. */
    revisionsTruncated?: boolean;
    /** Whether listing the revisions failed. */
    revisionsFailed?: boolean;
    /** Called when the view should read the model again: after a save, a step, a release meanwhile. */
    onrefresh: () => void;
    /** Opens an address inside the app. */
    onnavigate: (href: string) => void;
  }

  let {
    model,
    schema,
    revisions,
    revisionsTruncated = false,
    revisionsFailed = false,
    onrefresh,
    onnavigate,
  }: Props = $props();

  let announcement = $state('');
  let busy = $state<string | null>(null);
  let askSave = $state<DocumentTransition | null>(null);
  let missingShown = $state(true);
  let confirming = $state<{ act: string; lede: string }>({ act: '', lede: '' });
  let modelForm: SchemaForm | undefined = $state();
  let dataForm: SchemaForm | undefined = $state();
  let statusEl: HTMLElement | undefined = $state();
  let threatsEl: HTMLElement | undefined = $state();
  let mitigationsEl: HTMLElement | undefined = $state();

  let rights = $derived(actionsOn($session, THREAT_REPOSITORY));
  let reading = $derived(model.at ?? null);
  let canEdit = $derived(rights.includes('edit') && reading === null);
  let modelPart = $derived(model.parts[MODEL_PART]);
  let dataPart = $derived(model.parts[DATA_PART]);
  let modelSchema = $derived(modelSchemaOf(schema));
  /** The form of the file: what is neither a table of its own (threats, countermeasures) nor the version of the format. */
  let modelFormSchema = $derived(
    modelSchema ? omitProperties(modelSchema, ['otmVersion', 'threats', 'mitigations']) : null,
  );
  let dataSchema = $derived(pickProperties(schema, ['owner', 'last-review']));
  let address = $derived(modelAddress(model.service.id, model.model));
  let releaseHref = $derived(releaseAddress(model.service.id, model.model));

  // The two controllers of the two parts. The step-up handler is the model's: no save or step of a threat model asks for
  // a confirmation (rest-api.adoc, Threat Model Requests), and a release has its own page.
  const modelController = new DocumentController({
    repository: untrack(() => model.repository),
    onsaved: () => onrefresh(),
    onrefresh: () => onrefresh(),
    onremote: ({ by }) => {
      announcement = $t('documents.saved-by-other', { name: by.name });
    },
  });
  const dataController = new DocumentController({
    repository: untrack(() => model.repository),
    stepUp: modelController.stepUp,
    onsaved: () => onrefresh(),
    onrefresh: () => onrefresh(),
    onremote: ({ by }) => {
      announcement = $t('documents.saved-by-other', { name: by.name });
    },
  });
  const restored = untrack(() => (canEdit && !model.frozen ? model.draft : null));

  $effect.pre(() => {
    const shared = {
      document: model.id,
      draft: canEdit && !model.frozen ? model.draft : null,
      frozen: model.frozen || reading !== null,
      canEdit,
    };
    const next: DocumentSnapshot = {
      ...shared,
      part: MODEL_PART,
      blob: modelPart?.blob ?? '',
      savedBy: modelPart?.savedBy ?? null,
      value: modelPart?.value,
    };
    const data: DocumentSnapshot = {
      ...shared,
      part: DATA_PART,
      blob: dataPart?.blob ?? '',
      savedBy: dataPart?.savedBy ?? null,
      value: dataPart?.value,
    };
    untrack(() => {
      modelController.sync(next);
      dataController.sync(data);
    });
  });

  // An earlier state never changes; the current one is read again when the stream names it.
  onMount(() => (reading ? undefined : modelController.watch()));
  onDestroy(() => {
    modelController.destroy();
    dataController.destroy();
  });

  let value = $derived(modelController.value);
  let threats = $derived(threatsOf(value));
  let mitigations = $derived(mitigationsOf(value));
  let dirty = $derived(modelController.dirty || dataController.dirty);
  let open = $derived(modelController.open + dataController.open);
  let missingPointers = $derived([...modelController.missing, ...dataController.missing]);
  $effect(() => {
    if (missingPointers.length > 0) missingShown = true;
  });
  let missing = $derived(
    missingPointers.map((pointer) => ({
      pointer,
      label: fieldLabel(
        $messagesStore,
        THREAT_CATEGORY,
        THREAT_KIND,
        splitPointer(pointer).pointer,
      ),
    })),
  );
  let readonly = $derived(modelController.readonly);
  let switchedByRight = $derived(modelController.readonlyReason === 'right');
  let frozen = $derived(modelController.readonlyReason === 'frozen' && reading === null);

  /** The controller whose state the margin tells: the one with the most pressing news. */
  let lead = $derived(
    saveRank(dataController.saveState) > saveRank(modelController.saveState)
      ? dataController
      : modelController,
  );
  let saveWaits = $derived(
    dirty ||
      open > 0 ||
      lead.saveState === 'saving' ||
      lead.saveState === 'failed' ||
      lead.saveState === 'conflict',
  );
  let failure = $derived(
    missingPointers.length > 0 ||
      (frozen && (modelController.releasedMeanwhile ?? dataController.releasedMeanwhile) !== null)
      ? null
      : (modelController.failure ?? dataController.failure),
  );
  let shownConflicts = $derived(
    Object.fromEntries(
      [modelController, dataController].flatMap((controller) =>
        Object.entries(controller.conflicts).map(([pointer, conflict]) => [
          pointer,
          Object.hasOwn(controller.edits, pointer)
            ? { ...conflict, own: controller.edits[pointer] }
            : conflict,
        ]),
      ),
    ),
  );
  let locked = $derived(modelController.locked);
  let reopened = $derived(modelController.reopened ?? dataController.reopened);
  let remote = $derived(modelController.remote ?? dataController.remote);
  let draftStale = $derived(modelController.draftStale || dataController.draftStale);

  let readonlyLabel = $derived.by(() => {
    if (!readonly) return null;
    if (reading) return $t('documents.read-only.revision');
    return switchedByRight ? $t('documents.read-only.right') : $t('documents.read-only.frozen');
  });
  let label = $derived(
    readonlyLabel ??
      (lead.saveState === 'conflict'
        ? $t('documents.save.conflict', { count: open })
        : saveLabel(lead, $t, $currentLocale, null)),
  );

  /** The errors of the part `model` that belong to no table of the sheet: the form of the model shows them. */
  let modelFormErrors = $derived(
    modelController.errors === null
      ? null
      : modelController.errors.filter(
          (error) =>
            !isWithin('/threats', error.pointer) && !isWithin('/mitigations', error.pointer),
        ),
  );
  let threatErrors = $derived(rowErrors(modelController.errors, '/threats'));
  let mitigationErrors = $derived(rowErrors(modelController.errors, '/mitigations'));

  /** @returns the words of a step of the workflow */
  function actOf(transition: DocumentTransition): string {
    return transition.release
      ? $t('release.act')
      : transitionName($messagesStore, THREAT_CATEGORY, transition.id);
  }

  /** Saves for everyone: the file of the model and the data of the document, each as the signed commit of its part. */
  async function persist() {
    confirming = {
      act: $t('documents.save'),
      lede: $t('stepup.lede.save', { title: model.title }),
    };
    await modelController.save();
    await dataController.save();
  }

  async function save() {
    if (busy !== null) return;
    await persist();
  }

  async function run(transition: DocumentTransition) {
    busy = transition.id;
    confirming = {
      act: actOf(transition),
      lede: $t('documents.stepup.lede', { act: actOf(transition), title: model.title }),
    };
    try {
      const result = await modelController.transition(transition);
      if (result.kind === 'unsaved') {
        askSave = transition;
      } else if (result.kind === 'transitioned') {
        askSave = null;
        announcement = $t('documents.transition.done', {
          title: model.title,
          state: $t(`workflow.${result.state}`),
        });
      }
    } finally {
      busy = null;
    }
  }

  /** The person takes a step: with changes only they have, it asks to save first. */
  async function act(transition: DocumentTransition) {
    if (busy !== null) return;
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

  function goToField(pointer: string) {
    const { part, pointer: inner } = splitPointer(pointer);
    if (part === DATA_PART) {
      dataForm?.focusField(inner);
    } else if (isWithin('/threats', inner)) {
      threatsEl?.focus();
    } else if (isWithin('/mitigations', inner)) {
      mitigationsEl?.focus();
    } else {
      modelForm?.focusField(inner);
    }
  }

  function backToEditing() {
    missingShown = false;
    const first = missingPointers[0];
    if (first) goToField(first);
  }

  /** Changes the lists of the file: a list is sent as a whole, and the one that came back to what is saved is no change. */
  function setLists(next: { threats?: OtmThreat[]; mitigations?: OtmMitigation[] }) {
    modelController.setValue({ ...modelController.value, ...(next as JsonObject) });
  }

  /** The act of starting the review: the review date becomes today (an edit of the model does not change it). */
  function startReview() {
    dataController.setValue({ ...dataController.value, 'last-review': model.review.today });
    announcement = $t('threats.review.started', {
      date: formatDate(model.review.today, $currentLocale),
    });
  }

  let version = $derived(versionOfTag(model.release?.tag ?? ''));
  let stateLabel = $derived(
    model.state === 'released' && model.release
      ? $t('workflow.released-as', { version })
      : $t(`workflow.${model.state}`),
  );
  let stepUpLines = $derived(
    reading
      ? []
      : [
          ...new Set(
            model.transitions
              .filter((transition) => transition.stepUp && rights.includes(transition.right))
              .map((transition) =>
                transition.release
                  ? $t('release.check.step-up')
                  : $t('documents.transition.step-up'),
              ),
          ),
        ],
  );
  let facts = $derived([
    { term: $t('threats.fact.service'), value: model.service.name },
    { term: $t('documents.fact.version'), value: String(model.version) },
    ...(modelPart
      ? [
          {
            term: $t('documents.fact.saved'),
            value: $t('documents.fact.saved.value', {
              name: modelPart.savedBy.name,
              when: formatDateTime(modelPart.savedAt, $currentLocale),
            }),
          },
        ]
      : []),
  ]);

  // The review: the review of the last release, and what a review date that is typed and not yet released would make due.
  let review = $derived(model.review);
  let months = $derived(intervalMonths(review.reviewIntervals[review.protectionNeed]));
  let workingReview = $derived(
    typeof dataController.value['last-review'] === 'string'
      ? (dataController.value['last-review'] as string)
      : null,
  );
  let nextDue = $derived(
    workingReview !== null && months !== null && workingReview !== review.lastReview
      ? addMonths(workingReview, months)
      : null,
  );
  let startReason = $derived(
    workingReview === review.today ? $t('threats.review.start.done') : null,
  );

  let diagramAlt = $derived(
    $t('threats.diagram.alt', {
      title: model.title,
      components: componentNames(value).join(', '),
      count: componentNames(value).length,
    }),
  );
  let diagramSource = $derived(
    model.diagram && isDiagramUrl(model.diagram.dataUrl) ? model.diagram : null,
  );
</script>

<Sheet testId="threat-model-sheet" marginLabel={$t('sheet.margin')}>
  <SheetHead
    kind="threat-model"
    kindLabel={kindName($messagesStore, THREAT_CATEGORY, THREAT_KIND)}
    title={model.title}
    size="title"
    {facts}
  >
    {#snippet state()}
      <StatusLabel tone={stateTone(model.state)} label={stateLabel} testId="document-state" />
    {/snippet}
  </SheetHead>

  <StepUpDialog
    handler={modelController.stepUp}
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
  {:else if model.state === 'released' && canEdit}
    <div class="notice" data-testid="released-notice">
      <Notice
        tone="info"
        title={$t('documents.released.title', { version })}
        body={$t('documents.released.body', { next: model.version + 1 })}
      />
    </div>
  {/if}
  {#if reopened}
    <div class="notice" data-testid="reopened-notice">
      <Notice
        tone="success"
        title={$t('documents.reopened.title', { version: reopened.version })}
        body={$t('documents.reopened.body')}
        live
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
    conflicts={shownConflicts}
    category={THREAT_CATEGORY}
    kind={THREAT_KIND}
    {locked}
    describe={(pointer, side) => describeList(pointer, side, $t)}
    onresolve={(pointer, keep) =>
      (Object.hasOwn(modelController.conflicts, pointer)
        ? modelController
        : dataController
      ).resolve(pointer, keep)}
    ondecided={() => statusEl?.querySelector<HTMLElement>('button, [aria-disabled]')?.focus()}
  />

  {#if !reading}
    <TransitionBar
      category={THREAT_CATEGORY}
      transitions={model.transitions}
      {rights}
      {releaseHref}
      {busy}
      primary={!saveWaits}
      {askSave}
      missing={missingShown ? missing : []}
      onact={(transition) => void act(transition)}
      onsavefirst={() => void saveFirst()}
      ongo={goToField}
      onback={backToEditing}
    />
  {/if}

  <section class="part" aria-labelledby="tm-review" data-testid="review-section">
    <h2 class="part__title" id="tm-review">{$t('threats.review.title')}</h2>
    <dl class="facts" data-testid="review-facts">
      <div>
        <dt>{$t('threats.review.last')}</dt>
        <dd>
          {#if review.lastReview}
            {formatDate(review.lastReview, $currentLocale)}
            <span class="meta">
              {$t('reports.threat.days-ago', { count: review.daysSinceReview ?? 0 })}
            </span>
          {:else}
            {$t('reports.threat.no-review')}
          {/if}
        </dd>
      </div>
      <div>
        <dt>{$t('threats.review.due')}</dt>
        <dd>
          {#if review.status === 'overdue'}
            <ReasonBadge
              tone="danger"
              label={$t('reports.due.overdue', { count: -(review.dueInDays ?? 0) })}
              testId="review-status"
            />
          {:else if review.status === 'due-soon'}
            <ReasonBadge
              tone="attention"
              label={$t('reports.due.soon', { count: review.dueInDays ?? 0 })}
              testId="review-status"
            />
          {:else}
            <StatusLabel
              tone={statusTone(review.status)}
              label={$t(`reports.threat.status.${review.status}`)}
              testId="review-status"
            />
          {/if}
          {#if review.reviewDue}
            <span class="meta">{formatDate(review.reviewDue, $currentLocale)}</span>
          {/if}
        </dd>
      </div>
      <div>
        <dt>{$t('threats.review.interval')}</dt>
        <dd>
          {#if months !== null}
            {$t('reports.threat.interval', { months })}
          {/if}
          <span class="meta">
            {$t('threats.review.need', { need: $t(`reports.need.${review.protectionNeed}`) })}
          </span>
        </dd>
      </div>
    </dl>
    {#if !readonly}
      <div class="review-act">
        <Button
          icon="state.clock"
          onclick={startReview}
          disabledReason={startReason}
          data-testid="start-review"
        >
          {$t('threats.review.start')}
        </Button>
        <p class="meta">{$t('threats.review.start.hint')}</p>
      </div>
    {/if}
    <SchemaForm
      bind:this={dataForm}
      schema={dataSchema}
      category={THREAT_CATEGORY}
      kind={THREAT_KIND}
      value={dataController.value}
      readonly={dataController.locked}
      errors={dataController.errors}
      showMissing={dataController.missing.length > 0}
      headingLevel={3}
      onchange={(next) => dataController.setValue(next)}
      testId="data-form"
    />
    {#if nextDue}
      <p class="meta" data-testid="review-next-due">
        {$t('threats.review.next-due', { date: formatDate(nextDue, $currentLocale) })}
      </p>
    {/if}
  </section>

  <section class="part" aria-labelledby="tm-diagram" data-testid="diagram-section">
    <h2 class="part__title" id="tm-diagram">{$t('threats.diagram.title')}</h2>
    {#if diagramSource}
      <figure class="diagram">
        <img
          class="diagram__image"
          src={diagramSource.dataUrl}
          alt={diagramAlt}
          width={diagramSource.width}
          height={diagramSource.height}
          data-testid="diagram-image"
        />
      </figure>
    {:else}
      <p class="meta" data-testid="diagram-none">{$t('threats.diagram.none')}</p>
    {/if}
  </section>

  <section
    class="part"
    aria-labelledby="tm-threats"
    tabindex="-1"
    bind:this={threatsEl}
    data-testid="threats-section"
  >
    <h2 class="part__title" id="tm-threats">{$t('threats.title')}</h2>
    <p class="meta" data-testid="threat-counts">
      {$t('threats.counts', {
        total: model.threats.total,
        open: model.threats.open,
        untreated: model.threats.untreated,
        transferred: model.threats.transferred,
      })}
    </p>
    <ThreatTable
      {threats}
      {mitigations}
      readonly={locked}
      errors={threatErrors}
      onchange={(nextThreats, nextMitigations) =>
        setLists({ threats: nextThreats, mitigations: nextMitigations })}
    />
  </section>

  <section
    class="part"
    aria-labelledby="tm-mitigations"
    tabindex="-1"
    bind:this={mitigationsEl}
    data-testid="mitigations-section"
  >
    <h2 class="part__title" id="tm-mitigations">{$t('threats.mitigation.title')}</h2>
    <CountermeasureEditor
      {mitigations}
      {threats}
      readonly={locked}
      errors={mitigationErrors}
      onchange={(next) => setLists({ mitigations: next })}
    />
  </section>

  {#if modelFormSchema}
    <section class="part" aria-labelledby="tm-model" data-testid="model-section">
      <h2 class="part__title" id="tm-model">{$t('threats.model.title')}</h2>
      <SchemaForm
        bind:this={modelForm}
        schema={modelFormSchema}
        category={THREAT_CATEGORY}
        kind={THREAT_KIND}
        {value}
        readonly={locked}
        errors={modelFormErrors}
        showMissing={modelController.missing.length > 0}
        headingLevel={3}
        onchange={(next) => modelController.setValue(next)}
        testId="model-form"
      />
    </section>
  {/if}
  <p class="sr-only" role="status" aria-live="polite">{announcement}</p>

  {#snippet status()}
    <div class="status" bind:this={statusEl}>
      <SaveState state={readonly ? 'read-only' : lead.saveState} {label} testId="save-state" />
      {#if !readonly}
        <Button
          variant={saveWaits || model.transitions.length === 0 ? 'primary' : 'secondary'}
          icon="act.save"
          busy={lead.saveState === 'saving'}
          onclick={() => void save()}
          disabledReason={open > 0
            ? $t('documents.save.resolve-first', { count: open })
            : busy !== null && lead.saveState !== 'saving'
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
      {#if model.release}
        <section class="margin__block" data-testid="release-block">
          <h2 class="margin__title">{$t('documents.margin.release')}</h2>
          <p class="margin__text">
            {$t('sheet.released-by', {
              name: model.release.by.name,
              date: formatDate(model.release.at, $currentLocale),
            })}
          </p>
          <Chip value={model.release.tag} label={$t('sheet.tag')} />
        </section>
      {/if}
      {#if model.releaseRequest}
        <section class="margin__block" data-testid="release-request">
          <h2 class="margin__title">{$t('documents.margin.request')}</h2>
          <p class="margin__text">
            {$t('documents.request.by', {
              name: model.releaseRequest.by.name,
              date: formatDate(model.releaseRequest.at, $currentLocale),
            })}
          </p>
          <p class="margin__comment">{model.releaseRequest.comment}</p>
        </section>
      {/if}
      <section class="margin__block">
        <h2 class="margin__title">{$t('documents.revision.title')}</h2>
        <RevisionPicker
          category={THREAT_CATEGORY}
          document={model.id}
          {revisions}
          truncated={revisionsTruncated}
          failed={revisionsFailed}
          {reading}
          {onnavigate}
          addressFor={(ref) => modelAddress(model.service.id, model.model, ref ?? undefined)}
        />
      </section>
      <section class="margin__block">
        <h2 class="margin__title">{$t('sheet.history')}</h2>
        <HistoryList
          entries={documentHistory(model.history, $t, $currentLocale, $now)}
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

  .part__title {
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
    font-weight: var(--weight-semibold);
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-4) var(--space-6);
  }

  .facts dt {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  .facts dd {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .review-act {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .diagram {
    margin: 0;
  }

  .diagram__image {
    display: block;
    max-inline-size: 100%;
    block-size: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
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
