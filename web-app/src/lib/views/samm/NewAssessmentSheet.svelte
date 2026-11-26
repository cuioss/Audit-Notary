<script lang="ts">
  import { onDestroy } from 'svelte';
  import Avatar from '../../components/Avatar.svelte';
  import Button from '../../components/Button.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import SaveState, { type SaveStateKind } from '../../components/SaveState.svelte';
  import Select from '../../components/Select.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import TextField from '../../components/TextField.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError, type FieldError } from '../../api/errors';
  import type { SammModelList, SammScope } from '../../api/types';
  import LeaveGuard from '../../documents/LeaveGuard.svelte';
  import { errorKey } from '../../forms/fieldErrors';
  import PersonPicker from '../../forms/PersonPicker.svelte';
  import { createFormServices, provideFormServices } from '../../forms/services';
  import { isDate } from '../../forms/validate';
  import { t } from '../../i18n';
  import { parseAddress } from '../../routes';
  import { session } from '../../stores/app';
  import { now } from '../../stores/clock';

  /**
   * A new assessment of a scope (UC-SAMM-2): its title, its date, the pinned model version it is taken with and the
   * further assessors, picked from the directory (bound or not yet bound). The person who creates it is always the first
   * assessor. The assessment starts empty: no answer is copied from an earlier one. Nothing is stored before the person
   * starts it (`POST /api/v1/samm/{scope}/assessments`); then the page moves to the assessment. Until then leaving asks.
   *
   * At most one assessment of a scope is open: while one is, the sheet says which and offers no act; an assessment that
   * was opened meanwhile is the server's `ASSESSMENT_OPEN` and is named the same way. The model version is that of the
   * scope's newest assessment (the one a frozen sheet was left from) when it is still pinned, else the scope's, else the
   * default (rest-api.adoc, Decided Provisionally with the SAMM completion, point 9).
   */
  interface Props {
    /** The scope, or `null` while it is read. */
    scope: SammScope | null;
    /** The pinned model versions; `null` while they are read. */
    models: SammModelList | null;
    /** Whether the user holds the right `edit` on the SAMM assessments. */
    canCreate: boolean;
    /** Opens an address inside the app; `replace` takes the new assessment's place in the history. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
    /** Called after the assessment was created, so the lens reads the scope again. */
    oncreated?: () => void;
  }

  let { scope, models, canCreate, onnavigate, oncreated }: Props = $props();

  /** The most further assessors of one assessment. */
  const MAX_ASSESSORS = 30;

  // The pickers of one sheet share what they read.
  provideFormServices(createFormServices());

  /** @returns today as the date field takes it, `YYYY-MM-DD`, in the zone of the browser */
  function today(): string {
    const date = $now;
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  let title = $state('');
  let date = $state(today());
  let touchedDate = $state(false);
  let chosenVersion = $state<string | null>(null);
  /** The further assessors: a pseudonym, or `undefined` for a row not yet picked. */
  let assessors = $state<(string | undefined)[]>([]);
  let errors = $state<FieldError[] | null>(null);
  let failure = $state<string | null>(null);
  /**
   * The assessment the server names as open already (an `ASSESSMENT_OPEN` refusal), with the scope as it was read then.
   * The name holds only until a newer read of the scope supersedes it: the scope read is authoritative.
   */
  let openElsewhere = $state.raw<{ id: string; scope: SammScope | null } | null>(null);
  let saving = $state(false);
  let created = false;
  let destroyed = false;
  onDestroy(() => {
    destroyed = true;
  });

  let pins = $derived(models?.models ?? []);
  let open = $derived(
    scope?.assessments.find((entry) => entry.state !== 'released') ??
      (openElsewhere && openElsewhere.scope === scope
        ? { id: openElsewhere.id, title: openElsewhere.id }
        : null),
  );
  // A newer read of the scope supersedes the refusal: what it shows is the truth, so the refusal is forgotten with its
  // notice (it stays until that read completes).
  $effect.pre(() => {
    if (openElsewhere && openElsewhere.scope !== scope) {
      openElsewhere = null;
      failure = null;
    }
  });
  let prefilled = $derived.by(() => {
    const wanted = [scope?.assessments[0]?.modelVersion, scope?.modelVersion];
    return (
      wanted.find((version) => pins.some((pin) => pin.version === version)) ??
      pins.find((pin) => pin.default)?.version ??
      pins[0]?.version ??
      ''
    );
  });
  let version = $derived(chosenVersion ?? prefilled);
  let dirty = $derived(
    title.trim() !== '' || touchedDate || chosenVersion !== null || assessors.length > 0,
  );

  let reason = $derived(
    open
      ? $t('samm.new.assessment.open-reason')
      : title.trim() === ''
        ? $t('samm.new.assessment.need-title')
        : !isDate(date)
          ? $t('samm.new.assessment.need-date')
          : null,
  );
  let saveState = $derived<SaveStateKind>(
    saving ? 'saving' : errors || failure ? 'failed' : dirty ? 'changed' : 'clean',
  );
  let label = $derived(
    saving
      ? $t('samm.new.save.saving')
      : errors
        ? $t('samm.new.save.invalid')
        : failure
          ? $t('samm.new.save.failed')
          : dirty
            ? $t('samm.new.assessment.changed')
            : $t('samm.new.assessment.clean'),
  );

  /** The rows of the assessors that are sent, with the position they have in the list the server reads. */
  let sent = $derived(
    assessors.flatMap((pseudonym, row) => (pseudonym ? [{ pseudonym, row }] : [])),
  );

  /** @param field the first segment of a pointer of the body @returns the text of its error, or `null` */
  function errorOf(field: string): string | null {
    const error = errors?.find((entry) => entry.pointer === `/${field}`);
    return error ? $t(errorKey(error.code)) : null;
  }

  /** @param row a row of the assessors @returns the text of the error of the person in it, or `null` */
  function assessorError(row: number): string | null {
    const position = sent.findIndex((entry) => entry.row === row);
    if (position < 0) return null;
    const error = errors?.find((entry) => entry.pointer === `/assessors/${position}`);
    return error ? $t(errorKey(error.code)) : null;
  }

  let unplaced = $derived(
    (errors ?? []).filter(
      (entry) =>
        !['/title', '/date', '/modelVersion', '/assessors'].includes(entry.pointer) &&
        !entry.pointer.startsWith('/assessors/'),
    ),
  );

  function pick(row: number, pseudonym: string | undefined) {
    assessors = assessors.map((held, position) => (position === row ? pseudonym : held));
  }

  async function create() {
    if (saving || created || reason !== null || !scope) return;
    saving = true;
    failure = null;
    errors = null;
    openElsewhere = null;
    try {
      const answer = await apiClient.createSammAssessment(scope.id, {
        title: title.trim(),
        date,
        modelVersion: version,
        assessors: sent.map((entry) => entry.pseudonym),
      });
      created = true;
      oncreated?.();
      // The server names the address; one that is no address of this app is not followed.
      const address = parseAddress(answer.address)
        ? answer.address
        : `/samm/${scope.id}/${answer.id}`;
      if (!destroyed) onnavigate(address, { replace: true });
    } catch (error) {
      if (isApiError(error) && error.outcome === 'VALIDATION') errors = error.errors;
      if (isApiError(error) && error.outcome === 'ASSESSMENT_OPEN') {
        const named = error.details.assessment;
        openElsewhere = typeof named === 'string' ? { id: named, scope } : null;
        oncreated?.();
      }
      failure = errorMessageKey(error);
    } finally {
      saving = false;
    }
  }
</script>

<LeaveGuard dirty={() => dirty && !created} />

{#if !canCreate}
  <Sheet testId="new-assessment-no-right">
    <EmptyState icon="state.lock" title={$t('samm.new.assessment.no-right')}>
      {#snippet actions()}
        <Link href={scope ? `/samm/${scope.id}` : '/samm'}>{$t('samm.new.back')}</Link>
      {/snippet}
    </EmptyState>
  </Sheet>
{:else if scope === null || models === null}
  <Sheet testId="new-assessment-loading"><p class="muted">{$t('common.loading')}</p></Sheet>
{:else if pins.length === 0}
  <Sheet testId="new-assessment-no-model">
    <EmptyState
      icon="state.alert"
      title={$t('samm.new.no-model.title')}
      body={$t('samm.new.no-model.body')}
    >
      {#snippet actions()}
        <Link href="/samm/{scope.id}">{$t('samm.new.back')}</Link>
      {/snippet}
    </EmptyState>
  </Sheet>
{:else}
  <Sheet testId="new-assessment-sheet" marginLabel={$t('sheet.margin')}>
    <SheetHead
      kind="assessment"
      kindLabel={$t('kind.assessment')}
      title={$t('samm.new.assessment.title')}
      lede={$t('samm.new.assessment.lede', { scope: scope.title })}
      size="title"
    />

    {#if open}
      <div class="notice" data-testid="open-notice">
        <Notice
          tone="attention"
          title={$t('samm.new.assessment.open.title', { title: open.title })}
          body={$t('samm.new.assessment.open.body')}
        >
          {#snippet actions()}
            <Link href="/samm/{scope.id}/{open.id}">{$t('samm.new.assessment.open.link')}</Link>
          {/snippet}
        </Notice>
      </div>
    {:else if failure}
      <div class="notice">
        <Notice
          tone="danger"
          title={$t(failure)}
          body={unplaced.length > 0
            ? unplaced.map((entry) => $t(errorKey(entry.code))).join(' ')
            : undefined}
          live
        />
      </div>
    {/if}

    <div class="form">
      <TextField
        label={$t('samm.new.assessment.name')}
        mark={$t('form.required')}
        bind:value={title}
        error={errorOf('title')}
        testId="new-assessment-title"
      />
      <TextField
        label={$t('samm.fact.date')}
        mark={$t('form.required')}
        type="date"
        bind:value={date}
        oninput={() => (touchedDate = true)}
        error={errorOf('date')}
        testId="new-assessment-date"
      />
      <Select
        label={$t('samm.new.scope.model')}
        hint={$t('samm.new.scope.model-hint')}
        options={pins.map((pin) => ({
          value: pin.version,
          label: `${$t('samm.model.name')} ${pin.version}`,
        }))}
        value={version}
        placeholder={$t('form.choose')}
        error={errorOf('modelVersion')}
        onchange={(next) => (chosenVersion = next === '' ? null : next)}
        testId="new-assessment-model"
      />

      <section class="assessors" aria-labelledby="new-assessors">
        <h2 class="assessors__title" id="new-assessors">{$t('samm.assessors')}</h2>
        <p class="assessors__lede">{$t('samm.new.assessment.assessors-lede')}</p>
        {#if errorOf('assessors')}<p class="error">{errorOf('assessors')}</p>{/if}
        <ul class="people">
          <li class="person" data-testid="assessor-self">
            <Avatar name={$session?.user.name ?? ''} size="sm" />
            <span class="person__text">
              <span class="person__name">{$session?.user.name}</span>
              <span class="person__role">{$t('samm.new.assessment.you')}</span>
            </span>
          </li>
          {#each assessors as held, row (row)}
            <li class="row" data-testid="assessor-{row}">
              <PersonPicker
                label={$t('samm.new.assessment.assessor', { number: row + 2 })}
                value={held}
                error={assessorError(row)}
                onchange={(next) => pick(row, next)}
                testId="assessor-{row}-person"
              />
              <Button
                variant="ghost"
                icon="act.close"
                onclick={() => (assessors = assessors.filter((_, position) => position !== row))}
                aria-label={$t('samm.new.assessment.assessor-remove-row', { number: row + 2 })}
                data-testid="assessor-{row}-remove"
              >
                {$t('samm.new.assessment.assessor-remove')}
              </Button>
            </li>
          {/each}
        </ul>
        <Button
          disabledReason={assessors.length >= MAX_ASSESSORS
            ? $t('samm.new.assessment.assessors-limit', { count: MAX_ASSESSORS })
            : null}
          onclick={() => (assessors = [...assessors, undefined])}
          data-testid="assessor-add"
        >
          {$t('samm.new.assessment.assessor-add')}
        </Button>
      </section>
    </div>

    {#snippet status()}
      <div class="status">
        <SaveState state={saveState} {label} testId="save-state" />
        <Button
          variant="primary"
          icon="act.save"
          busy={saving}
          onclick={() => void create()}
          disabledReason={reason}
          data-testid="create-assessment"
        >
          {$t('samm.new.assessment.create')}
        </Button>
      </div>
    {/snippet}

    {#snippet margin()}
      <div class="margin">
        <p class="margin__note">{$t('samm.new.assessment.note')}</p>
      </div>
    {/snippet}
  </Sheet>
{/if}

<style>
  .muted {
    color: var(--color-text-muted);
  }

  .notice {
    margin-block-end: var(--space-6);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    max-inline-size: 32rem;
  }

  .assessors {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .assessors__title {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
  }

  .assessors__lede {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  .people {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    gap: var(--space-4);
    list-style: none;
  }

  .person {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .person__text {
    display: flex;
    flex-direction: column;
    font-size: var(--text-sm);
    line-height: var(--line-height-sm);
  }

  .person__name {
    font-weight: var(--weight-medium);
  }

  .person__role {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  /* The act stands under the person it removes: beside a field with a label above and an error below it has no line to keep. */
  .row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .row > :global(:first-child) {
    align-self: stretch;
  }

  .margin {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
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
