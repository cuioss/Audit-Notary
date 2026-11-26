<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import Button from '../../components/Button.svelte';
  import Dialog from '../../components/Dialog.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import HistoryList from '../../components/HistoryList.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import SaveState, { type SaveStateKind } from '../../components/SaveState.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError, type FieldError } from '../../api/errors';
  import type { CatalogEntryRead, JsonObject, JsonSchema, ProtectionNeeds } from '../../api/types';
  import {
    CATALOG_CATEGORY,
    catalogHistory,
    catalogKind,
    entryAddress,
    formSchema,
    nameOfRef,
  } from '../../catalogs/catalogs';
  import { guardLeaving } from '../../documents/leave';
  import SchemaForm from '../../forms/SchemaForm.svelte';
  import { jsonEqual } from '../../forms/schema';
  import { formatDateTime, formatTime } from '../../format';
  import { currentLocale, messagesStore, t } from '../../i18n';
  import { parseAddress } from '../../routes';
  import { session } from '../../stores/app';
  import { now } from '../../stores/clock';
  import ServiceNeeds from './ServiceNeeds.svelte';

  /**
   * One entry of a catalog as a sheet, to read, to change or, without `entry`, to create (UC-CAT-1 to UC-CAT-4): the
   * form generated from the catalog's schema, the signed history in the margin, and for a service the protection needs
   * its dependencies come to.
   *
   * A catalog entry has no draft and no blob: the last save wins (rest-api.adoc, Decided Provisionally with the
   * directory, point 4). What the person types lives in the page until the first save, so leaving asks. Without the
   * right, and for a retired entry, the same sheet reads. The view reads the entry and the list again when the sheet
   * says something changed (`onchanged`) and when the event stream names the entry.
   */
  interface Props {
    /** The catalog. */
    catalog: string;
    /** The schema of its entries. */
    schema: JsonSchema;
    /** The entry as read; `null` for a new one. */
    entry: CatalogEntryRead | null;
    /** Whether the user holds the right `administer-catalogs`. */
    canAdminister: boolean;
    /** Called after the sheet changed something the view shows: a save, a creation, a retirement. */
    onchanged: () => void;
    /** Opens an address inside the app; `replace` takes the new entry's place in the history. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
  }

  let { catalog, schema, entry, canAdminister, onchanged, onnavigate }: Props = $props();

  // The sheet belongs to one entry or to one new entry (the view remounts it for another): the mode never changes.
  const isNew = untrack(() => entry === null);
  const id = untrack(() => entry?.id ?? '');

  /**
   * @param source a JSON object
   * @returns a copy that shares nothing with it
   */
  function copy(source: JsonObject): JsonObject {
    return JSON.parse(JSON.stringify(source)) as JsonObject;
  }

  let value = $state<JsonObject>(copy(untrack(() => entry?.value ?? {})));
  /** What the server holds, as far as this page knows: what the form is compared with. */
  let baseline = $state<JsonObject>(copy(untrack(() => entry?.value ?? {})));
  let errors = $state<FieldError[] | null>(null);
  let failure = $state<string | null>(null);
  let saving = $state(false);
  let retiring = $state(false);
  let savedAt = $state<string | null>(null);
  let announcement = $state('');
  /** Who saved the entry after this page read it, while the person has changes of their own. */
  let staleBy = $state<string | null>(null);
  /** Whether the form is gone: a request that returns later navigates nowhere. */
  let destroyed = false;
  onDestroy(() => {
    destroyed = true;
  });
  let created = false;
  let asking = $state(false);
  let proceed: (() => void) | null = null;
  let confirmRetire = $state(false);

  /** Whether this page retired the entry: it reads only from then on, before the entry is read again. */
  let retiredHere = $state(false);
  let retired = $derived(entry?.retired === true || retiredHere);
  let canEdit = $derived(canAdminister && !retired);
  let dirty = $derived(isNew ? Object.keys(value).length > 0 : !jsonEqual(value, baseline));
  let kind = $derived(catalogKind($messagesStore, catalog));
  let name = $derived(entry?.name ?? '');
  let shownSchema = $derived(formSchema(schema, !isNew));
  let effective = $derived(entry?.effective ?? null);
  let own = $derived({ ref: `${catalog}:${id}`, name });

  /** The entry as the server held it when a change by someone else arrived while the person had changes of their own. */
  let held: CatalogEntryRead | null = null;

  /**
   * Takes an entry as read as what the server holds: the baseline and the form show it.
   *
   * @param read the entry as read
   */
  function adopt(read: CatalogEntryRead) {
    baseline = copy(read.value);
    value = copy(read.value);
    staleBy = null;
    // A retired entry reads only: what the server refused to save has no place on it.
    if (read.retired) errors = null;
  }

  // The entry read again: a change by someone else replaces what the person has not touched and warns them of what
  // they have, until they have none; the person's own save returns the same entry and changes nothing.
  let seen = untrack(() => entry?.at ?? null);
  $effect(() => {
    const read = entry;
    if (!read || read.at === seen) return;
    untrack(() => {
      seen = read.at;
      const by = read.history[0]?.by;
      const mine = by !== undefined && by.pseudonym === get(session)?.user.pseudonym;
      // A retired entry reads only: what the person typed has no place to go, so the entry as read replaces it.
      if (dirty && !read.retired) {
        held = read;
        if (!mine && by) staleBy = by.name;
        return;
      }
      held = null;
      adopt(read);
      if (!mine && by) announcement = $t('catalogs.saved-by-other', { name: by.name });
    });
  });

  // The person has no changes any more, by a save or by taking them back: the entry that arrived meanwhile shows.
  $effect(() => {
    if (dirty || isNew) return;
    untrack(() => {
      if (held === null) return;
      const read = held;
      held = null;
      adopt(read);
      const by = read.history[0]?.by;
      if (by && by.pseudonym !== get(session)?.user.pseudonym) {
        announcement = $t('catalogs.saved-by-other', { name: by.name });
      }
    });
  });

  guardLeaving(
    () => dirty && !created,
    (go) => {
      proceed = go;
      asking = true;
    },
  );

  function leave() {
    asking = false;
    proceed?.();
    proceed = null;
  }

  let saveState = $derived<SaveStateKind>(
    !canEdit
      ? 'read-only'
      : saving
        ? 'saving'
        : errors || failure
          ? 'failed'
          : dirty
            ? 'changed'
            : savedAt
              ? 'saved'
              : 'clean',
  );
  let label = $derived.by(() => {
    if (retired) return $t('catalogs.read-only.retired');
    if (!canAdminister) return $t('catalogs.read-only.right');
    if (saving) return $t('catalogs.save.saving');
    if (errors) return $t('catalogs.save.invalid');
    if (failure) return $t('catalogs.save.failed');
    if (dirty) return isNew ? $t('catalogs.save.new') : $t('catalogs.save.changed');
    if (savedAt) return $t('catalogs.save.saved', { time: formatTime(savedAt, $currentLocale) });
    return isNew ? $t('catalogs.save.new.clean') : $t('catalogs.save.clean');
  });

  async function save() {
    if (saving || retiring || !dirty || !canEdit) return;
    saving = true;
    failure = null;
    errors = null;
    try {
      if (isNew) {
        const answer = await apiClient.createCatalogEntry(catalog, value);
        created = true;
        onchanged();
        // The server names the address; one that is no address of this app is not followed.
        const address = parseAddress(answer.address)
          ? answer.address
          : entryAddress(catalog, answer.id);
        // The person may have left while the request ran: the page they went to is not replaced then.
        if (!destroyed) onnavigate(address, { replace: true });
      } else {
        const answer = await apiClient.changeCatalogEntry(catalog, id, { ...value, id });
        baseline = copy(value);
        savedAt = answer.at;
        staleBy = null;
        onchanged();
      }
    } catch (error) {
      if (isApiError(error) && error.outcome === 'VALIDATION') errors = error.errors;
      // A change to an entry that was retired meanwhile: the entry is read again and shows itself retired.
      if (isApiError(error) && error.outcome === 'RETIRED') onchanged();
      failure = errorMessageKey(error);
    } finally {
      saving = false;
    }
  }

  async function retire() {
    confirmRetire = false;
    if (retiring || saving || isNew || !canEdit) return;
    retiring = true;
    failure = null;
    try {
      await apiClient.retireCatalogEntry(catalog, id);
      // The entry is retired from here on, whenever it is read again.
      retiredHere = true;
      held = null;
      staleBy = null;
      errors = null;
      // What was typed and not saved is dropped with the retirement: a retired entry reads only.
      value = copy(baseline);
      announcement = $t('catalogs.retire.done', { name });
      onchanged();
    } catch (error) {
      failure = errorMessageKey(error);
    } finally {
      retiring = false;
    }
  }

  let facts = $derived(
    entry
      ? [
          {
            term: $t('catalogs.fact.saved'),
            value: $t('catalogs.fact.saved.value', {
              name: entry.history[0]?.by.name ?? '',
              when: formatDateTime(entry.at, $currentLocale),
            }),
          },
        ]
      : [],
  );
  let cycle = $derived(
    effective?.cycle?.map((ref) => nameOfRef(ref, own, effective)).join(', ') ?? null,
  );
  // The stored needs come from the entry that supplies the effective ones, never from the form or its baseline.
  let stored = $derived(
    ((entry?.value['protection-needs'] as Partial<ProtectionNeeds> | undefined) ??
      {}) as Partial<ProtectionNeeds>,
  );
</script>

{#if isNew && !canAdminister}
  <Sheet testId="entry-no-right">
    <EmptyState icon="state.lock" title={$t('catalogs.no-right')}>
      {#snippet actions()}
        <Link href="/catalogs/{catalog}">{$t('catalogs.back')}</Link>
      {/snippet}
    </EmptyState>
  </Sheet>
{:else}
  <Sheet testId="entry-sheet" marginLabel={$t('sheet.margin')}>
    <SheetHead
      kind="entry"
      kindLabel={kind}
      title={isNew ? $t('catalogs.new.title', { kind }) : name}
      size="title"
      {facts}
    >
      {#snippet state()}
        {#if retired}
          <StatusLabel tone="neutral" label={$t('form.mark.retired')} testId="entry-state" />
        {/if}
      {/snippet}
    </SheetHead>

    {#if retired}
      <div class="notice" data-testid="retired-notice">
        <Notice
          tone="info"
          title={$t('catalogs.retired.title')}
          body={$t('catalogs.retired.body')}
        />
      </div>
    {/if}
    {#if cycle}
      <div class="notice" data-testid="cycle-notice">
        <Notice
          tone="attention"
          title={$t('catalogs.cycle.title')}
          body={$t('catalogs.cycle.body', { names: cycle })}
        />
      </div>
    {/if}
    {#if staleBy}
      <div class="notice" data-testid="stale-notice">
        <Notice tone="attention" title={$t('catalogs.stale', { name: staleBy })} live />
      </div>
    {/if}
    {#if failure}
      <div class="notice" data-testid="failure-notice">
        <Notice tone="danger" title={$t(failure)} live />
      </div>
    {/if}

    <SchemaForm
      schema={shownSchema}
      category={CATALOG_CATEGORY}
      kind={catalog}
      bind:value
      {errors}
      readonly={!canEdit || saving || retiring}
      testId="entry-form"
    />

    {#if effective && entry && catalog === 'service'}
      <ServiceNeeds {entry} {effective} {stored} />
    {/if}
    <p class="sr-only" role="status" aria-live="polite">{announcement}</p>

    {#snippet status()}
      <div class="status">
        <SaveState state={saveState} {label} testId="save-state" />
        {#if canEdit}
          <Button
            variant="primary"
            icon="act.save"
            busy={saving}
            onclick={() => void save()}
            disabledReason={dirty
              ? null
              : isNew
                ? $t('catalogs.new.nothing')
                : $t('catalogs.save.nothing')}
            data-testid="save-entry"
          >
            {$t('catalogs.save')}
          </Button>
        {/if}
      </div>
    {/snippet}

    {#snippet margin()}
      <div class="margin">
        {#if canEdit}
          <p class="margin__note">
            {isNew ? $t('catalogs.new.lede') : $t('catalogs.save.note')}
          </p>
        {/if}
        {#if canEdit && !isNew}
          <section class="margin__block" data-testid="retire-block">
            <h2 class="margin__title">{$t('catalogs.retire.heading')}</h2>
            <p class="margin__text">{$t('catalogs.retire.lede')}</p>
            <Button
              busy={retiring}
              disabledReason={saving ? $t('catalogs.save.saving') : null}
              onclick={() => (confirmRetire = true)}
              data-testid="retire-entry"
            >
              {$t('catalogs.retire')}
            </Button>
          </section>
        {/if}
        {#if entry}
          <section class="margin__block">
            <h2 class="margin__title">{$t('sheet.history')}</h2>
            <HistoryList
              entries={catalogHistory(entry.history, $t, $currentLocale, $now)}
              label={$t('sheet.history')}
              testId="entry-history"
            />
          </section>
        {/if}
      </div>
    {/snippet}
  </Sheet>
{/if}

<Dialog
  bind:open={asking}
  title={$t('documents.new.leave.title')}
  closeLabel={$t('common.close')}
  onclose={() => (proceed = null)}
>
  <p>{$t('documents.new.leave.body')}</p>
  <div class="dialog__acts">
    <Button onclick={() => (asking = false)} data-testid="leave-stay">
      {$t('documents.new.leave.stay')}
    </Button>
    <Button variant="danger" onclick={leave} data-testid="leave-confirm">
      {$t('documents.new.leave.confirm')}
    </Button>
  </div>
</Dialog>

<Dialog
  bind:open={confirmRetire}
  title={$t('catalogs.retire.title', { name })}
  closeLabel={$t('common.close')}
>
  <p>{$t('catalogs.retire.body')}</p>
  {#if dirty}
    <p data-testid="retire-dirty">{$t('catalogs.retire.dirty')}</p>
  {/if}
  <div class="dialog__acts">
    <Button onclick={() => (confirmRetire = false)} data-testid="retire-cancel">
      {$t('common.cancel')}
    </Button>
    <Button variant="danger" onclick={() => void retire()} data-testid="retire-confirm">
      {$t('catalogs.retire')}
    </Button>
  </div>
</Dialog>

<style>
  .notice {
    margin-block-end: var(--space-6);
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
    align-items: flex-start;
    gap: var(--space-3);
  }

  .margin__block :global(.history) {
    align-self: stretch;
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

  .dialog__acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-block-start: var(--space-5);
  }
</style>
