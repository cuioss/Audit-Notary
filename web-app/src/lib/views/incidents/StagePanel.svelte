<script lang="ts">
  import Notice from '../../components/Notice.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import type { IncidentRead, IncidentStage, JsonSchema } from '../../api/types';
  import type { DocumentController } from '../../documents/controller.svelte';
  import SchemaForm from '../../forms/SchemaForm.svelte';
  import { formatDateTime } from '../../format';
  import {
    DATA_PART,
    INCIDENT_CATEGORY,
    partKind,
    partSchema,
    splitPointer,
    titleSchema,
  } from '../../incidents/model';
  import type { StageActs } from '../../incidents/stageActs.svelte';
  import { currentLocale, t } from '../../i18n';
  import ConflictPanel from '../documents/ConflictPanel.svelte';
  import NotificationsTable from './NotificationsTable.svelte';
  import ProtectionNeeds from './ProtectionNeeds.svelte';
  import StageActBar from './StageActBar.svelte';

  /**
   * The panel of one stage of an incident (UC-IR-1, UC-IR-2, UC-IR-3): under its name the guidance for the stage, who
   * signed it off, the form of its part (generated from the schema, `SchemaForm`), what only this stage knows (the title
   * and the derived protection needs of the triage, the table of the notices sent), and the act of the stage.
   *
   * A completed stage is read-only until it is reopened; a stage that does not apply keeps its data and says under which
   * condition it applies. The panel edits through the controller of the stage's part and holds no state of its own.
   */
  interface Props {
    /** The incident as read. */
    incident: IncidentRead;
    /** The stage. */
    stage: IncidentStage;
    /** The schema of the document type. */
    schema: JsonSchema;
    /** The controller of the stage's part. */
    controller: DocumentController;
    /** The controller of the part `data`, which holds the title. */
    titleController: DocumentController;
    /** The acts of the sheet. */
    acts: StageActs;
    /** The name of every stage, by id. */
    names: Record<string, string>;
    /** The id of the panel, which the tabs control. */
    panelId: string;
    /** Whether the person may complete and reopen. */
    mayAct: boolean;
    /** Whether the act of the stage waits for the save that comes first. */
    askSave: boolean;
    /** The line that says the person confirms their identity once more; `null` for a stage that asks for nothing. */
    stepUpLine: string | null;
    /** Whether the act of the stage carries the primary look. */
    primary: boolean;
    /** The person takes the act of the stage. */
    onact: () => void;
    /** The person saves, then takes the act. */
    onsavefirst: () => void;
    /** The person goes back to editing: the refusal closes. */
    onback: () => void;
    /** Called after the last conflict of the part was decided: where the keyboard goes on. */
    ondecided?: () => void;
  }

  let {
    incident,
    stage,
    schema,
    controller,
    titleController,
    acts,
    names,
    panelId,
    mayAct,
    askSave,
    stepUpLine,
    primary,
    onact,
    onsavefirst,
    onback,
    ondecided,
  }: Props = $props();

  const stageName = $derived(names[stage.id] ?? stage.id);
  const kind = $derived(partKind(stage.part));
  const formSchema = $derived(partSchema(schema, stage.part));
  const isTriage = $derived(stage.part === 'triage');
  let form: SchemaForm | undefined = $state();
  let titleForm: SchemaForm | undefined = $state();

  let refusal = $derived(acts.refusal?.stage === stage.id ? acts.refusal : null);
  let conflicts = $derived(
    Object.fromEntries(
      Object.entries(controller.conflicts).map(([pointer, conflict]) => [
        pointer,
        Object.hasOwn(controller.edits, pointer)
          ? { ...conflict, own: controller.edits[pointer] }
          : conflict,
      ]),
    ),
  );
  let failure = $derived(controller.failure ?? (acts.busy === null ? acts.failure : null));

  /** Moves the focus to a field of the stage, for the list of the mandatory fields that are empty. */
  export function focusField(pointer: string): void {
    const { part, pointer: inner } = splitPointer(pointer);
    if (part === DATA_PART) titleForm?.focusField(inner);
    else form?.focusField(inner);
  }

  /** The errors of a refused save that no field of the form shows are the form's own. */
  let errors = $derived(controller.errors);
</script>

<div
  class="panel"
  role="tabpanel"
  id={panelId}
  aria-labelledby="stage-tab-{stage.id}"
  data-testid="stage-panel"
  data-stage={stage.id}
