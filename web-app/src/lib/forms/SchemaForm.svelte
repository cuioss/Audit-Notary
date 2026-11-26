<script lang="ts">
  import { untrack } from 'svelte';
  import type { FieldError } from '../api/errors';
  import { provideForm, type FormContext } from './context';
  import { effectiveErrors, isAffectedBy, isWithin, placeOf } from './fieldErrors';
  import OtherErrors from './OtherErrors.svelte';
  import SchemaField from './SchemaField.svelte';
  import {
    childNodes,
    fieldPointers,
    getAt,
    isObject,
    rootNode,
    setAt,
    type JsonObject,
    type JsonSchema,
  } from './schema';
  import { createFormServices, provideFormServices, type FormServices } from './services';
  import { missingRequired, validate } from './validate';

  /**
   * The state a form reports with every change: the errors it shows, and the mandatory fields that are empty.
   */
  interface FormState {
    /** The errors shown at the fields: the browser's own, or the server's once its verdict has come. */
    errors: FieldError[];
    /** The JSON Pointers of the mandatory fields that are empty (a missing field is no error before a transition). */
    missing: string[];
  }

  /**
   * The form of a document, generated from the JSON Schema of its kind (AUN-WEB-4): the first rule that matches picks
   * the component of every property, sections come from the nesting, and the texts come from the catalogue under
   * `category.<category>.<kind>.` and never from the schema. It edits one JSON value, the data of the part it shows, and
   * names a field by the JSON Pointer of its place in that value.
   *
   * The browser checks the value without a validator library; a `422 VALIDATION` that the caller passes as `errors`
   * replaces every error of the browser, and the error of a field goes when the field changes. With `readonly` the same
   * form shows a document that is read: a revision, a document as of a date.
   */
  interface Props {
    /** The schema of the kind, as the file holds it. */
    schema: JsonSchema;
    /** The category id, for the keys of the texts. */
    category: string;
    /** The kind id, for the keys of the texts. */
    kind: string;
    /** The value, bindable: the data the form edits. */
    value?: JsonObject;
    /** Whether the form shows its value and offers no control. */
    readonly?: boolean;
    /** The errors of a `422 VALIDATION`, with pointers into the value; `null` while there is none. */
    errors?: FieldError[] | null;
    /** Whether the mandatory fields that are empty say so (after a transition was refused for them). */
    showMissing?: boolean;
    /** The level of the heading of a first-level section. */
    headingLevel?: number;
    /** The reading services, replaced in tests. */
    services?: FormServices;
    /** Called after every change with the new value and the state of the form. */
    onchange?: (value: JsonObject, state: FormState) => void;
    /** A test id. */
    testId?: string;
  }

  let {
    schema,
    category,
    kind,
    value = $bindable({}),
    readonly = false,
    errors = null,
    showMissing = false,
    headingLevel = 2,
    services,
    onchange,
    testId,
  }: Props = $props();

  provideFormServices(untrack(() => services) ?? createFormServices());

  /** The errors of the server that still stand: the places changed since the verdict are gone from it. */
  let server: FieldError[] | null = $state(null);
  /** The places changed since the verdict of the server. */
  let touched: string[] = $state([]);
  $effect.pre(() => {
    server = errors === null ? null : [...errors];
    touched = [];
  });

  let browser = $derived(validate(schema, value));
  let missing = $derived(missingRequired(schema, value));
  let shown = $derived(effectiveErrors(server, browser, touched));
  let known = $derived(fieldPointers(schema, value));
  let placed = $derived(shown.map((error) => ({ ...error, place: placeOf(error.pointer, known) })));
  let unplaced = $derived(placed.filter((error) => error.place === null));
  let missingSet = $derived(new Set(missing));

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
    get readonly() {
      return readonly;
    },
    get headingLevel() {
      return headingLevel;
    },
    get showMissing() {
      return showMissing;
    },
    valueAt: (pointer) => getAt(value, pointer),
    change(pointer, next, place) {
      const changed = place ?? pointer;
      const updated = setAt(value, pointer, next);
      const nextValue = isObject(updated) ? (updated as JsonObject) : {};
      server =
        server === null ? null : server.filter((error) => !isAffectedBy(changed, error.pointer));
      // Only a verdict of the server makes the places changed since it matter; each place is kept once.
      if (server !== null && !touched.includes(changed)) touched = [...touched, changed];
      value = nextValue;
      onchange?.(nextValue, {
        errors: effectiveErrors(server, validate(schema, nextValue), touched),
        missing: missingRequired(schema, nextValue),
      });
    },
    errorsAt: (pointer) => [
      ...new Set(placed.filter((error) => error.place === pointer).map((error) => error.code)),
    ],
    hasErrorWithin: (pointer) =>
      placed.some((error) => error.place !== null && isWithin(pointer, error.place)),
    isMissing: (pointer) => showMissing && missingSet.has(pointer),
    serverErrors: () => server,
  };
  provideForm(context);

  let fields = $derived(childNodes(rootNode(schema), schema));
  let root: HTMLElement | undefined = $state();

  /**
   * Moves the focus to a field, for a list of the mandatory fields that are empty. A field in a row of a table, which
   * has no control until the row is opened, leads to the table.
   *
   * @param pointer the JSON Pointer of the field
   * @returns whether a field of the form was found
   */
  export function focusField(pointer: string): boolean {
    let current = pointer;
    while (true) {
      const holder = [...(root?.querySelectorAll<HTMLElement>('[data-pointer]') ?? [])].find(
        (element) => element.dataset.pointer === current,
      );
      if (holder) {
        const control = holder.querySelector<HTMLElement>('input, select, textarea, button');
        (control ?? holder).focus();
        return true;
      }
      const cut = current.lastIndexOf('/');
      if (cut < 0) return false;
      current = current.slice(0, cut);
      if (current === '') return false;
    }
  }
</script>

<div class="schema-form" bind:this={root} data-testid={testId}>
  <div class="schema-form__fields">
    {#each fields as field (field.pointer)}
      <SchemaField node={field} />
    {/each}
  </div>
  <OtherErrors errors={unplaced} testId="form-other-errors" />
</div>

<style>
  .schema-form__fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
</style>
