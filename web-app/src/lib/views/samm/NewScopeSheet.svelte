<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import Button from '../../components/Button.svelte';
  import ChoiceGroup from '../../components/ChoiceGroup.svelte';
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
  import type { SammModel, SammModelList, SammTarget } from '../../api/types';
  import LeaveGuard from '../../documents/LeaveGuard.svelte';
  import CatalogPicker from '../../forms/CatalogPicker.svelte';
  import { errorKey } from '../../forms/fieldErrors';
  import { createFormServices, provideFormServices } from '../../forms/services';
  import { t } from '../../i18n';
  import { parseAddress } from '../../routes';
  import { loadModel } from '../../samm/store';
  import { targetErrorsOf } from '../../samm/targets';
  import TargetsEditor from './TargetsEditor.svelte';

  /**
   * A new scope (UC-SAMM-1): its title, who is assessed (a team, a service or the whole organisation), the pinned model
   * version it is taken with and, if wanted, its targets. Nothing is stored before the person creates the scope
   * (`POST /api/v1/samm/scopes`); then the page moves to the address of the scope. Until then leaving the page asks.
   *
   * The title and the subject cannot be changed afterwards, only the targets can (rest-api.adoc, Decided Provisionally
   * with the SAMM completion, point 4); the sheet says so before the person creates the scope.
   */
  interface Props {
    /** The pinned model versions; `null` while they are read. */
    models: SammModelList | null;
    /** Whether the user holds the right `edit` on the SAMM assessments. */
    canCreate: boolean;
    /** Opens an address inside the app; `replace` takes the new scope's place in the history. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
    /** Called after the scope was created, so the lens reads its scopes again. */
    oncreated?: () => void;
  }

  let { models, canCreate, onnavigate, oncreated }: Props = $props();

  type SubjectKind = 'team' | 'service' | 'organisation';

  // The pickers of one sheet share what they read.
  provideFormServices(createFormServices());

  let title = $state('');
  let kind = $state<SubjectKind>('team');
  /** The reference a picker holds, `team:<id>` or `service:<id>`. */
  let reference = $state<string | undefined>(undefined);
  let chosenVersion = $state<string | null>(null);
  let targets = $state<Record<string, SammTarget>>({});
  let model = $state<SammModel | null>(null);
  let modelFailed = $state(false);
  let errors = $state<FieldError[] | null>(null);
  let failure = $state<string | null>(null);
  let saving = $state(false);
  let created = false;
  /** Whether the sheet is gone: a creation that returns later navigates nowhere. */
  let destroyed = false;
  onDestroy(() => {
    destroyed = true;
  });

  let defaultVersion = $derived(
    models?.models.find((pin) => pin.default)?.version ?? models?.models[0]?.version ?? '',
  );
  let version = $derived(chosenVersion ?? defaultVersion);
  let subject = $derived(kind === 'organisation' ? 'organisation' : (reference ?? ''));
  let dirty = $derived(
    title.trim() !== '' ||
      subject !== '' ||
      Object.keys(targets).length > 0 ||
      chosenVersion !== null,
  );

  // The practices of the chosen version, for the targets: a version without a model file costs the targets only.
  $effect(() => {
    const wanted = version;
    if (!wanted) return;
    let current = true;
    modelFailed = false;
    if (untrack(() => model?.version) !== wanted) model = null;
    loadModel(wanted)
      .then((loaded) => {
        if (!current) return;
        model = loaded;
        // A target of a practice the chosen version does not have is not shown and would be refused: it goes.
        const known = new Set(loaded.functions.flatMap((fn) => fn.practices.map((p) => p.id)));
        const held = untrack(() => targets);
        const kept = Object.entries(held).filter(([practice]) => known.has(practice));
        if (kept.length !== Object.keys(held).length) targets = Object.fromEntries(kept);
      })
      .catch(() => {
        if (!current) return;
        modelFailed = true;
        // The practices cannot be shown, so what was chosen for another version is not sent for this one.
        targets = {};
      });
    return () => {
      current = false;
    };
  });

  /** @param field the first segment of a pointer of the body @returns the text of its error, or `null` */
  function errorOf(field: string): string | null {
    const error = errors?.find((entry) => entry.pointer === `/${field}`);
    return error ? $t(errorKey(error.code)) : null;
  }

  let unplaced = $derived(
    (errors ?? []).filter(
      (entry) =>
        !['/title', '/subject', '/modelVersion'].includes(entry.pointer) &&
        !entry.pointer.startsWith('/targets/'),
    ),
  );

  let reason = $derived(
    title.trim() === ''
      ? $t('samm.new.scope.need-title')
      : subject === ''
        ? $t('samm.new.scope.need-subject')
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
            ? $t('samm.new.save.changed')
            : $t('samm.new.save.clean'),
  );

  async function create() {
    if (saving || created || reason !== null) return;
    saving = true;
    failure = null;
    errors = null;
    try {
      const answer = await apiClient.createSammScope({
        title: title.trim(),
        subject,
        modelVersion: version,
        ...(Object.keys(targets).length > 0 ? { targets } : {}),
      });
      created = true;
      oncreated?.();
      // The server names the address; one that is no address of this app is not followed.
      const address = parseAddress(answer.address) ? answer.address : `/samm/${answer.id}`;
      // The person may have left while the request ran: the page they went to is not replaced then.
      if (!destroyed) onnavigate(address, { replace: true });
    } catch (error) {
      if (isApiError(error) && error.outcome === 'VALIDATION') errors = error.errors;
      failure = errorMessageKey(error);
    } finally {
      saving = false;
    }
  }