>
  <h2 class="panel__title">{stageName}</h2>
  {#if stage.status === 'completed' && stage.completion}
    <p class="panel__state" data-testid="stage-completion">
      <StatusLabel
        tone="success"
        label={$t('incidents.stage.completed-by', {
          name: stage.completion.by.name,
          when: formatDateTime(stage.completion.at, $currentLocale),
        })}
        wrap
      />
    </p>
  {/if}
  <p class="panel__guidance" data-testid="stage-guidance">
    {$t(`category.${INCIDENT_CATEGORY}.stage.${stage.id}.guidance`)}
  </p>
  {#if stage.predecessorReopened}
    <div data-testid="stage-predecessor-reopened">
      <Notice
        tone="attention"
        title={$t('incidents.stage.predecessor-reopened.title')}
        body={$t('incidents.stage.predecessor-reopened.body')}
      />
    </div>
  {/if}
  {#if stage.status === 'not-applicable'}
    <div data-testid="stage-not-applicable">
      <Notice
        tone="info"
        title={$t(
          stage.unanswered ? 'incidents.stage.applies-when' : 'incidents.stage.not-applicable',
          { condition: $t(`category.${INCIDENT_CATEGORY}.stage.${stage.id}.when`) },
        )}
        body={$t('incidents.stage.kept')}
      />
    </div>
  {/if}
  {#if failure}
    <div data-testid="stage-failure">
      <Notice tone="danger" title={$t(failure)} live />
    </div>
  {/if}
  <ConflictPanel
    {conflicts}
    category={INCIDENT_CATEGORY}
    {kind}
    locked={controller.locked}
    onresolve={(pointer, keep) => controller.resolve(pointer, keep)}
    {ondecided}
  />

  {#if isTriage}
    <section
      class="panel__part"
      aria-label={$t('incidents.title.heading')}
      data-testid="title-section"
    >
      <SchemaForm
        bind:this={titleForm}
        schema={titleSchema(schema)}
        category={INCIDENT_CATEGORY}
        kind={partKind(DATA_PART)}
        value={titleController.value}
        readonly={titleController.locked}
        errors={titleController.errors}
        showMissing={titleController.missing.length > 0}
        headingLevel={4}
        untitled
        onchange={(next) => titleController.setValue(next)}
        testId="title-form"
      />
    </section>
  {/if}

  {#if stage.part === 'notifications'}
    <section class="panel__part" aria-labelledby="incident-notices" data-testid="notices-section">
      <h3 class="panel__heading" id="incident-notices">{$t('incidents.notifications.title')}</h3>
      <NotificationsTable value={controller.value} deadlines={incident.deadlines} />
    </section>
  {/if}

  <!-- The form of a stage needs a heading only where something else stands above it (the notices): the stage's own name is
       the heading of the rest. -->
  <section
    class="panel__part"
    aria-label={stage.part === 'notifications' ? undefined : $t('incidents.stage.form')}
    aria-labelledby={stage.part === 'notifications' ? 'stage-form-heading' : undefined}
    data-testid="stage-form-section"
  >
    {#if stage.part === 'notifications'}
      <h3 class="panel__heading" id="stage-form-heading">
        {$t('incidents.notifications.record')}
      </h3>
      <p class="panel__hint">{$t('incidents.notifications.record.hint')}</p>
    {/if}
    <SchemaForm
      bind:this={form}
      schema={formSchema}
      category={INCIDENT_CATEGORY}
      {kind}
      value={controller.value}
      readonly={controller.locked}
      {errors}
      showMissing={refusal !== null || controller.missing.length > 0}
      headingLevel={4}
      onchange={(next) => controller.setValue(next)}
      testId="stage-form"
    />
  </section>

  {#if isTriage}
    <ProtectionNeeds protection={incident.protection} />
  {/if}

  <StageActBar
    {stage}
    {names}
    year={incident.year}
    incident={incident.id}
    {mayAct}
    unsaved={controller.dirty}
    undecided={controller.open > 0}
    busy={acts.busy === stage.id}
    waiting={acts.busy !== null}
    {askSave}
    {refusal}
    {stepUpLine}
    {primary}
    {onact}
    {onsavefirst}
    ongo={(pointer) => focusField(pointer)}
    {onback}
  />
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding-block-start: var(--space-6);
  }

  .panel__title {
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
    font-weight: var(--weight-semibold);
  }

  .panel__state {
    display: block;
  }

  .panel__guidance,
  .panel__hint {
    max-inline-size: var(--measure);
    color: var(--color-text-secondary);
  }

  .panel__part {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .panel__heading {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
    font-weight: var(--weight-semibold);
  }

  /* The sections of the form stand under the heading of the part, so they are smaller than it and never larger than the name
     of the stage above. */
  .panel__part :global(.section__title) {
    font-size: var(--text-md);
    line-height: var(--line-height-md);
  }
</style>
