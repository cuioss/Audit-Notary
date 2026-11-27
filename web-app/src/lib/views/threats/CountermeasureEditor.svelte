<script lang="ts">
  import { tick } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Chip from '../../components/Chip.svelte';
  import Dialog from '../../components/Dialog.svelte';
  import ReasonBadge from '../../components/ReasonBadge.svelte';
  import Select from '../../components/Select.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import TextArea from '../../components/TextArea.svelte';
  import TextField from '../../components/TextField.svelte';
  import type { MitigationStatus, OtmMitigation, OtmThreat } from '../../api/types';
  import { MITIGATION_STATUSES } from '../../api/types';
  import DataTable from '../../forms/DataTable.svelte';
  import { errorKey } from '../../forms/fieldErrors';
  import { t } from '../../i18n';
  import {
    issuesProblem,
    issuesText,
    MAX_DESCRIPTION,
    MAX_ISSUES,
    MAX_MITIGATIONS,
    MAX_NAME,
    mergeEdit,
    nextId,
    parseIssues,
    percentOf,
    type RowErrors,
  } from '../../threats/model';

  /**
   * The countermeasures of a model (UC-TM-2, UC-TM-3, AUN-TM-4): each one belongs to one threat, says whether the work is
   * planned or done, and names the issues that carry it out. The application connects to no issue tracker: the ids are
   * typed by the person (or an agent through the REST API). A countermeasure is edited in a dialog over a copy, so
   * cancelling changes nothing; removing one asks first. A countermeasure whose threat is not in the model is marked,
   * because the server refuses it.
   *
   * The editor holds nothing: it reports the whole list, as the save carries it.
   */
  interface Props {
    /** The countermeasures as they stand. */
    mitigations: OtmMitigation[];
    /** The threats of the model: a countermeasure names one of them. */
    threats: OtmThreat[];
    /** Whether the table shows the countermeasures and offers no act. */
    readonly?: boolean;
    /** What a refusal says about the rows. */
    errors?: RowErrors;
    /** Called with the whole list after a countermeasure was added, changed, moved or removed. */
    onchange?: (mitigations: OtmMitigation[]) => void;
    /** A test id prefix. */
    testId?: string;
  }

  let {
    mitigations,
    threats,
    readonly = false,
    errors = {},
    onchange,
    testId = 'mitigations',
  }: Props = $props();

  let table: DataTable | undefined = $state();
  let editing = $state<{ index: number | null } | undefined>();
  /** The id of the countermeasure the editor opened on: the position is only trusted while it holds that one. */
  let openedId = $state<string | null>(null);
  /** The fields of that countermeasure as the editor opened on them: the base of the merge with a newer list. */
  let openedFields: MitigationFields | undefined;
  /**
   * Whether the countermeasure the editor opened on was missing from a list since. An id can come back for another
   * countermeasure (the next id is one more than the highest left), so once it was gone it stays gone for this editor.
   */
  let openedGone = $state(false);
  let editorOpen = $state(false);
  let dialogNote = $state<string | null>(null);
  let showProblem = $state(false);
  let nameText = $state('');
  let descriptionText = $state('');
  let threatId = $state('');
  let reductionText = $state('50');
  let statusText = $state('');
  let issuesInput = $state('');
  /** The id of the countermeasure the prompt asks about: the prompt names it by its id, never by its position. */
  let removingId = $state<string | null>(null);
  /** Whether that countermeasure was missing from a list since, as {@link openedGone} for the editor. */
  let removingGone = $state(false);
  let removeOpen = $state(false);
  let removed = $derived(
    removeOpen && removingId !== null && !removingGone
      ? (mitigations.find((entry) => entry.id === removingId) ?? null)
      : null,
  );
  $effect(() => {
    if (editorOpen && openedId !== null && !mitigations.some((entry) => entry.id === openedId)) {
      openedGone = true;
    }
    if (
      removeOpen &&
      removingId !== null &&
      !mitigations.some((entry) => entry.id === removingId)
    ) {
      removingGone = true;
    }
  });
  let rowsStale = $state(false);
  $effect.pre(() => {
    void errors;
    rowsStale = false;
  });
  let rows = $derived(rowsStale ? {} : errors);

  let addReason = $derived(
    threats.length === 0
      ? $t('threats.mitigation.no-threat')
      : mitigations.length >= MAX_MITIGATIONS
        ? $t('form.table.max', { count: MAX_MITIGATIONS })
        : null,
  );
  let rowErrorList = $derived(
    Object.entries(rows)
      .map(([row, members]) => ({ row: Number(row), members }))
      .filter((entry) => entry.row >= 0 && entry.row < mitigations.length),
  );
  let listError = $derived(rows[-1]?.list ?? null);
  let issues = $derived(parseIssues(issuesInput));

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
  let threatError = $derived(showProblem && threatId === '' ? $t('form.error.required') : null);
  let reductionError = $derived(
    showProblem && percentOf(reductionText) === null ? $t('threats.percent.error') : null,
  );
  let issuesError = $derived.by(() => {
    const code = issuesProblem(issues);
    if (code === 'MAX_ITEMS') return $t('threats.issues.max', { count: MAX_ISSUES });
    return code === null ? null : $t(errorKey(code));
  });

  /** The fields the dialog edits, in the form in which a dialog and a newer list are compared. */
  interface MitigationFields {
    name: string;
    description: string;
    threat: string;
    riskReduction: number;
    status: string;
    issues: string[];
  }

  /** The catalogue key of the words of each field of the dialog, for the conflict that names it. */
  const FIELD_LABELS: Record<keyof MitigationFields, string> = {
    name: 'threats.field.name',
    description: 'threats.field.description',
    threat: 'threats.mitigation.field.threat',
    riskReduction: 'threats.mitigation.reduction',
    status: 'threats.mitigation.col.status',
    issues: 'threats.mitigation.col.issues',
  };

  /** @param entry a countermeasure @returns its fields as the dialog edits them */
  function fieldsOf(entry: OtmMitigation): MitigationFields {
    return {
      name: entry.name.trim(),
      description: (entry.description ?? '').trim(),
      threat: entry.attributes.threat,
      riskReduction: entry.riskReduction,
      status: entry.attributes.status ?? '',
      issues: entry.attributes.issues ?? [],
    };
  }

  /** @returns the threat a countermeasure names, `null` when the model has none of that id */
  function threatOf(mitigation: OtmMitigation): OtmThreat | null {
    return threats.find((entry) => entry.id === mitigation.attributes.threat) ?? null;
  }

  function openEditor(index: number | null) {
    const held = index === null ? undefined : mitigations[index];
    nameText = held?.name ?? '';
    descriptionText = held?.description ?? '';
    threatId = held?.attributes.threat ?? '';
    reductionText = String(held?.riskReduction ?? 50);
    statusText = held?.attributes.status ?? '';
    issuesInput = issuesText(held?.attributes.issues);
    showProblem = false;
    dialogNote = null;
    openedId = held?.id ?? null;
    openedFields = held ? fieldsOf(held) : undefined;
    openedGone = false;
    editing = { index };
    editorOpen = true;
  }

  function apply() {
    const reduction = percentOf(reductionText);
    if (
      nameText.trim() === '' ||
      nameText.trim().length > MAX_NAME ||
      descriptionText.length > MAX_DESCRIPTION ||
      threatId === '' ||
      reduction === null ||
      issuesProblem(issues) !== null
    ) {
      showProblem = true;
      return;
    }
    const position =
      openedId === null ? -1 : mitigations.findIndex((entry) => entry.id === openedId);
    if (openedId !== null && (position < 0 || openedGone)) {
      dialogNote = $t('threats.mitigation.gone');
      return;
    }
    if (!threats.some((entry) => entry.id === threatId)) {
      dialogNote = $t('threats.mitigation.threat-gone');
      return;
    }
    if (openedId === null && mitigations.length >= MAX_MITIGATIONS) {
      dialogNote = $t('form.table.max', { count: MAX_MITIGATIONS });
      return;
    }
    const held = position < 0 ? undefined : mitigations[position];
    const mine: MitigationFields = {
      name: nameText.trim(),
      description: descriptionText.trim(),
      threat: threatId,
      riskReduction: reduction,
      status: statusText,
      // An issue field the person left as it was keeps the stored ids as they are, whatever they hold (an id may contain
      // a space or a comma, which the text of the field would split).
      issues:
        openedFields && issuesInput === issuesText(openedFields.issues)
          ? openedFields.issues
          : issues,
    };
    // A countermeasure that was changed while the dialog was open keeps what the person did not touch: only the fields
    // they changed are written, and a field both changed to different values is a conflict that is told, never chosen.
    const fields = held && openedFields ? mergeEdit(openedFields, mine, fieldsOf(held)) : null;
    if (fields && fields.conflicts.length > 0) {
      dialogNote = $t('threats.mitigation.conflict', {
        fields: fields.conflicts.map((key) => $t(FIELD_LABELS[key])).join(', '),
      });
      return;
    }
    const merged = fields?.merged ?? mine;
    if (!threats.some((entry) => entry.id === merged.threat)) {
      dialogNote = $t('threats.mitigation.threat-gone');
      return;
    }
    const attributes: OtmMitigation['attributes'] = { ...held?.attributes, threat: merged.threat };
    if (merged.status === '') delete attributes.status;
    else attributes.status = merged.status as MitigationStatus;
    if (merged.issues.length === 0) delete attributes.issues;
    else attributes.issues = merged.issues;
    const next: OtmMitigation = {
      ...held,
      id:
        held?.id ??
        nextId(
          'M',
          mitigations.map((entry) => entry.id),
        ),
      name: merged.name,
      riskReduction: merged.riskReduction,
      attributes,
    };
    if (merged.description === '') delete next.description;
    else next.description = merged.description;
    onchange?.(
      position < 0
        ? [...mitigations, next]
        : mitigations.map((entry, index) => (index === position ? next : entry)),
    );
    editorOpen = false;
  }

  function move(row: number, direction: -1 | 1) {
    const target = row + direction;
    if (target < 0 || target >= mitigations.length) return;
    const next = [...mitigations];
    [next[row], next[target]] = [next[target], next[row]];
    rowsStale = true;
    onchange?.(next);
  }

  async function remove() {
    const id = removingId;
    const gone = removingGone;
    removeOpen = false;
    removingId = null;
    if (id === null || gone) return;
    const index = mitigations.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    rowsStale = true;
    onchange?.(mitigations.filter((_, position) => position !== index));
    await tick();
    await table?.focusRow(index);
  }
