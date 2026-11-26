<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '../components/Button.svelte';
  import type { FieldError } from '../api/errors';
  import { t } from '../i18n';
  import { provideForm, useForm, type FormContext } from './context';
  import { effectiveErrors, isAffectedBy, isWithin, placeOf } from './fieldErrors';
  import SchemaField from './SchemaField.svelte';
  import {
    childNodes,
    childPointer,
    fieldPointers,
    getAt,
    itemNode,
    setAt,
    type FieldNode,
  } from './schema';
  import { missingWith, validateWith } from './validate';

  /**
   * The editor of one row of a table: the fields of the row's properties (a scalar item is one field), over a copy of
   * the row. What the person changes stays in the copy until they apply it; cancelling leaves the row as it was. The
   * errors that stand at the row, the server's and the browser's, show at its fields.
   */
  interface Props {
    /** The table. */
    node: FieldNode;
    /** The row's index, or `null` for a row that is added. */
    index: number | null;
    /** The row as the form holds it, if it has one. */
    initial?: unknown;
    /** Called with the row as edited. */
    onapply: (row: unknown) => void;
    /** Called when the person gives up. */
    oncancel: () => void;
  }

  let { node, index, initial, onapply, oncancel }: Props = $props();

  const parent = useForm();
  const item = untrack(() => itemNode(node, parent.root));
  const prefix = untrack(() => (index === null ? null : childPointer(node.pointer, index)));

  let draft: unknown = $state(
    untrack(() => {
      const copy = $state.snapshot(initial);
      return copy === undefined && item.kind === 'section' ? {} : copy;
    }),
  );
  let touched: string[] = $state([]);

  /** The errors of the server that stand at this row, with pointers into the row. */
  let rowServer = $derived.by((): FieldError[] | null => {
    const server = parent.serverErrors();
    if (server === null || prefix === null) return null;
    return server
      .filter((error) => isWithin(prefix, error.pointer))
      .map((error) => ({ pointer: error.pointer.slice(prefix.length), code: error.code }));
  });
  /** The errors of the server that the person has not answered by changing the field since. */
  let standing = $derived(
    rowServer === null
      ? null
      : rowServer.filter((error) => !touched.some((place) => isAffectedBy(place, error.pointer))),
  );
  let shown = $derived(
    effectiveErrors(standing, validateWith(parent.root, item.schema, draft), touched),
  );
  let known = $derived(fieldPointers(parent.root, draft, item));
  let placed = $derived(shown.map((error) => ({ ...error, place: placeOf(error.pointer, known) })));
  let missing = $derived(new Set(missingWith(parent.root, item, draft)));

  const context: FormContext = {
    category: parent.category,
    kind: parent.kind,
    root: parent.root,
    readonly: false,
    headingLevel: parent.headingLevel + 1,
    showMissing: parent.showMissing,
    valueAt: (pointer) => getAt(draft, pointer),
    change(pointer, next, place) {
      draft = setAt(draft, pointer, next);
      touched = [...touched, place ?? pointer];
    },
    errorsAt: (pointer) => [
      ...new Set(placed.filter((error) => error.place === pointer).map((error) => error.code)),
    ],
    hasErrorWithin: (pointer) =>
      placed.some((error) => error.place !== null && isWithin(pointer, error.place)),
    isMissing: (pointer) => parent.showMissing && missing.has(pointer),
    serverErrors: () => rowServer,
  };
  provideForm(context);

  let fields = $derived(item.kind === 'section' ? childNodes(item, parent.root) : [item]);
</script>

<div class="editor">
  <div class="editor__fields">
    {#each fields as field (field.pointer)}
      <SchemaField node={field} />
    {/each}
  </div>
  <div class="editor__acts">
    <Button variant="ghost" onclick={oncancel}>{$t('common.cancel')}</Button>
    <Button variant="primary" onclick={() => onapply($state.snapshot(draft))}
      >{index === null ? $t('form.table.editor.add-act') : $t('form.table.editor.apply')}</Button
    >
  </div>
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .editor__fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .editor__acts {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
