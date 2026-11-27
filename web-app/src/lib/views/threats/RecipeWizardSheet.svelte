<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import Button from '../../components/Button.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import SaveState, { type SaveStateKind } from '../../components/SaveState.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import type {
    JsonObject,
    JsonSchema,
    JsonValue,
    OtmMitigation,
    OtmThreat,
    ThreatModelService,
  } from '../../api/types';
  import LeaveGuard from '../../documents/LeaveGuard.svelte';
  import AsciiDocView from '../../forms/AsciiDocView.svelte';
  import SchemaForm from '../../forms/SchemaForm.svelte';
  import { createFormServices, provideFormServices } from '../../forms/services';
  import { formatTime } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { parseAddress } from '../../routes';
  import StepUpDialog from '../../stepup/StepUpDialog.svelte';
  import {
    modelAddress,
    modelSchemaOf,
    newAddress,
    pickProperties,
    rowErrors,
    THREAT_CATEGORY,
    THREAT_KIND,
  } from '../../threats/model';
  import {
    listAt,
    memberValue,
    stepKind,
    stepSchema,
    stepValue,
    summaryOf,
    type DataValues,
  } from '../../threats/recipe';
  import { RecipeWizard } from '../../threats/wizard.svelte';
  import CountermeasureEditor from './CountermeasureEditor.svelte';
  import ThreatTable from './ThreatTable.svelte';

  /**
   * The recipe wizard of a new threat model (UC-TM-1): the steps of a recipe, each with its guidance and the form of the
   * part of the model it fills, then a last page that shows what was filled in, asks for the owner and the review date and
   * creates the model. What the person enters is kept for them between steps (the recipe draft), so the page can be left
   * and continued from the service page; nothing exists for others before the create.
   *
   * It reuses the sheet's own pieces: the form kit for the project, the zones, the components and the data flows, the table
   * of the threats and the editor of the countermeasures for the two lists that have one. Leaving the page asks while it holds
   * what is kept nowhere. After the create the page moves to the sheet of the model; the release is the shared flow, later.
   */
  interface Props {
    /** The service page: its name, its owner and today's date. */
    service: ThreatModelService;
    /** The recipe's id. */
    recipeId: string;
    /** The schema of the document type (`kinds[n].schema`), `null` while it is read. */
    schema: JsonSchema | null;
    /** Opens an address inside the app; `replace` takes the model's place in the history. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
    /** Called after the model was created, so the lens reads its evaluation and the service again. */
    oncreated?: () => void;
    /** Called after the draft was kept, so the service page lists it. */
    onkept?: () => void;
    /** The catalogue key of the failure of the read of the schema, `null` while it did not fail. */
    schemaFailure?: string | null;
    /** Reads the schema again; the recipe and the draft are not read again. */
    onretryschema?: () => void;
  }

  let {
    service,
    recipeId,
    schema,
    onnavigate,
    oncreated,
    onkept,
    schemaFailure = null,
    onretryschema,
  }: Props = $props();

  const wizard = new RecipeWizard(
    untrack(() => service.service.id),
    untrack(() => service.today),
  );
  // The form kit and the guidance share what they read.
  const services = createFormServices();
  provideFormServices(services);

  let heading: HTMLElement | undefined = $state();
  let announcement = $state('');
  /** The browser's own errors of the form on the page: a step with one does not go on. */
  let formErrors = $state(0);
  let destroyed = false;
  onDestroy(() => {
    destroyed = true;
  });

  // The recipe and the draft are read once; a change of the language reads the texts again.
  let opened = false;
  $effect(() => {
    const lang = $currentLocale;
    untrack(() => {
      if (opened) {
        void wizard.relocalise(recipeId, lang);
      } else {
        opened = true;
        void wizard.open(recipeId, lang);
      }
    });
  });

  let model = $derived(schema ? modelSchemaOf(schema) : null);
  let dataSchema = $derived(schema ? pickProperties(schema, ['owner', 'last-review']) : null);
  let step = $derived(wizard.steps[wizard.current]);
  let fills = $derived(step?.fills ?? '');
  let kind = $derived(stepKind(fills));
  let form = $derived(model && step ? stepSchema(model, fills) : null);
  let threats = $derived(listAt<OtmThreat>(wizard.values, '/threats'));
  let mitigations = $derived(listAt<OtmMitigation>(wizard.values, '/mitigations'));
  let stepErrors = $derived(wizard.errorsOf(wizard.current));
  let dataValue = $derived<JsonObject>({
    ...(wizard.data.owner ? { owner: wizard.data.owner } : {}),
    ...(wizard.data['last-review'] ? { 'last-review': wizard.data['last-review'] } : {}),
  });
  let dataErrors = $derived(wizard.dataErrors);
  let title = $derived(wizard.onReview ? $t('threats.wizard.review.title') : (step?.title ?? ''));
  let stepperSteps = $derived([
    ...wizard.steps.map((entry) => ({ id: entry.id, title: entry.title })),
    { id: 'review', title: $t('threats.wizard.review.title') },
  ]);

  // A step the person moves to is announced politely and takes the focus on its heading; the first one is just shown. The
  // errors of the form on the page are the step's own: another step starts without them, a change of the language (the
  // title only) keeps them.
  let shown = false;
  let announced = -1;
  $effect(() => {
    const position = wizard.current;
    const ready = wizard.phase === 'ready';
    const text = title;
    if (!ready) return;
    untrack(() => {
      if (position !== announced) formErrors = 0;
      announced = position;
      announcement = $t('threats.wizard.announce', {
        step: position + 1,
        count: wizard.steps.length + 1,
        title: text,
      });
      if (!shown) {
        shown = true;
        return;
      }
      void tick().then(() => heading?.focus());
    });
  });

  let saveState = $derived<SaveStateKind>(
    wizard.busy
      ? 'saving'
      : wizard.errors || wizard.failure
        ? 'failed'
        : wizard.dirty
          ? 'changed'
          : wizard.keptAt
            ? 'draft'
            : 'clean',
  );
  let saveLabel = $derived(
    wizard.busy === 'creating'
      ? $t('threats.wizard.save.creating')
      : wizard.busy === 'keeping'
        ? $t('threats.wizard.save.saving')
        : wizard.errors
          ? wizard.lastAct === 'creating'
            ? $t('threats.wizard.save.create-invalid')
            : $t('threats.wizard.save.invalid')
          : wizard.failure
            ? wizard.lastAct === 'creating'
              ? $t('threats.wizard.save.create-failed')
              : $t('threats.wizard.save.failed')
            : wizard.dirty
              ? wizard.onReview
                ? $t('threats.wizard.save.review')
                : $t('threats.wizard.save.changed')
              : wizard.keptAt
                ? $t('save.draft', { time: formatTime(wizard.keptAt, $currentLocale) })
                : $t('threats.wizard.save.clean'),
  );

  let nextReason = $derived(formErrors > 0 ? $t('threats.wizard.need-correction') : null);
  let createReason = $derived(
    wizard.createBlocker === 'name'
      ? $t('threats.wizard.need-name', {
          step: wizard.steps[wizard.nameStep]?.title ?? wizard.recipe?.title ?? '',
        })
      : formErrors > 0
        ? $t('threats.wizard.need-correction')
        : null,
  );

  async function next() {
    if (await wizard.next()) onkept?.();
  }

  async function create() {
    const answer = await wizard.create();
    if (!answer) return;
    oncreated?.();
    // The server names the address; one that is no address of this app is not followed.
    const address = parseAddress(answer.address)
      ? answer.address
      : modelAddress(service.service.id, answer.model);
    // The person may have left while the request ran: the page they went to is not replaced then.
    if (!destroyed) onnavigate(address, { replace: true });
  }

  /** @param next what the form of the last page reports */
  function setData(next: JsonObject) {
    const data: DataValues = {};
    if (typeof next.owner === 'string' && next.owner !== '') data.owner = next.owner;
    if (typeof next['last-review'] === 'string') data['last-review'] = next['last-review'];
    wizard.setData(data);
  }
