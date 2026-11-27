<script lang="ts" module>
  /** One column of a table. */
  export interface TableColumn {
    /** A key that names the column. */
    key: string;
    /** The heading. */
    label: string;
  }
</script>

<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import Button from '../components/Button.svelte';
  import IconButton from '../components/IconButton.svelte';
  import ReasonBadge from '../components/ReasonBadge.svelte';
  import { t } from '../i18n';

  /**
   * The rows of a list as a table (AUN-WEB-4, Choosing the Component, rule 12): one column for a scalar item, the first
   * four scalar properties for an object item. Editing: a row can be added, edited, removed and moved up or down; the
   * acts that the limits of the list forbid stay in view and say why. The row editor is the caller's, because what a
   * row holds is the form's. Read: the table without the acts.
   *
   * On a narrow column each row stands as a block of its columns, so that the table never scrolls sideways.
   */
  interface Props {
    /** The name of the table: the label of the list. */
    caption: string;
    /** Whether the caption is for a screen reader alone, because a heading above the table names it already. */
    captionHidden?: boolean;
    /** The columns. */
    columns: TableColumn[];
    /** The number of rows. */
    rowCount: number;
    /** The cell of one row and one column, given the indices of both. */
    cell: Snippet<[number, number]>;
    /** Whether the table is read and offers no act. */
    readonly?: boolean;
    /** The sentence of a list without rows. */
    empty: string;
    /** Whether a row has an error to look at. */
    flagged?: (row: number) => boolean;
    /** Why a row cannot be added now, if it cannot. */
    addDisabledReason?: string | null;
    /** The words of the act that adds a row, where the page holds more than one table ("Add a threat"). */
    addLabel?: string;
    /**
     * The name of a row where its number is not a good one (a threat by its id): the acts of the row are named by it,
     * "Remove T-03", so that two tables on one page do not offer two "Remove row 3".
     */
    rowName?: (row: number) => string;
    /** Whether a row can be removed; with `false` the acts to remove stay out and `note` says why. */
    canRemove?: boolean;
    /** A line under the table: the limit of the list that the acts respect. */
    note?: string | null;
    /** Adds a row. */
    onadd?: () => void;
    /** Edits a row. */
    onedit?: (row: number) => void;
    /** Removes a row. */
    onremove?: (row: number) => void;
    /** Moves a row up (`-1`) or down (`1`). */
    onmove?: (row: number, direction: -1 | 1) => void;
    /** A test id. */
    testId?: string;
  }

  let {
    caption,
    captionHidden = false,
    columns,
    rowCount,
    cell,
    readonly = false,
    empty,
    flagged,
    addDisabledReason = null,
    addLabel,
    rowName,
    canRemove = true,
    note = null,
    onadd,
    onedit,
    onremove,
    onmove,
    testId,
  }: Props = $props();

  let rows = $derived(Array.from({ length: rowCount }, (_, index) => index));
  let grid: HTMLElement | undefined = $state();

  /**
   * Puts the focus on the first act of a row, or on the act to add one when the list has no such row. The caller uses
   * it after a row has gone, so that the keyboard does not fall to the page.
   *
   * @param row the row to take the focus
   */
  export async function focusRow(row: number): Promise<void> {
    await tick();
    const line = grid?.querySelector(`tr[data-row="${Math.min(row, rowCount - 1)}"]`);
    const target =
      line?.querySelector<HTMLElement>('button') ??
      grid?.querySelector<HTMLElement>('.table__add button');
    target?.focus();
  }

  /**
   * Moves a row and keeps the keyboard where the person is: the focus follows the row to its new place and stays on
   * the same act, or on the other one when the row has reached the end of the list and the act is gone.
   */
  async function move(row: number, direction: -1 | 1): Promise<void> {
    onmove?.(row, direction);
    const target = row + direction;
    await tick();
    const own = direction === -1 ? 'up' : 'down';
    const other = direction === -1 ? 'down' : 'up';
    const line = grid?.querySelector(`tr[data-row="${target}"]`);
    const button =
      line?.querySelector<HTMLElement>(`[data-move="${own}"]`) ??
      line?.querySelector<HTMLElement>(`[data-move="${other}"]`);
    button?.focus();
  }
</script>

