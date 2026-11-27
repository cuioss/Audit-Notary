<script lang="ts">
  import { tick } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Chip from '../../components/Chip.svelte';
  import Dialog from '../../components/Dialog.svelte';
  import Link from '../../components/Link.svelte';
  import ReasonBadge from '../../components/ReasonBadge.svelte';
  import Select from '../../components/Select.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import TextArea from '../../components/TextArea.svelte';
  import TextField from '../../components/TextField.svelte';
  import Toggle from '../../components/Toggle.svelte';
  import type { OtmMitigation, OtmThreat, ThreatTreatment } from '../../api/types';
  import { STRIDE_CATEGORIES, THREAT_TREATMENTS } from '../../api/types';
  import DataTable from '../../forms/DataTable.svelte';
  import { errorKey } from '../../forms/fieldErrors';
  import { t } from '../../i18n';
  import {
    categorySlug,
    isUntreated,
    MAX_DESCRIPTION,
    MAX_NAME,
    MAX_THREATS,
    nextId,
    percentOf,
    riskOf,
    treatmentOf,
    type RowErrors,
  } from '../../threats/model';

  /**
   * The threats of a model as a table (UC-TM-2, AUN-TM-4): the threat with its kinds, its likelihood and impact, its
   * status and, where it was carried into the risk register, a link to the risk (read only: the transfer writes it).
   * The status of a threat changes in its row; the rest of a threat is edited in a dialog over a copy, so cancelling
   * changes nothing, and removing one asks first and says that its countermeasures go with it.
   *
   * An open threat that no countermeasure names and that is not transferred is the one that needs the person: it carries
   * the box *Untreated*. The editor holds nothing: it reports the whole lists, as the save carries them.
   */
  interface Props {
    /** The threats as they stand. */
    threats: OtmThreat[];
    /** The countermeasures, for the count of each threat and for the ones that go with a removed threat. */
    mitigations: OtmMitigation[];
    /** Whether the table shows the threats and offers no act. */
    readonly?: boolean;
    /** What a refusal says about the rows. */
    errors?: RowErrors;
    /** Called with both whole lists after a threat was added, changed, moved or removed. */
    onchange?: (threats: OtmThreat[], mitigations: OtmMitigation[]) => void;
    /** A test id prefix. */
    testId?: string;
  }

  let {
    threats,
    mitigations,
    readonly = false,
    errors = {},
    onchange,
    testId = 'threats',
  }: Props = $props();

  let table: DataTable | undefined = $state();
  /** The threat in the editor: its position, or `null` for one to add; `undefined` while the editor is closed. */
  let editing = $state<{ index: number | null } | undefined>();
  /** The id of the threat the editor opened on: the position is only trusted while it still holds that threat. */
  let openedId: string | null = null;
  let editorOpen = $state(false);
  let dialogNote = $state<string | null>(null);
  let showProblem = $state(false);
  let nameText = $state('');
  let descriptionText = $state('');
  let likelihoodText = $state('50');
  let impactText = $state('50');
  let statusText = $state<ThreatTreatment>('open');
  let kinds = $state<string[]>([]);
  let removing = $state<number | null>(null);
  let removingId: string | null = null;
  let removeOpen = $state(false);
  /** Whether the list was reordered or shortened since the server's refusal: its row numbers no longer fit. */
  let rowsStale = $state(false);
  $effect.pre(() => {
    void errors;
    rowsStale = false;
  });
  let rows = $derived(rowsStale ? {} : errors);

  let addReason = $derived(
    threats.length >= MAX_THREATS ? $t('form.table.max', { count: MAX_THREATS }) : null,
  );
  let rowErrorList = $derived(
    Object.entries(rows)
      .map(([row, members]) => ({ row: Number(row), members }))
      .filter((entry) => entry.row >= 0 && entry.row < threats.length),
  );
  let listError = $derived(rows[-1]?.list ?? null);

  let nameError = $derived(
    !showProblem
      ? null
      : nameText.trim() === ''
        ? $t('form.error.required')
        : nameText.trim().length > MAX_NAME
          ? $t('form.error.max-length')
          : null,
  );
  let descriptionError = $derived(
    showProblem && descriptionText.length > MAX_DESCRIPTION ? $t('form.error.max-length') : null,
  );
  let likelihoodError = $derived(
    showProblem && percentOf(likelihoodText) === null ? $t('threats.percent.error') : null,
  );
  let impactError = $derived(
    showProblem && percentOf(impactText) === null ? $t('threats.percent.error') : null,
  );

  /** @returns the countermeasures that treat a threat */
  function treating(threat: OtmThreat): OtmMitigation[] {
    return mitigations.filter((entry) => entry.attributes.threat === threat.id);
  }

  /** @param treatment a status @returns the tone of its dot */
  function tone(treatment: ThreatTreatment): 'neutral' | 'success' {
    return treatment === 'mitigated' ? 'success' : 'neutral';
  }

  function openEditor(index: number | null) {
    const held = index === null ? undefined : threats[index];
    nameText = held?.name ?? '';
    descriptionText = held?.description ?? '';
    likelihoodText = String(held?.risk.likelihood ?? 50);
    impactText = String(held?.risk.impact ?? 50);
    statusText = treatmentOf(held?.attributes.status);
    kinds = [...(held?.categories ?? [])];
    showProblem = false;
    dialogNote = null;
    openedId = held?.id ?? null;
    editing = { index };
    editorOpen = true;
  }

  function apply() {
    const likelihood = percentOf(likelihoodText);
    const impact = percentOf(impactText);
    if (
      nameText.trim() === '' ||
      nameText.trim().length > MAX_NAME ||
      descriptionText.length > MAX_DESCRIPTION ||
      likelihood === null ||
      impact === null
    ) {
      showProblem = true;
      return;
    }
    // The list may have been replaced by a newer one while the dialog was open (live refresh): the threat is found by
    // its id, never by the position it had.
    const position = openedId === null ? -1 : threats.findIndex((entry) => entry.id === openedId);
    if (openedId !== null && position < 0) {
      dialogNote = $t('threats.table.gone');
      return;
    }
    if (openedId === null && threats.length >= MAX_THREATS) {
      dialogNote = $t('form.table.max', { count: MAX_THREATS });
      return;
    }
    const held = position < 0 ? undefined : threats[position];
    const description = descriptionText.trim();
    const next: OtmThreat = {
      ...held,
      id:
        held?.id ??
        nextId(
          'T',
          threats.map((entry) => entry.id),
        ),
      name: nameText.trim(),
      categories: STRIDE_CATEGORIES.filter((name) => kinds.includes(name)),
      risk: { ...held?.risk, likelihood, impact },
      attributes: { ...held?.attributes, status: statusText },
    };
    if (description === '') delete next.description;
    else next.description = description;
    onchange?.(
      position < 0
        ? [...threats, next]
        : threats.map((entry, index) => (index === position ? next : entry)),
      mitigations,
    );
    editorOpen = false;
  }

  function setStatus(row: number, value: string) {
    if (!(THREAT_TREATMENTS as readonly string[]).includes(value)) return;
    const held = threats[row];
    if (!held || held.attributes.status === value) return;
    onchange?.(
      threats.map((entry, index) =>
        index === row
          ? { ...entry, attributes: { ...entry.attributes, status: value as ThreatTreatment } }
          : entry,
      ),
      mitigations,
    );
  }

  function move(row: number, direction: -1 | 1) {
    const target = row + direction;
    if (target < 0 || target >= threats.length) return;
    const next = [...threats];
    [next[row], next[target]] = [next[target], next[row]];
    rowsStale = true;
    onchange?.(next, mitigations);
  }

  async function remove() {
    const asked = removing;
    const id = removingId;
    removeOpen = false;
    removing = null;
    removingId = null;
    if (asked === null || id === null) return;
    // The threat that was confirmed is the one that goes, wherever a newer list holds it now; one that is gone stays gone.
    const index = threats.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    rowsStale = true;
    // A countermeasure belongs to one threat, so the file never holds one of a threat that is gone.
    onchange?.(
      threats.filter((_, position) => position !== index),
      mitigations.filter((entry) => entry.attributes.threat !== id),
    );
    await tick();
    await table?.focusRow(index);
  }

  function toggleKind(name: string, on: boolean) {
    kinds = on ? [...kinds, name] : kinds.filter((entry) => entry !== name);
  }
