<script lang="ts">
  import type { JsonSchema } from '../../api/types';
  import { nodeAtPointer } from '../../documents/diff';
  import { plainValue } from '../../documents/display';
  import { provideForm, type FormContext } from '../../forms/context';
  import ReadValue from '../../forms/ReadValue.svelte';
  import type { FieldNode } from '../../forms/schema';
  import { messagesStore, t } from '../../i18n';

  /**
   * One side of a change in the diff of a release: the value as the form reads it (the name of a person, the text of an
   * option, the title of a document, the localised date, a yes or a no), so the approver reads the words of the domain
   * and never a pseudonym or a code. A list, a section or a field the schema no longer has is told in one line.
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
</script>

{#if shown}
  <ReadValue node={shown} {value} />
{:else}
  {plainValue($messagesStore, category, kind, pointer, value, $t)}
{/if}