</script>

<div class="mitigations" data-testid={testId}>
  <DataTable
    bind:this={table}
    caption={$t('threats.mitigation.caption')}
    columns={[
      { key: 'mitigation', label: $t('threats.mitigation.col.mitigation') },
      { key: 'threat', label: $t('threats.mitigation.col.threat') },
      { key: 'status', label: $t('threats.mitigation.col.status') },
      { key: 'issues', label: $t('threats.mitigation.col.issues') },
    ]}
    rowCount={mitigations.length}
    {readonly}
    empty={$t('threats.mitigation.empty')}
    flagged={(row) => Object.keys(rows[row] ?? {}).length > 0}
    addDisabledReason={addReason}
    rowName={(row) => mitigations[row]?.id ?? String(row + 1)}
    addLabel={$t('threats.mitigation.add.act')}
    note={listError ? $t(errorKey(listError)) : null}
    onadd={() => openEditor(null)}
    onedit={(row) => openEditor(row)}
    onremove={(row) => {
      removingId = mitigations[row]?.id ?? null;
      removingGone = false;
      removeOpen = true;
    }}
    onmove={move}
    testId="{testId}-table"
  >
    {#snippet cell(row, column)}
      {@const entry = mitigations[row]}
      {@const threat = threatOf(entry)}
      {#if column === 0}
        <span class="cell" data-testid="mitigation-{entry.id}">
          <Chip value={entry.id} label={$t('threats.mitigation.id')} />
          <span class="name">{entry.name}</span>
          {#if entry.description}
            <span class="meta">{entry.description}</span>
          {/if}
        </span>
      {:else if column === 1}
        <span class="cell">
          {#if threat}
            <Chip value={threat.id} label={$t('threats.id')} />
            <span class="meta">{threat.name}</span>
          {:else}
            <ReasonBadge
              label={$t('threats.mitigation.unknown-threat')}
              testId="mitigation-unknown-{entry.id}"
            />
          {/if}
        </span>
      {:else if column === 2}
        <span class="cell">
          {#if entry.attributes.status}
            <StatusLabel
              tone={entry.attributes.status === 'implemented' ? 'success' : 'neutral'}
              label={$t(`threats.mitigation.status.${entry.attributes.status}`)}
            />
          {:else}
            <span class="meta">{$t('threats.mitigation.status.none')}</span>
          {/if}
          <span class="measure">
            <span class="meta">{$t('threats.mitigation.reduction')}</span>
            <span class="measure__value">{entry.riskReduction}</span>
          </span>
        </span>
      {:else}
        <span class="cell cell--chips">
          {#each entry.attributes.issues ?? [] as issue (issue)}
            <Chip value={issue} label={$t('threats.mitigation.issue')} />
          {:else}
            <span class="meta">{$t('threats.mitigation.issues.none')}</span>
          {/each}
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
  title={editing?.index === null
    ? $t('threats.mitigation.add.act')
    : $t('threats.mitigation.edit.title')}
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
    <Select
      label={$t('threats.mitigation.field.threat')}
      mark={$t('form.required')}
      options={threats.map((threat) => ({
        value: threat.id,
        label: `${threat.id}: ${threat.name}`,
      }))}
      bind:value={threatId}
      placeholder={$t('threats.mitigation.field.threat.choose')}
      error={threatError}
      testId="{testId}-field-threat"
    />
    <Select
      label={$t('threats.mitigation.col.status')}
      options={MITIGATION_STATUSES.map((value) => ({
        value,
        label: $t(`threats.mitigation.status.${value}`),
      }))}
      bind:value={statusText}
      placeholder={$t('threats.mitigation.status.none')}
      testId="{testId}-field-status"
    />
    <TextField
      label={$t('threats.mitigation.reduction')}
      mark={$t('form.required')}
      type="number"
      step="1"
      hint={$t('threats.percent.hint')}
      bind:value={reductionText}
      error={reductionError}
      testId="{testId}-field-reduction"
    />
    <TextField
      label={$t('threats.mitigation.col.issues')}
      hint={$t('threats.issues.hint')}
      bind:value={issuesInput}
      error={issuesError}
      testId="{testId}-field-issues"
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
  title={$t('threats.mitigation.remove.title')}
  closeLabel={$t('common.close')}
  onclose={() => (removingId = null)}
>
  {#if removed}
    <p>{$t('threats.mitigation.remove.body', { id: removed.id, name: removed.name })}</p>
  {:else if removingGone}
    <p role="alert" data-testid="{testId}-remove-gone">{$t('threats.mitigation.remove.gone')}</p>
  {/if}
  <div class="acts">
    <Button onclick={() => (removeOpen = false)} data-testid="{testId}-remove-cancel">
      {$t('common.cancel')}
    </Button>
    {#if removed}
      <Button variant="danger" onclick={() => void remove()} data-testid="{testId}-remove-confirm">
        {$t('form.table.remove')}
      </Button>
    {/if}
  </div>
</Dialog>

<style>
  .mitigations {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .cell--chips {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .name {
    font-family: var(--font-serif);
    font-weight: var(--weight-semibold);
  }

  .meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  /* A figure stands under its name, so a long name in either language never leaves the figure trailing behind it. */
  .measure {
    display: flex;
    flex-direction: column;
  }

  .measure__value {
    font-family: var(--font-serif);
    font-weight: var(--weight-semibold);
    font-feature-settings: 'lnum' 1;
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

  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-block-start: var(--space-4);
  }
</style>