</script>

<div class="threats" data-testid={testId}>
  <DataTable
    bind:this={table}
    caption={$t('threats.table.caption')}
    columns={[
      { key: 'threat', label: $t('threats.col.threat') },
      { key: 'risk', label: $t('threats.col.risk') },
      { key: 'status', label: $t('threats.col.status') },
      { key: 'treatment', label: $t('threats.col.treatment') },
    ]}
    rowCount={threats.length}
    {readonly}
    empty={$t('threats.table.empty')}
    flagged={(row) => Object.keys(rows[row] ?? {}).length > 0}
    addDisabledReason={addReason}
    rowName={(row) => threats[row]?.id ?? String(row + 1)}
    addLabel={$t('threats.add.act')}
    note={listError ? $t(errorKey(listError)) : null}
    onadd={() => openEditor(null)}
    onedit={(row) => openEditor(row)}
    onremove={(row) => {
      removing = row;
      removingId = threats[row]?.id ?? null;
      removeOpen = true;
    }}
    onmove={move}
    testId="{testId}-table"
  >
    {#snippet cell(row, column)}
      {@const threat = threats[row]}
      {@const treated = treating(threat)}
      {@const risk = riskOf(threat.attributes.transferred)}
      {#if column === 0}
        <span class="cell" data-testid="threat-{threat.id}">
          <Chip value={threat.id} label={$t('threats.id')} />
          <span class="name">{threat.name}</span>
          {#if threat.description}
            <span class="meta">{threat.description}</span>
          {/if}
          {#if threat.categories && threat.categories.length > 0}
            <span class="meta">
              {threat.categories
                .map((name) => $t(`threats.category.${categorySlug(name)}`))
                .join(', ')}
            </span>
          {/if}
        </span>
      {:else if column === 1}
        <span class="cell">
          <span class="meta">{$t('threats.likelihood')}: {threat.risk.likelihood}</span>
          <span class="meta">{$t('threats.impact')}: {threat.risk.impact}</span>
        </span>
      {:else if column === 2}
        <span class="cell">
          {#if readonly}
            <StatusLabel
              tone={tone(treatmentOf(threat.attributes.status))}
              label={$t(`threats.status.${treatmentOf(threat.attributes.status)}`)}
              testId="threat-status-{threat.id}"
            />
          {:else}
            <Select
              label={$t('threats.status.of', { id: threat.id })}
              labelHidden
              options={THREAT_TREATMENTS.map((value) => ({
                value,
                label: $t(`threats.status.${value}`),
              }))}
              value={treatmentOf(threat.attributes.status)}
              placeholder={$t('threats.status.choose')}
              onchange={(value) => setStatus(row, value)}
              testId="threat-status-{threat.id}"
            />
          {/if}
          {#if threat.attributes.transferred}
            <span class="meta" data-testid="threat-transferred-{threat.id}">
              {#if risk && risk.href}
                {$t('threats.transferred')} <Link href={risk.href}>{risk.id}</Link>
              {:else if risk}
                {$t('threats.transferred')} {risk.id}
              {:else}
                {$t('threats.transferred')}
              {/if}
            </span>
          {/if}
        </span>
      {:else}
        <span class="cell">
          {#if treated.length > 0}
            <span>{$t('threats.treated', { count: treated.length })}</span>
          {:else if isUntreated(threat, mitigations)}
            <ReasonBadge label={$t('threats.untreated')} testId="threat-untreated-{threat.id}" />
          {:else}
            <span class="meta">{$t('threats.treated.none')}</span>
          {/if}
        </span>
      {/if}
    {/snippet}
  </DataTable>

  {#if rowErrorList.length > 0}
    <ul class="errors" data-testid="{testId}-errors">
      {#each rowErrorList as entry (entry.row)}
        <li>
          {$t('threats.error.row', {
            number: entry.row + 1,
            problems: Object.entries(entry.members)
              .map(([member, code]) => $t(errorKey(code), { member }))
              .join(' '),
          })}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<Dialog
  bind:open={editorOpen}
  title={editing?.index === null ? $t('threats.add.act') : $t('threats.edit.title')}
  closeLabel={$t('common.close')}
>
  <div class="editor">
    <TextField
      label={$t('threats.field.name')}
      mark={$t('form.required')}
      bind:value={nameText}
      error={nameError}
      testId="{testId}-field-name"
    />
    <TextArea
      label={$t('threats.field.description')}
      hint={$t('form.hint.no-personal-notes')}
      bind:value={descriptionText}
      error={descriptionError}
      testId="{testId}-field-description"
    />
    <fieldset class="kinds">
      <legend class="kinds__legend">{$t('threats.field.categories')}</legend>
      {#each STRIDE_CATEGORIES as name (name)}
        <Toggle
          label={$t(`threats.category.${categorySlug(name)}`)}
          checked={kinds.includes(name)}
          onchange={(on) => toggleKind(name, on)}
          testId="{testId}-category-{categorySlug(name)}"
        />
      {/each}
    </fieldset>
    <div class="pair">
      <TextField
        label={$t('threats.likelihood')}
        mark={$t('form.required')}
        type="number"
        step="1"
        hint={$t('threats.percent.hint')}
        bind:value={likelihoodText}
        error={likelihoodError}
        testId="{testId}-field-likelihood"
      />
      <TextField
        label={$t('threats.impact')}
        mark={$t('form.required')}
        type="number"
        step="1"
        hint={$t('threats.percent.hint')}
        bind:value={impactText}
        error={impactError}
        testId="{testId}-field-impact"
      />
    </div>
    <Select
      label={$t('threats.col.status')}
      options={THREAT_TREATMENTS.map((value) => ({ value, label: $t(`threats.status.${value}`) }))}
      value={statusText}
      placeholder={$t('threats.status.choose')}
      onchange={(value) => {
        if ((THREAT_TREATMENTS as readonly string[]).includes(value)) {
          statusText = value as ThreatTreatment;
        }
      }}
      testId="{testId}-field-status"
    />
    {#if dialogNote}
      <p class="note" role="alert" data-testid="{testId}-dialog-note">{dialogNote}</p>
    {/if}
    <div class="acts">
      <Button onclick={() => (editorOpen = false)} data-testid="{testId}-cancel">
        {$t('common.cancel')}
      </Button>
      <Button variant="primary" onclick={apply} data-testid="{testId}-apply">
        {$t('form.table.editor.apply')}
      </Button>
    </div>
  </div>
</Dialog>

<Dialog
  bind:open={removeOpen}
  title={$t('threats.remove.title')}
  closeLabel={$t('common.close')}
  onclose={() => (removing = null)}
>
  {#if removing !== null && threats[removing]}
    {@const going = treating(threats[removing]).length}
    <p>{$t('threats.remove.body', { id: threats[removing].id, name: threats[removing].name })}</p>
    {#if going > 0}
      <p data-testid="{testId}-remove-treatments">
        {$t('threats.remove.treatments', { count: going })}
      </p>
    {/if}
  {/if}
  <div class="acts">
    <Button onclick={() => (removeOpen = false)} data-testid="{testId}-remove-cancel">
      {$t('common.cancel')}
    </Button>
    <Button variant="danger" onclick={() => void remove()} data-testid="{testId}-remove-confirm">
      {$t('form.table.remove')}
    </Button>
  </div>
</Dialog>

<style>
  .threats {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* A cell of several lines is one item of the stacked row, so its lines stay in the column of the value. */
  .cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .name {
    font-family: var(--font-serif);
    font-weight: var(--weight-semibold);
  }

  .meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  /* The link to the risk of a transferred threat is a target of the phone size (AUN-WEB-2). */
  @media (max-width: 767px) {
    .meta :global(.link) {
      display: inline-flex;
      align-items: center;
      min-block-size: 44px;
      min-inline-size: 44px;
    }
  }

  .errors {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    list-style: none;
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  .note {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-5);
    border: 0;
    padding: 0;
  }

  .kinds__legend {
    inline-size: 100%;
    margin-block-end: var(--space-1);
    font-weight: var(--weight-medium);
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--space-4);
  }

  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-block-start: var(--space-4);
  }
</style>