<div class="table" data-testid={testId} bind:this={grid}>
  {#if rowCount === 0}
    <p class="table__caption" class:sr-only={captionHidden}>{caption}</p>
    <p class="table__empty">{empty}</p>
  {:else}
    <table class="table__grid">
      <caption class="table__caption" class:sr-only={captionHidden}>{caption}</caption>
      <thead class="table__head" class:table__head--single={columns.length === 1}>
        <tr>
          {#each columns as column (column.key)}
            <th scope="col">{column.label}</th>
          {/each}
          {#if !readonly}
            <th scope="col" class="table__actions-head"
              ><span class="sr-only">{$t('form.table.actions')}</span></th
            >
          {/if}
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row)}
          <tr data-row={row}>
            {#each columns as column, columnIndex (column.key)}
              <td data-label={columns.length > 1 ? column.label : undefined}
                >{@render cell(row, columnIndex)}</td
              >
            {/each}
            {#if !readonly}
              <td class="table__actions">
                {#if flagged?.(row)}
                  <span class="table__flag">
                    <ReasonBadge label={$t('form.table.row-error')} testId="row-error-{row}" />
                  </span>
                {/if}
                <span class="table__buttons">
                  <Button
                    variant="ghost"
                    aria-label={rowName
                      ? $t('form.table.edit-named', { name: rowName(row) })
                      : $t('form.table.edit-row', { number: row + 1 })}
                    onclick={() => onedit?.(row)}>{$t('form.table.edit')}</Button
                  >
                  {#if row > 0}
                    <IconButton
                      icon="act.up"
                      label={rowName
                        ? $t('form.table.up-named', { name: rowName(row) })
                        : $t('form.table.up-row', { number: row + 1 })}
                      data-move="up"
                      onclick={() => move(row, -1)}
                    />
                  {:else if rowCount > 1}
                    <span class="table__move-gap" aria-hidden="true"></span>
                  {/if}
                  {#if row < rowCount - 1}
                    <IconButton
                      icon="act.down"
                      label={rowName
                        ? $t('form.table.down-named', { name: rowName(row) })
                        : $t('form.table.down-row', { number: row + 1 })}
                      data-move="down"
                      onclick={() => move(row, 1)}
                    />
                  {:else if rowCount > 1}
                    <span class="table__move-gap" aria-hidden="true"></span>
                  {/if}
                  {#if canRemove}
                    <Button
                      variant="ghost"
                      aria-label={rowName
                        ? $t('form.table.remove-named', { name: rowName(row) })
                        : $t('form.table.remove-row', { number: row + 1 })}
                      onclick={() => onremove?.(row)}>{$t('form.table.remove')}</Button
                    >
                  {/if}
                </span>
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#if !readonly && note}
    <p class="table__empty">{note}</p>
  {/if}
  {#if !readonly}
    <div class="table__add">
      <Button variant="secondary" disabledReason={addDisabledReason} onclick={() => onadd?.()}
        >{addLabel ?? $t('form.table.add')}</Button
      >
    </div>
  {/if}
</div>

<style>
  .table {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .table__caption {
    text-align: start;
    font-weight: var(--weight-medium);
    padding-block-end: var(--space-1);
  }

  .table__empty {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .table__grid {
    inline-size: 100%;
    border-collapse: collapse;
  }

  .table__grid th,
  .table__grid td {
    padding: var(--space-2) var(--space-3) var(--space-2) 0;
    text-align: start;
    vertical-align: top;
    border-block-end: 1px solid var(--color-border);
    font-weight: var(--weight-regular);
    overflow-wrap: break-word;
  }

  .table__grid thead th {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
  }

  /* One column repeats the name of the list: its heading stays for assistive technology only. */
  .table__head--single {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .table__actions {
    white-space: nowrap;
    text-align: end;
  }

  /* The mark of a row that is wrong stands over its acts, so it never widens the column of the acts. */
  .table__flag {
    display: block;
    margin-block-end: var(--space-1);
  }

  .table__buttons {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-1);
  }

  /* The place of a move that the first or the last row does not have: the acts of every row stand in the same columns. */
  .table__move-gap {
    flex: 0 0 auto;
    inline-size: var(--control-height);
    block-size: var(--control-height);
  }

  .table__add {
    display: flex;
  }

  /* The act sits at the start of the line under the list, and so does the reason it cannot be taken. */
  .table__add :global(.btn-with-reason) {
    align-items: flex-start;
  }

  .table__add :global(.btn__reason) {
    text-align: start;
  }

  @container (max-width: 44rem) {
    .table__grid,
    .table__grid tbody,
    .table__grid tr,
    .table__grid td {
      display: block;
    }

    /* A caption of a table that is a block would shrink to the width of the column heads: it spans the table. */
    .table__caption {
      display: block;
    }

    .table__head {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    .table__grid tr {
      padding-block: var(--space-2);
      border-block-end: 1px solid var(--color-border);
    }

    .table__grid td {
      display: grid;
      grid-template-columns: minmax(5rem, 9rem) minmax(0, 1fr);
      gap: var(--space-2);
      border-block-end: none;
      padding-block: var(--space-1);
    }

    /* A single column has no label: its cell takes the whole width instead of the narrow label column. */
    .table__grid td:not([data-label], .table__actions) {
      display: block;
    }

    .table__grid td[data-label]::before {
      content: attr(data-label);
      font-size: var(--text-xs);
      color: var(--color-text-muted);
    }

    .table__grid td.table__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-start;
      gap: var(--space-3);
      white-space: normal;
    }

    /* A stacked row reads its acts as a line: the empty place of a move would only be a hole. */
    .table__move-gap {
      display: none;
    }
  }
</style>
