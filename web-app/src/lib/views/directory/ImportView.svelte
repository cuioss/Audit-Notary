<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Chip from '../../components/Chip.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import FilePicker from '../../components/FilePicker.svelte';
  import GridTable from '../../components/GridTable.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import ReasonBadge from '../../components/ReasonBadge.svelte';
  import TextArea from '../../components/TextArea.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError } from '../../api/errors';
  import type { ImportDocument, ImportResult } from '../../api/types';
  import { canAdminister, catalogKind, entryAddress } from '../../catalogs/catalogs';
  import {
    byteLength,
    changedFieldLabel,
    IMPORT_ADDRESS,
    importBudget,
    importReasonKey,
    MAX_IMPORT_BYTES,
    MAX_IMPORT_DOCUMENTS,
    sizeParts,
  } from '../../directory/directory';
  import { messagesStore, t } from '../../i18n';
  import { session } from '../../stores/app';
  import { breadcrumb } from '../../stores/breadcrumb';
  import WizardPage from '../../templates/WizardPage.svelte';

  /**
   * The Backstage import (UC-CAT-3, `/directory/import`) as a wizard of three steps: choose the descriptor documents,
   * check what the import would do (the preview writes nothing), import and read the result. The documents are read in
   * the browser and sent as text; the application fetches nothing from Backstage. The result is created, updated,
   * unchanged and what was left out, each with its reason. Needs `administer-catalogs`; without it the page says so and
   * shows nothing else.
   */
  type Step = 'choose' | 'preview' | 'done';

  let step = $state<Step>('choose');
  let documents = $state<ImportDocument[]>([]);
  let pasted = $state('');
  let result = $state<ImportResult | null>(null);
  /** The documents the preview was made of: the import sends exactly these, whatever was chosen meanwhile. */
  let checked = $state<ImportDocument[]>([]);
  let working = $state(false);
  let failure = $state<string | null>(null);
  /** The position of the document the server found invalid, or `null`. */
  let invalid = $state<number | null>(null);
  /** The server's limit when it refused the size, in bytes. */
  let limit = $state<number | null>(null);
  let announcement = $state('');
  let pastes = 0;

  let administer = $derived(canAdminister($session));
  let budget = $derived(importBudget(documents));
  let size = $derived(sizeParts(budget.bytes));
  let cap = $derived(sizeParts(MAX_IMPORT_BYTES));
  let changes = $derived(result ? result.created.length + result.updated.length : 0);

  onMount(() => {
    breadcrumb.set([{ label: $t('import.title'), href: IMPORT_ADDRESS }]);
    return () => breadcrumb.set([]);
  });

  /**
   * @param count the size of a text in bytes
   * @returns it as the line of a chosen document reads it
   */
  function sizeText(count: number): string {
    const parts = sizeParts(count);
    return $t('import.size', { value: parts.value, unit: $t(`import.unit.${parts.unit}`) });
  }

  /**
   * Puts a document in the list. The same file chosen again (same name, same text) stands once; a different text under
   * a name that is taken (every repository has a `catalog-info.yaml`) is kept as a further document with a number after
   * the name, so that no descriptor is dropped silently.
   */
  function keep(document: ImportDocument) {
    const again = documents.some(
      (held) =>
        held.content === document.content &&
        (held.name === document.name || held.name.startsWith(`${document.name} (`)),
    );
    if (!again) {
      let name = document.name;
      for (let n = 2; documents.some((held) => held.name === name); n += 1) {
        name = `${document.name} (${n})`;
      }
      documents = [...documents, { name, content: document.content }];
    }
    invalid = null;
    limit = null;
    failure = null;
  }

  async function picked(files: File[]) {
    for (const file of files) {
      keep({ name: file.name, content: await file.text() });
    }
  }

  function addPasted() {
    if (pasted.trim() === '') return;
    pastes += 1;
    keep({ name: $t('import.pasted.name', { n: pastes }), content: pasted });
    pasted = '';
  }

  function remove(name: string) {
    documents = documents.filter((document) => document.name !== name);
    invalid = null;
    limit = null;
    failure = null;
  }

  /**
   * Sends the documents to the preview or to the import and takes the answer, or tells the refusal.
   *
   * @param send the request
   * @param next the step the answer leads to
   */
  async function run(send: () => Promise<ImportResult>, next: Step) {
    if (working) return;
    working = true;
    failure = null;
    invalid = null;
    limit = null;
    try {
      result = await send();
      step = next;
      announcement =
        next === 'done'
          ? $t('import.done.announce', {
              created: result.created.length,
              updated: result.updated.length,
            })
          : $t('import.preview.announce');
    } catch (error) {
      if (isApiError(error) && error.outcome === 'VALIDATION') {
        const first = error.errors.find((item) => /^\/documents\/\d+/.test(item.pointer));
        invalid = first ? Number(/^\/documents\/(\d+)/.exec(first.pointer)?.[1]) : null;
        failure = invalid === null ? 'import.error.documents' : 'import.error.format';
        // The mark of the document stands in the list of documents: the person goes back to it.
        if (invalid !== null && step === 'preview') back(failure);
      } else if (isApiError(error) && error.outcome === 'TOO_LARGE') {
        limit = typeof error.details.limit === 'number' ? error.details.limit : MAX_IMPORT_BYTES;
        failure = 'import.error.too-large';
      } else {
        failure = errorMessageKey(error);
      }
    } finally {
      working = false;
    }
  }

  const preview = () => {
    const sent = documents;
    return run(async () => {
      const answer = await apiClient.previewBackstageImport(sent);
      checked = sent;
      return answer;
    }, 'preview');
  };
  const apply = () => run(() => apiClient.importBackstage(checked), 'done');

  /** @param notice the notice that stays on the page of the documents, if any */
  function back(notice: string | null = null) {
    step = 'choose';
    result = null;
    failure = notice;
    announcement = '';
  }

  function again() {
    documents = [];
    pasted = '';
    back();
  }

  /** @returns why the check cannot be taken now, or `null` */
  function chooseReason(): string | null {
    if (documents.length === 0) return $t('import.check.nothing');
    if (budget.tooMany) return $t('import.limit.documents', { count: MAX_IMPORT_DOCUMENTS });
    if (budget.tooLarge) {
      return $t('import.limit.size', { value: cap.value, unit: $t(`import.unit.${cap.unit}`) });
    }
    return null;
  }

  /**
   * @param catalog a catalog of a created or updated entry
   * @returns the word for one of its entries
   */
  /** The titles of the lists of created and updated entries: in the check they are still to come. */
  let createdTitle = $derived(
    step === 'preview' ? 'import.preview.created.title' : 'import.created.title',
  );
  let updatedTitle = $derived(
    step === 'preview' ? 'import.preview.updated.title' : 'import.updated.title',
  );

  const kindOf = (catalog: string): string => catalogKind($messagesStore, catalog);