</script>

<LeaveGuard dirty={() => dirty && !created} />

{#if !canCreate}
  <Sheet testId="new-scope-no-right">
    <EmptyState icon="state.lock" title={$t('samm.new.no-right')}>
      {#snippet actions()}
        <Link href="/samm">{$t('samm.new.back')}</Link>
      {/snippet}
    </EmptyState>
  </Sheet>
{:else if models === null}
  <Sheet testId="new-scope-loading"><p class="muted">{$t('common.loading')}</p></Sheet>
{:else if models.models.length === 0}
  <Sheet testId="new-scope-no-model">
    <EmptyState
      icon="state.alert"
      title={$t('samm.new.no-model.title')}
      body={$t('samm.new.no-model.body')}
    >
      {#snippet actions()}
        <Link href="/samm">{$t('samm.new.back')}</Link>
      {/snippet}
    </EmptyState>
  </Sheet>
{:else}
  <Sheet testId="new-scope-sheet" marginLabel={$t('sheet.margin')}>
    <SheetHead
      kind="scope"
      kindLabel={$t('kind.scope')}
      title={$t('samm.new.scope.title')}
      lede={$t('samm.new.scope.lede')}
      size="title"
    />

    {#if failure}
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
        label={$t('samm.new.scope.name')}
        mark={$t('form.required')}
        bind:value={title}
        error={errorOf('title')}
        testId="new-scope-title"
      />

      <div class="subject">
        <ChoiceGroup
          legend={$t('samm.new.scope.subject')}
          choices={[
            { value: 'team', label: $t('samm.subject.team') },
            { value: 'service', label: $t('samm.subject.service') },
            { value: 'organisation', label: $t('samm.subject.organisation') },
          ]}
          value={kind}
          onchange={(next) => {
            kind = next as SubjectKind;
            reference = undefined;
          }}
          testId="new-scope-kind"
        />
        {#if kind !== 'organisation'}
          {#key kind}
            <CatalogPicker
              label={$t(`samm.subject.${kind}`)}
              catalog={kind}
              value={reference}
              mark={$t('form.required')}
              error={errorOf('subject')}
              onchange={(next) => (reference = next)}
              testId="new-scope-subject"
            />
          {/key}
        {:else if errorOf('subject')}
          <p class="error">{errorOf('subject')}</p>
        {/if}
      </div>

      <Select
        label={$t('samm.new.scope.model')}
        hint={$t('samm.new.scope.model-hint')}
        options={models.models.map((pin) => ({
          value: pin.version,
          label: `${$t('samm.model.name')} ${pin.version}`,
        }))}
        value={version}
        placeholder={$t('form.choose')}
        error={errorOf('modelVersion')}
        onchange={(next) => (chosenVersion = next === '' ? null : next)}
        testId="new-scope-model"
      />
    </div>

    <section class="section" aria-labelledby="new-scope-targets">
      <h2 class="section__title" id="new-scope-targets">{$t('samm.scope.targets')}</h2>
      <p class="section__lede">{$t('samm.new.scope.targets-lede')}</p>
      {#if model}
        <TargetsEditor
          {model}
          {targets}
          onchange={(next) => (targets = next)}
          errors={targetErrorsOf(errors, '/targets')}
          testId="new-scope-targets-editor"
        />
      {:else if modelFailed}
        <Notice tone="attention" title={$t('samm.new.scope.model-unavailable')} />
      {:else}
        <p class="muted">{$t('common.loading')}</p>
      {/if}
    </section>

    {#snippet status()}
      <div class="status">
        <SaveState state={saveState} {label} testId="save-state" />
        <Button
          variant="primary"
          icon="act.save"
          busy={saving}
          onclick={() => void create()}
          disabledReason={reason}
          data-testid="create-scope"
        >
          {$t('samm.new.scope.create')}
        </Button>
      </div>
    {/snippet}

    {#snippet margin()}
      <p class="margin__note">{$t('samm.new.scope.note')}</p>
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

  .subject {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  .section {
    margin-block-start: var(--space-10);
  }

  .section__title {
    margin-block-end: var(--space-2);
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
  }

  .section__lede {
    max-inline-size: var(--measure);
    margin-block-end: var(--space-4);
    color: var(--color-text-secondary);
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
