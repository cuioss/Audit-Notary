<script lang="ts">
  import { onDestroy } from 'svelte';
  import Button from '../../components/Button.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import SaveState, { type SaveStateKind } from '../../components/SaveState.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError, type FieldError } from '../../api/errors';
  import type { JsonObject, JsonSchema } from '../../api/types';
  import LeaveGuard from '../../documents/LeaveGuard.svelte';
  import SchemaForm from '../../forms/SchemaForm.svelte';
  import { t } from '../../i18n';
  import {
    awareSchema,
    DATA_PART,
    INCIDENT_CATEGORY,
    newIncidentRequest,
    partKind,
    repositoryOf,
    titleSchema,
    TRIAGE_PART,
    yearAddress,
  } from '../../incidents/model';
  import { StepUpHandler } from '../../stepup/stepUp';
  import StepUpDialog from '../../stepup/StepUpDialog.svelte';

  /**
   * A new incident of a year (UC-IR-1): the form of the title and of the time the organisation became aware, in a sheet of
   * the lens, so the list of the year stays beside it. Nothing is stored before the first save, which creates the incident
   * in the repository of the year (the server assigns the id) and moves the page to its sheet; until then leaving asks,
   * because what was typed lives nowhere else (rest-api.adoc, Decided Provisionally, point 31). The stages follow on the
   * sheet of the incident; only the title is mandatory now.
   *
   * The year is the year of the awareness: a time outside it is refused where the field is (`OUT_OF_YEAR`). The create goes
   * through the step-up handler like every request that can ask.
   */
  interface Props {
    /** The year of the address: four digits. */
    year: string;
    /**
     * What the person may do here: `loading` while the years are read, `allowed`, `right` without the right to edit the
     * year's incidents, `year` when the year is not the current one (a new incident is made in the current year).
     */
    access: 'loading' | 'allowed' | 'right' | 'year';
    /** The schema of the document type, or `null` while it is read. */
    schema: JsonSchema | null;
    /** Opens an address inside the app; `replace` takes the new incident's place in the history. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
    /** Called after the incident was created, so the lens reads the year and the years again. */
    oncreated?: () => void;
  }

  let { year, access, schema, onnavigate, oncreated }: Props = $props();

  const stepUp = new StepUpHandler();
  const stepUpState = stepUp.state;

  let title = $state<JsonObject>({});
  let aware = $state<JsonObject>({});
  let errors = $state<FieldError[] | null>(null);
  let failure = $state<string | null>(null);
  let saving = $state(false);
  /** Whether the incident exists: leaving is then no loss. */
  let created = false;
  /** Whether the sheet is gone: a creation that returns later navigates nowhere. */
  let destroyed = false;
  onDestroy(() => {
    destroyed = true;
    stepUp.cancel();
  });

  let text = $derived(typeof title.title === 'string' ? title.title.trim() : '');
  let awareAt = $derived(typeof aware['aware-at'] === 'string' ? aware['aware-at'] : null);
  let dirty = $derived(text !== '' || awareAt !== null);
  let busy = $derived(saving || $stepUpState.working);
  let saveState = $derived<SaveStateKind>(
    busy ? 'saving' : errors || failure ? 'failed' : dirty ? 'changed' : 'clean',
  );
  let label = $derived(
    busy
      ? $t('save.saving')
      : errors
        ? $t('documents.new.invalid')
        : failure
          ? $t('documents.new.failed')
          : dirty
            ? $t('documents.new.changed')
            : $t('documents.new.clean'),
  );

  async function create() {
    if (busy || text === '') return;
    saving = true;
    failure = null;
    errors = null;
    try {
      const body = newIncidentRequest(text, awareAt);
      const result = await stepUp.run((password) =>
        apiClient.createDocument(repositoryOf(year), body, password),
      );
      if (result.status === 'done') {
        created = true;
        oncreated?.();
        // The person may have left while the request ran: the page they went to is not replaced then.
        if (!destroyed) onnavigate(result.value.address, { replace: true });
      } else if (result.status === 'refused') {
        refuse(result.error);
      }
    } finally {
      saving = false;
    }
  }

  /** @returns the errors of the server that belong to a part (an error that names none counts for every part) */
  function errorsOf(part: string): FieldError[] | null {
    return errors?.filter((entry) => entry.part === undefined || entry.part === part) ?? null;
  }

  /** Takes a refusal: the errors of the fields stand where the fields are, anything else is told above the form. */
  function refuse(error: unknown) {
    if (isApiError(error) && error.outcome === 'VALIDATION') errors = error.errors;
    failure = errorMessageKey(error);
  }
</script>

{#if access === 'loading' || schema === null}
  <Sheet testId="new-incident-loading"><p class="muted">{$t('common.loading')}</p></Sheet>
{:else if access !== 'allowed'}
  <Sheet testId="new-incident-blocked">
    <EmptyState
      icon="state.lock"
      title={$t(access === 'right' ? 'incidents.new.no-right' : 'incidents.new.not-current')}
    >
      {#snippet actions()}
        <Link href={yearAddress(year)} data-testid="new-incident-back">
          {$t('incidents.new.back')}
        </Link>
      {/snippet}
    </EmptyState>
  </Sheet>
{:else}
  <LeaveGuard dirty={() => dirty && !created} />
  <StepUpDialog
    handler={stepUp}
    lede={$t('documents.stepup.lede', { act: $t('incidents.new.create'), title: text })}
    actLabel={$t('incidents.new.create')}
    icon="act.save"
    testId="create"
  />
  <Sheet testId="new-incident-sheet" marginLabel={$t('sheet.margin')}>
    <SheetHead
      kind="incident"
      kindLabel={$t('incidents.kind.incident')}
      title={$t('incidents.new.title')}
      lede={$t('incidents.new.lede', { year })}
      size="title"
    />
    {#if failure}
      <div class="notice">
        <Notice tone="danger" title={$t(failure)} live />
      </div>
    {/if}
    {#if $stepUpState.notice}
      <div class="notice">
        <Notice tone={$stepUpState.notice.tone} title={$t($stepUpState.notice.key)} live />
      </div>
    {/if}
    <div class="forms">
      <SchemaForm
        schema={titleSchema(schema)}
        category={INCIDENT_CATEGORY}
        kind={partKind(DATA_PART)}
        bind:value={title}
        errors={errorsOf(DATA_PART)}
        readonly={busy}
        headingLevel={2}
        untitled
        testId="new-incident-title"
      />
      <SchemaForm
        schema={awareSchema(schema)}
        category={INCIDENT_CATEGORY}
        kind={partKind(TRIAGE_PART)}
        bind:value={aware}
        errors={errorsOf(TRIAGE_PART)}
        readonly={busy}
        headingLevel={2}
        untitled
        testId="new-incident-aware"
      />
    </div>

    {#snippet status()}
      <div class="status">
        <SaveState state={saveState} {label} testId="save-state" />
        <Button
          variant="primary"
          icon="act.save"
          busy={saving || $stepUpState.working}
          onclick={() => void create()}
          disabledReason={text === '' ? $t('incidents.new.need-title') : null}
          data-testid="create-incident"
        >
          {$t('incidents.new.create')}
        </Button>
      </div>
    {/snippet}

    {#snippet margin()}
      <p class="margin__note">{$t('incidents.new.note')}</p>
    {/snippet}
  </Sheet>
{/if}

<style>
  .muted {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }

  .notice {
    margin-block-end: var(--space-6);
  }

  .forms {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .margin__note {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
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
</style>
