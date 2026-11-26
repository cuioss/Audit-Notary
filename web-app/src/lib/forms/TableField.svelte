<script lang="ts">
  import Button from '../components/Button.svelte';
  import Dialog from '../components/Dialog.svelte';
  import FieldFrame from '../components/FieldFrame.svelte';
  import { messagesStore, t } from '../i18n';
  import { useForm } from './context';
  import DataTable, { type TableColumn } from './DataTable.svelte';
  import ReadValue from './ReadValue.svelte';
  import RowEditor from './RowEditor.svelte';
  import { childPointer, getAt, jsonEqual, tableColumns, type FieldNode } from './schema';
  import { labelOf } from './texts';

  /**
   * An array as a `DataTable` with a row editor (AUN-WEB-4, Choosing the Component, rule 12): a row can be added, edited,
   * removed and moved up or down, within `minItems` and `maxItems`; the editor is a dialog over a copy of the row, so
   * that cancelling changes nothing. The table shows the first four scalar properties of a row, or the one column of a
   * scalar item. Read, it is the table alone.
   */
  interface Props {
    /** The array. */
    node: FieldNode;
    /** The label of the list. */
    label: string;
    /** The lines of help. */
    hints: string[];
    /** The error of the list as a whole, as text. */
    error: string | null;
    /** Whether the table is read: the form, a section above or the property says so. */
    reading?: boolean;
  }

  let { node, label, hints, error, reading = false }: Props = $props();

  const form = useForm();

  let rows = $derived.by((): unknown[] => {
    const held = form.valueAt(node.pointer);
    return Array.isArray(held) ? held : [];
  });
  let columnNodes = $derived(tableColumns(node, form.root));
  let columns = $derived(
    columnNodes.map((column): TableColumn => ({
      key: column.pointer === '' ? '(item)' : column.name,
      label: labelOf($messagesStore, form.category, form.kind, column.path, column.name),
    })),
  );
  let minItems = $derived(typeof node.schema.minItems === 'number' ? node.schema.minItems : 0);
  let maxItems = $derived(typeof node.schema.maxItems === 'number' ? node.schema.maxItems : null);
  let addDisabledReason = $derived(
    maxItems !== null && rows.length >= maxItems ? $t('form.table.max', { count: maxItems }) : null,
  );
  let canRemove = $derived(rows.length > minItems);

  /**
   * The row in the editor: its index, or `null` for a row to add, and the row as it was when the editor opened;
   * `undefined` while there is none. The row is what the draft is applied to: a row that has changed since is not.
   */
  let editing: { index: number | null; row: unknown } | undefined = $state();
  let editorOpen = $state(false);
  /** The row to remove, with the row as it was when the question was asked. */
  let removing: { index: number; row: unknown } | undefined = $state();
  let removeOpen = $state(false);
  let table: DataTable | undefined = $state();

  /** @param next the rows after the act @param touched the place whose errors go stale */
  function commit(next: unknown[], touched: string = node.pointer): void {
    form.change(node.pointer, next, touched);
  }

  /** @param index the row to edit, or `null` to add one */
  function openEditor(index: number | null): void {
    editing = { index, row: index === null ? undefined : $state.snapshot(rows[index]) };
    editorOpen = true;
  }

  /**
   * Applies the draft to the row the editor was opened on. The form may have changed while the editor was open (a row
   * removed or moved by another change, the limit reached): then nothing is written, so no other row is overwritten
   * and no limit is passed.
   *
   * @param draft the row as the editor leaves it
   */
  function apply(draft: unknown): void {
    const opened = editing;
    editorOpen = false;
    editing = undefined;
    // An emptied scalar row would leave a hole in the list: the row stays as it was.
    if (opened === undefined || draft === undefined) return;
    if (opened.index === null) {
      if (maxItems === null || rows.length < maxItems) commit([...rows, draft]);
      return;
    }
    const index = opened.index;
    if (!jsonEqual(rows[index], opened.row)) return;
    commit(
      rows.map((row, position) => (position === index ? draft : row)),
      childPointer(node.pointer, index),
    );
  }

  /** Removes the row the question was asked about, unless it is no longer there or the list would pass `minItems`. */
  function confirmRemove(): void {
    const asked = removing;
    removeOpen = false;
    removing = undefined;
    if (asked === undefined || rows.length <= minItems) return;
    if (!jsonEqual(rows[asked.index], asked.row)) return;
    commit(rows.filter((_, position) => position !== asked.index));
    void table?.focusRow(asked.index);
  }

  /** @param index a row @param direction `-1` to move it up, `1` down */
  function move(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }
</script>

<FieldFrame hint={hints} {error}>
  {#snippet children()}
    <DataTable
      bind:this={table}
      caption={label}
      {columns}
      rowCount={rows.length}
      readonly={reading}
      empty={$t('form.table.empty')}
      flagged={(row) => form.hasErrorWithin(childPointer(node.pointer, row))}
      {addDisabledReason}
      {canRemove}
      note={!reading && minItems > 0 && !canRemove
        ? $t('form.table.min', { count: minItems })
        : null}
      onadd={() => openEditor(null)}
      onedit={(row) => openEditor(row)}
      onremove={(row) => {
        removing = { index: row, row: $state.snapshot(rows[row]) };
        removeOpen = true;
      }}
      onmove={move}
      testId="table-{node.pointer.replaceAll('/', '-')}"
    >
      {#snippet cell(row, column)}
        <ReadValue
          node={columnNodes[column]}
          value={getAt(rows[row], columnNodes[column].pointer)}
          compact
        />
      {/snippet}
    </DataTable>
  {/snippet}
</FieldFrame>

{#if !reading}
  <Dialog
    bind:open={editorOpen}
    title={editing?.index === null || editing === undefined
      ? $t('form.table.editor.add', { table: label })
      : $t('form.table.editor.edit', { table: label, number: editing.index + 1 })}
    closeLabel={$t('common.close')}
    onclose={() => (editing = undefined)}
  >
    {#if editing}
      <RowEditor
        {node}
        index={editing.index}
        initial={editing.row}
        onapply={apply}
        oncancel={() => (editorOpen = false)}
      />
    {/if}
  </Dialog>
  <Dialog
    bind:open={removeOpen}
    title={$t('form.table.remove.title', { number: (removing?.index ?? 0) + 1, table: label })}
    closeLabel={$t('common.close')}
    onclose={() => (removing = undefined)}
  >
    <div class="remove">
      <p>{$t('form.table.remove.body')}</p>
      <div class="remove__acts">
        <Button variant="ghost" onclick={() => (removeOpen = false)}>{$t('common.cancel')}</Button>
        <Button variant="danger" onclick={confirmRemove}>{$t('form.table.remove.confirm')}</Button>
      </div>
    </div>
  </Dialog>
{/if}

<style>
  .remove {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .remove__acts {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
