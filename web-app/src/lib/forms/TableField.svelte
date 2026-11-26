<script lang="ts">
  import Button from '../components/Button.svelte';
  import Dialog from '../components/Dialog.svelte';
  import FieldFrame from '../components/FieldFrame.svelte';
  import { messagesStore, t } from '../i18n';
  import { useForm } from './context';
  import DataTable, { type TableColumn } from './DataTable.svelte';
  import ReadValue from './ReadValue.svelte';
  import RowEditor from './RowEditor.svelte';
  import { childPointer, getAt, tableColumns, type FieldNode } from './schema';
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
  }

  let { node, label, hints, error }: Props = $props();

  const form = useForm();

  let rows = $derived.by((): unknown[] => {
    const held = form.valueAt(node.pointer);
    return Array.isArray(held) ? held : [];
  });
  let reading = $derived(form.readonly || node.readOnly);
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

  /** The row in the editor: its index, or `null` for a row to add; `undefined` while there is none. */
  let editing: { index: number | null } | undefined = $state();
  let editorOpen = $state(false);
  let removing: number | undefined = $state();
  let removeOpen = $state(false);
  let table: DataTable | undefined = $state();

  /** @param next the rows after the act @param touched the place whose errors go stale */
  function commit(next: unknown[], touched: string = node.pointer): void {
    form.change(node.pointer, next, touched);
  }

  /** @param index the row to edit, or `null` to add one */
  function openEditor(index: number | null): void {
    editing = { index };
    editorOpen = true;
  }

  /** @param draft the row as the editor leaves it */
  function apply(draft: unknown): void {
    const index = editing?.index ?? null;
    editorOpen = false;
    editing = undefined;
    if (index === null) {
      if (draft !== undefined) commit([...rows, draft]);
    } else if (draft !== undefined) {
      // An emptied scalar row would leave a hole in the list: the row stays as it was.
      commit(
        rows.map((row, position) => (position === index ? draft : row)),
        childPointer(node.pointer, index),
      );
    }
  }

  function confirmRemove(): void {
    const index = removing;
    removeOpen = false;
    removing = undefined;
    if (index === undefined) return;
    commit(rows.filter((_, position) => position !== index));
    void table?.focusRow(index);
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
        removing = row;
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
        initial={editing.index === null ? undefined : rows[editing.index]}
        onapply={apply}
        oncancel={() => (editorOpen = false)}
      />
    {/if}
  </Dialog>
  <Dialog
    bind:open={removeOpen}
    title={$t('form.table.remove.title', { number: (removing ?? 0) + 1, table: label })}
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