</script>

{#if wizard.phase === 'ready' && schema === null && schemaFailure}
  <Sheet testId="recipe-schema-failed">
    <Notice tone="danger" title={$t(schemaFailure)}>
      {#snippet actions()}
        <Button onclick={() => onretryschema?.()} data-testid="schema-retry">
          {$t('common.retry')}
        </Button>
      {/snippet}
    </Notice>
  </Sheet>
{:else if wizard.phase === 'loading' || (wizard.phase === 'ready' && schema === null)}
  <Sheet testId="recipe-wizard-loading"><p class="muted">{$t('common.loading')}</p></Sheet>
{:else if wizard.phase === 'missing'}
  <Sheet testId="recipe-missing">
    <EmptyState
      icon="state.na"
      title={$t('threats.new.recipe-missing.title')}
      body={$t('threats.new.recipe-missing.body')}
    >
      {#snippet actions()}
        <Link href={newAddress(service.service.id)} data-testid="recipe-choose">
          {$t('threats.new.recipe-missing.act')}
        </Link>
      {/snippet}
    </EmptyState>
  </Sheet>
{:else if wizard.phase === 'failed'}
  <Sheet testId="recipe-failed">
    <Notice tone="danger" title={$t(wizard.loadFailure ?? 'error.unexpected')} live />
  </Sheet>
{:else if wizard.recipe}
  <LeaveGuard dirty={() => wizard.dirty} />
  <StepUpDialog
    handler={wizard.stepUp}
    lede={$t('documents.stepup.lede', {
      act: $t('threats.wizard.create'),
      title: wizard.name,
    })}
    actLabel={$t('threats.wizard.create')}
    icon="act.save"
    testId="create"
  />
  <Sheet testId="new-threat-model-sheet" marginLabel={$t('sheet.margin')}>
    <SheetHead
      kind="threat-model"
      kindLabel={$t('threats.kind.model')}
      title={$t('threats.new.title')}
      size="title"
      lede={$t('threats.new.lede', { service: service.service.name })}
      facts={[{ term: $t('threats.wizard.fact.recipe'), value: wizard.recipe.title }]}
    />

    <div class="stepper">
      <Stepper
        label={$t('threats.wizard.steps', { recipe: wizard.recipe.title })}
        steps={stepperSteps}
        current={wizard.current}
        furthest={wizard.furthest}
        count={$t('threats.wizard.count', {
          step: wizard.current + 1,
          count: wizard.steps.length + 1,
        })}
        doneLabel={$t('threats.wizard.done')}
        onselect={(position) => wizard.goTo(position)}
        testId="recipe-stepper"
      />
    </div>

    {#if wizard.failure}
      <div class="notice">
        <Notice tone="danger" title={$t(wizard.failure)} live />
      </div>
    {/if}

    <section class="step" aria-labelledby="recipe-step-title" data-testid="recipe-step">
      <h2 class="step__title" id="recipe-step-title" tabindex="-1" bind:this={heading}>
        {title}
      </h2>

      {#if wizard.onReview}
        <p class="step__lede">{$t('threats.wizard.review.lede')}</p>

        <section class="part" aria-labelledby="review-summary" data-testid="review-summary">
          <h3 class="part__title" id="review-summary">{$t('threats.wizard.review.summary')}</h3>
          <dl class="summary">
            {#each wizard.steps as entry, position (entry.id)}
              {@const summary = summaryOf(entry.fills, wizard.values)}
              <div class="summary__row" data-testid="summary-{entry.id}">
                <dt>{entry.title}</dt>
                <dd>
                  {#if summary.kind === 'name'}
                    {summary.text}
                  {:else if summary.kind === 'count'}
                    {$t('threats.wizard.review.entries', { count: summary.count })}
                  {:else}
                    <span class="muted">{$t('threats.wizard.review.none')}</span>
                  {/if}
                </dd>
                <dd class="summary__act">
                  <Button
                    variant="ghost"
                    aria-label={$t('threats.wizard.review.change.named', { title: entry.title })}
                    onclick={() => wizard.goTo(position)}
                    data-testid="summary-change-{entry.id}"
                  >
                    {$t('threats.wizard.review.change')}
                  </Button>
                </dd>
              </div>
            {/each}
          </dl>
        </section>

        {#if dataSchema}
          <section class="part" aria-labelledby="review-data" data-testid="review-data">
            <h3 class="part__title" id="review-data">{$t('threats.wizard.review.data')}</h3>
            <p class="step__lede">{$t('threats.wizard.review.data.lede')}</p>
            <SchemaForm
              schema={dataSchema}
              category={THREAT_CATEGORY}
              kind={THREAT_KIND}
              value={dataValue}
              errors={dataErrors.length > 0 ? dataErrors : null}
              headingLevel={4}
              {services}
              onchange={(next, state) => {
                formErrors = state.errors.length;
                setData(next);
              }}
              testId="review-data-form"
            />
          </section>
        {/if}
      {:else if step}
        <div class="guidance" role="group" aria-label={$t('threats.wizard.guidance')}>
          <AsciiDocView source={step.guidance} fallback testId="step-guidance" />
        </div>

        {#if kind === 'threats'}
          <ThreatTable
            {threats}
            {mitigations}
            errors={rowErrors(wizard.modelErrors, '/threats')}
            onchange={(nextThreats, nextMitigations) =>
              wizard.setThreats(nextThreats, nextMitigations)}
            testId="wizard-threats"
          />
        {:else if kind === 'mitigations'}
          <CountermeasureEditor
            {mitigations}
            {threats}
            errors={rowErrors(wizard.modelErrors, '/mitigations')}
            onchange={(next) => wizard.setValue(fills, next as unknown as JsonValue)}
            testId="wizard-mitigations"
          />
        {:else if form}
          {#key wizard.current}
            <SchemaForm
              schema={form}
              category={THREAT_CATEGORY}
              kind={THREAT_KIND}
              value={stepValue(wizard.values, fills)}
              errors={stepErrors.length > 0 ? stepErrors : null}
              headingLevel={3}
              untitled
              {services}
              onchange={(next, state) => {
                formErrors = state.errors.length;
                wizard.setValue(fills, memberValue(next, fills));
              }}
              testId="step-form"
            />
          {/key}
        {:else}
          <Notice tone="info" title={$t('threats.wizard.step.unknown')} />
        {/if}
      {/if}
    </section>

    <p class="sr-only" role="status" aria-live="polite" data-testid="step-announce">
      {announcement}
    </p>

    {#snippet status()}
      <div class="status">
        <SaveState state={saveState} label={saveLabel} testId="save-state" />
        <div class="status__acts">
          {#if wizard.onReview}
            <Button
              variant="primary"
              icon="act.save"
              busy={wizard.busy === 'creating'}
              onclick={() => void create()}
              disabledReason={createReason}
              data-testid="create-model"
            >
              {$t('threats.wizard.create')}
            </Button>
          {:else}
            <Button
              variant="primary"
              busy={wizard.busy === 'keeping'}
              onclick={() => void next()}
              disabledReason={nextReason}
              data-testid="step-next"
            >
              {$t('threats.wizard.next')}
            </Button>
          {/if}
          {#if wizard.current > 0}
            <Button
              icon="act.back"
              onclick={() => wizard.back()}
              disabled={wizard.busy !== null}
              data-testid="step-back"
            >
              {$t('threats.wizard.back')}
            </Button>
          {/if}
        </div>
      </div>
    {/snippet}

    {#snippet margin()}
      <p class="margin__note">{$t('threats.wizard.note')}</p>
    {/snippet}
  </Sheet>
{/if}

<style>
  .muted {
    color: var(--color-text-muted);
  }

  .stepper {
    margin-block-end: var(--space-6);
  }

  .notice {
    margin-block-end: var(--space-6);
  }

  .step__title {
    margin-block-end: var(--space-3);
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
  }

  .step__lede {
    max-inline-size: var(--measure);
    margin-block-end: var(--space-4);
    color: var(--color-text-secondary);
  }

  .guidance {
    max-inline-size: var(--measure);
    margin-block-end: var(--space-6);
    padding-inline-start: var(--space-4);
    border-inline-start: 2px solid var(--color-border-strong);
    color: var(--color-text-secondary);
  }

  /* The guidance is a word about the record, not the record: the sans of the controls, not the serif of the text. */
  .guidance :global(.asciidoc__rendered) {
    font-family: var(--font-sans);
    font-size: var(--text-md);
    line-height: var(--line-height-md);
  }

  .part {
    margin-block-start: var(--space-8);
  }

  .part__title {
    margin-block-end: var(--space-2);
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
  }

  .summary__row {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) minmax(0, 2fr) auto;
    align-items: center;
    gap: var(--space-1) var(--space-4);
    padding-block: var(--space-1);
    border-block-end: 1px solid var(--color-border);
  }

  .summary__row dt {
    color: var(--color-text-secondary);
  }

  .summary__row dd {
    margin: 0;
  }

  .summary__act {
    justify-self: end;
  }

  .status {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .status__acts {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .status__acts :global(.btn-with-reason) {
    align-items: stretch;
    max-inline-size: none;
  }

  /* The column is read from its start: the reason an act cannot be taken stands under the act, not at its far end. */
  .status__acts :global(.btn__reason) {
    text-align: start;
  }

  .margin__note {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }

  @media (max-width: 767px) {
    .summary__row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .summary__row dt {
      grid-column: 1 / -1;
    }
  }
</style>