</script>

<WizardPage
  title={$t('import.title')}
  intro={administer ? $t('import.intro') : undefined}
  testId="import-view"
  wide
>
  {#if !administer}
    <EmptyState icon="state.lock" title={$t('import.no-right')}>
      {#snippet actions()}
        <Link href="/catalogs">{$t('import.back')}</Link>
      {/snippet}
    </EmptyState>
  {:else}
    <ol class="steps" aria-label={$t('import.steps')} data-testid="import-steps">
      {#each ['choose', 'preview', 'done'] as name, position (name)}
        <li aria-current={step === name ? 'step' : undefined} class:steps__now={step === name}>
          <span class="steps__number">{position + 1}</span>
          {$t(`import.step.${name}`)}
        </li>
      {/each}
    </ol>

    {#if failure}
      <div data-testid="import-failure">
        <Notice
          tone="danger"
          title={$t(failure)}
          body={limit !== null
            ? $t('import.error.limit', {
                value: sizeParts(limit).value,
                unit: $t(`import.unit.${sizeParts(limit).unit}`),
              })
            : undefined}
          live
        />
      </div>
    {/if}

    {#if step === 'choose'}
      <section class="import__section" data-testid="import-choose">
        <h2 class="import__heading">{$t('import.choose.title')}</h2>
        <p class="import__muted">{$t('import.choose.lede')}</p>
        <div class="import__pick">
          <FilePicker
            label={$t('import.pick')}
            accept=".yaml,.yml,.json,text/yaml,application/json"
            multiple
            onpick={(files) => void picked(files)}
            testId="import-pick"
          />
        </div>
        <TextArea
          label={$t('import.paste')}
          hint={$t('import.paste.hint')}
          bind:value={pasted}
          rows={8}
          testId="import-paste"
        />
        <div class="import__pick">
          <Button
            disabledReason={pasted.trim() === '' ? $t('import.paste.nothing') : null}
            onclick={addPasted}
            data-testid="import-paste-add"
          >
            {$t('import.paste.add')}
          </Button>
        </div>

        {#if documents.length > 0}
          <h2 class="import__heading">{$t('import.chosen.title')}</h2>
          <ul class="documents" data-testid="import-documents">
            {#each documents as document, position (document.name)}
              <li class="document" data-testid="import-document-{position}">
                <span class="document__name">{document.name}</span>
                <span class="document__size">{sizeText(byteLength(document.content))}</span>
                {#if invalid === position}
                  <ReasonBadge
                    label={$t('import.document.invalid')}
                    testId="import-document-invalid"
                  />
                {/if}
                <Button
                  variant="ghost"
                  icon="act.close"
                  aria-label={$t('import.remove.named', { name: document.name })}
                  onclick={() => remove(document.name)}
                  data-testid="import-remove-{position}"
                >
                  {$t('import.remove')}
                </Button>
              </li>
            {/each}
          </ul>
          <p class="import__muted" data-testid="import-budget">
            {$t('import.budget', {
              count: budget.count,
              max: MAX_IMPORT_DOCUMENTS,
              value: size.value,
              unit: $t(`import.unit.${size.unit}`),
              cap: cap.value,
              capUnit: $t(`import.unit.${cap.unit}`),
            })}
          </p>
        {/if}
      </section>
    {:else if result}
      <section class="import__section" data-testid="import-result">
        {#if step === 'preview'}
          <Notice tone="info" title={$t('import.preview.title')} body={$t('import.preview.body')} />
        {:else}
          <Notice
            tone="success"
            title={$t('import.done.title')}
            body={$t('import.done.body')}
            live
          />
        {/if}
        <dl class="counts" data-testid="import-counts">
          <div>
            <dt>
              {$t(step === 'preview' ? 'import.preview.count.created' : 'import.count.created')}
            </dt>
            <dd data-testid="count-created">{result.created.length}</dd>
          </div>
          <div>
            <dt>
              {$t(step === 'preview' ? 'import.preview.count.updated' : 'import.count.updated')}
            </dt>
            <dd data-testid="count-updated">{result.updated.length}</dd>
          </div>
          <div>
            <dt>{$t('import.count.unchanged')}</dt>
            <dd data-testid="count-unchanged">{result.unchanged}</dd>
          </div>
          <div>
            <dt>{$t('import.count.left-out')}</dt>
            <dd data-testid="count-left-out">{result.leftOut.length}</dd>
          </div>
        </dl>

        {#if result.created.length > 0}
          <h2 class="import__heading">{$t(createdTitle)}</h2>
          <GridTable
            caption={$t(createdTitle)}
            heads={[$t('import.col.name'), $t('import.col.kind'), $t('import.col.id')]}
            testId="import-created"
          >
            {#each result.created as item (`${item.catalog}:${item.id}`)}
              <tr data-testid="created-{item.catalog}-{item.id}">
                <th scope="row">
                  {#if step === 'done'}
                    <Link href={entryAddress(item.catalog, item.id)}>{item.name}</Link>
                  {:else}
                    {item.name}
                  {/if}
                </th>
                <td data-label={$t('import.col.kind')}>{kindOf(item.catalog)}</td>
                <td data-label={$t('import.col.id')}><Chip value={item.id} /></td>
              </tr>
            {/each}
          </GridTable>
        {/if}

        {#if result.updated.length > 0}
          <h2 class="import__heading">{$t(updatedTitle)}</h2>
          <GridTable
            caption={$t(updatedTitle)}
            heads={[$t('import.col.name'), $t('import.col.kind'), $t('import.col.changed')]}
            testId="import-updated"
          >
            {#each result.updated as item (`${item.catalog}:${item.id}`)}
              <tr data-testid="updated-{item.catalog}-{item.id}">
                <th scope="row">
                  <Link href={entryAddress(item.catalog, item.id)}>{item.name}</Link>
                </th>
                <td data-label={$t('import.col.kind')}>{kindOf(item.catalog)}</td>
                <td data-label={$t('import.col.changed')}>
                  {item.changed
                    .map((path) => changedFieldLabel($messagesStore, item.catalog, path))
                    .join(', ')}
                </td>
              </tr>
            {/each}
          </GridTable>
        {/if}

        {#if result.leftOut.length > 0}
          <h2 class="import__heading">{$t('import.left-out.title')}</h2>
          <p class="import__muted">{$t('import.left-out.lede')}</p>
          <GridTable
            caption={$t('import.left-out.title')}
            heads={[$t('import.col.entity'), $t('import.col.reason'), $t('import.col.detail')]}
            testId="import-left-out"
          >
            {#each result.leftOut as item, position (position)}
              <tr data-testid="left-out-{position}" data-reason={item.reason}>
                <th scope="row" class="left-out__entity">
                  <Chip value={item.entity} />
                  {#if item.field}
                    <span class="left-out__field">{item.field}</span>
                  {/if}
                </th>
                <td data-label={$t('import.col.reason')}>{$t(importReasonKey(item.reason))}</td>
                <td data-label={$t('import.col.detail')}>{item.detail ?? ''}</td>
              </tr>
            {/each}
          </GridTable>
        {/if}
      </section>
    {/if}
    <p class="sr-only" role="status" aria-live="polite">{announcement}</p>

    <div class="import__acts" data-testid="import-acts">
      {#if step === 'choose'}
        <Button
          variant="primary"
          busy={working}
          disabledReason={chooseReason()}
          onclick={() => void preview()}
          data-testid="import-check"
        >
          {$t('import.check')}
        </Button>
      {:else if step === 'preview'}
        <Button onclick={() => back()} data-testid="import-back">{$t('import.change')}</Button>
        <Button
          variant="primary"
          busy={working}
          disabledReason={changes === 0 ? $t('import.apply.nothing') : null}
          onclick={() => void apply()}
          data-testid="import-apply"
        >
          {$t('import.apply')}
        </Button>
      {:else}
        <Button onclick={again} data-testid="import-again">{$t('import.again')}</Button>
        <Link href="/catalogs" look="primary" data-testid="import-open">
          {$t('import.open')}
        </Link>
      {/if}
    </div>
  {/if}
</WizardPage>

<style>
  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-6);
    list-style: none;
    padding: 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .steps li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .steps__now {
    color: var(--color-text-primary);
    font-weight: var(--weight-semibold);
  }

  .steps__number {
    display: inline-grid;
    place-items: center;
    inline-size: var(--space-6);
    block-size: var(--space-6);
    border: 1px solid currentColor;
    border-radius: 50%;
    font-variant-numeric: tabular-nums;
  }

  .import__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .import__heading {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
    font-weight: var(--weight-semibold);
    margin-block-start: var(--space-3);
  }

  .import__muted {
    max-inline-size: var(--measure);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .import__pick {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .import__pick :global(.btn-with-reason) {
    align-items: flex-start;
  }

  .import__pick :global(.btn__reason) {
    text-align: start;
  }

  .documents {
    display: flex;
    flex-direction: column;
    list-style: none;
    padding: 0;
  }

  .document {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    padding-block: var(--space-1);
    border-block-end: 1px solid var(--color-border);
  }

  .document__name {
    flex: 1 1 12rem;
    min-inline-size: 0;
    overflow-wrap: anywhere;
    font-weight: var(--weight-medium);
  }

  .document__size {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .import__acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-block-start: var(--space-4);
    padding-block-start: var(--space-4);
    border-block-start: 1px solid var(--color-border);
  }

  .counts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: var(--space-4);
  }

  .counts dt {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .counts dd {
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    font-variant-numeric: tabular-nums;
  }

  /* An entity reference is read whole, not broken at its hyphen: the table gives the column the width it needs. */
  .left-out__entity :global(.chip) {
    white-space: nowrap;
    overflow-wrap: normal;
  }

  @container (max-width: 40rem) {
    .left-out__entity :global(.chip) {
      white-space: normal;
      overflow-wrap: anywhere;
    }
  }

  .left-out__field {
    display: block;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    overflow-wrap: anywhere;
  }
</style>
