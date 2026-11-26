<script lang="ts">
  import type { JsonSchema } from '../../api/types';
  import { fieldLabel } from '../../documents/categories';
  import { nodeAtPointer } from '../../documents/diff';
  import { plainValue } from '../../documents/display';
  import { provideForm, type FormContext } from '../../forms/context';
  import ReadValue from '../../forms/ReadValue.svelte';
  import { childNodes, isObject, itemNode, toPointer, type FieldNode } from '../../forms/schema';
  import { messagesStore, t } from '../../i18n';

  /**
   * One side of a change in the diff of a release: the value as the form reads it (the name of a person, the text of an
   * option, the title of a document, the localised date, a yes or a no), so the approver reads the words of the domain
   * and never a pseudonym or a code. A list or a row that is new or gone is read row by row, field by field, the same
   * way; a section of more than plain fields or a field the schema no longer has is told in one line.
   *
   * It stands under a form's services (`provideFormServices`), which resolve the references once for the whole diff.
   */
  interface Props {
    /** The schema of the document type. */
    schema: JsonSchema;
    /** The category id. */
    category: string;
    /** The document type id. */
    kind: string;
    /** The JSON Pointer of the field, into the value of its part. */
    pointer: string;
    /** The value. */
    value: unknown;
  }

  let { schema, category, kind, pointer, value }: Props = $props();

  // A reading that no field edits: the context only names where the texts come from.
  const context: FormContext = {
    get category() {
      return category;
    },
    get kind() {
      return kind;
    },
    get root() {
      return schema;
    },
    readonly: true,
    headingLevel: 3,
    valueAt: () => undefined,
    change: () => {},
    errorsAt: () => [],
    hasErrorWithin: () => false,
    isMissing: () => false,
    showMissing: false,
    serverErrors: () => null,
  };
  provideForm(context);

  const SCALARS = new Set([
    'text',
    'number',
    'date-time',
    'date',
    'select',
    'toggle',
    'catalog',
    'person',
    'docref',
    'asciidoc',
  ]);

  let node = $derived(nodeAtPointer(schema, pointer));
  /** The source of AsciiDoc is read as text, line by line: a preview per side would hide what changed. */
  let shown: FieldNode | null = $derived(
    node && SCALARS.has(node.kind)
      ? node.kind === 'asciidoc'
        ? { ...node, kind: 'text' }
        : node
      : null,
  );

  /** One field of a row, read as the form reads it. */
  interface Cell {
    node: FieldNode;
    label: string;
    value: unknown;
  }

  /**
   * @param section a row of a table, as a section
   * @param held the value of the row
   * @returns its fields as cells, or `null` when the row holds more than the fields that can be read in one line each
   */
  function cellsOf(section: FieldNode, held: unknown): Cell[] | null {
    if (!isObject(held)) return null;
    const fields = childNodes(section, schema);
    if (Object.keys(held).some((key) => !fields.some((field) => field.name === key))) return null;
    if (fields.some((field) => !SCALARS.has(field.kind))) return null;
    return fields
      .filter((field) => Object.hasOwn(held, field.name))
      .map((field) => ({
        node: field.kind === 'asciidoc' ? { ...field, kind: 'text' } : field,
        label: fieldLabel($messagesStore, category, kind, toPointer(field.path)),
        value: held[field.name],
      }));
  }

  /** The rows of a list, each as cells; `null` when it is no list or a row cannot be read field by field. */
  let rows: Cell[][] | null = $derived.by(() => {
    if (!node || !Array.isArray(value) || value.length === 0) return null;
    if (node.kind === 'table') {
      const item = itemNode(node, schema);
      const read = value.map((held) =>
        item.kind === 'section'
          ? cellsOf(item, held)
          : SCALARS.has(item.kind)
            ? [{ node: item, label: '', value: held }]
            : null,
      );
      return read.every((cells) => cells !== null) ? (read as Cell[][]) : null;
    }
    return null;
  });

  /** A row that is new or gone, as cells. */
  let single: Cell[] | null = $derived(node?.kind === 'section' ? cellsOf(node, value) : null);
</script>

{#snippet fields(cells: Cell[])}
  <dl class="cells">
    {#each cells as cell (cell.node.name)}
      <div class="cell">
        {#if cell.label !== ''}<dt>{cell.label}</dt>{/if}
        <dd><ReadValue node={cell.node} value={cell.value} compact /></dd>
      </div>
    {/each}
  </dl>
{/snippet}

{#if shown}
  <ReadValue node={shown} {value} />
{:else if rows}
  <ol class="rows">
    {#each rows as cells, index (index)}
      <li class="row">
        <span class="row__name">{$t('documents.release.row-whole', { row: index + 1 })}</span>
        {@render fields(cells)}
      </li>
    {/each}
  </ol>
{:else if single}
  {@render fields(single)}
{:else}
  {plainValue($messagesStore, category, kind, pointer, value, $t)}
{/if}

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
  }

  .row__name {
    display: block;
    font-weight: var(--weight-semibold);
  }

  .cells {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    column-gap: var(--space-3);
    row-gap: 2px;
  }

  .cell {
    display: contents;
  }

  .cell dt {
    color: var(--color-text-secondary);
  }

  .cell dd:first-child {
    grid-column: 1 / -1;
  }

  @media (max-width: 767px) {
    .cells {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
