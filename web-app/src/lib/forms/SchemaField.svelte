<script lang="ts">
  import FieldFrame from '../components/FieldFrame.svelte';
  import Select, { type SelectOption } from '../components/Select.svelte';
  import TextArea from '../components/TextArea.svelte';
  import TextField from '../components/TextField.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { uniqueId } from '../components/uniqueId';
  import { messagesStore, t } from '../i18n';
  import AsciiDocField from './AsciiDocField.svelte';
  import CatalogPicker from './CatalogPicker.svelte';
  import { useForm } from './context';
  import DateTimeField from './DateTimeField.svelte';
  import DocumentRefField from './DocumentRefField.svelte';
  import { errorKey } from './fieldErrors';
  import PersonPicker from './PersonPicker.svelte';
  import ReadValue from './ReadValue.svelte';
  import SchemaField from './SchemaField.svelte';
  import { catalogsOf, childNodes, enumMembers, jsonEqual, type FieldNode } from './schema';
  import TableField from './TableField.svelte';
  import { helpOf, labelOf, optionOf } from './texts';

  /**
   * One property of a generated form, drawn by the component its schema calls for (AUN-WEB-4, Choosing the Component):
   * a section is a heading and its fields; a table is a `DataTable` with a row editor; every other kind is one control.
   * Where the form is read, or the property is `readOnly`, the value is shown as text with the same label, section and
   * hints, so that what is read has the shape of what was edited.
   */
  interface Props {
    /** The property. */
    node: FieldNode;
    /** How deep the property stands in sections; the heading level follows it. */
    depth?: number;
    /** Whether a section above is read-only: its properties are read, whatever they say themselves. */
    inheritedReadOnly?: boolean;
  }

  let { node, depth = 0, inheritedReadOnly = false }: Props = $props();

  const form = useForm();

  let label = $derived(labelOf($messagesStore, form.category, form.kind, node.path, node.name));
  let help = $derived(helpOf($messagesStore, form.category, form.kind, node.path));
  let hints = $derived(
    [help, node.schema['x-free-text'] === true ? $t('form.hint.no-personal-notes') : null].filter(
      (line): line is string => !!line,
    ),
  );
  let mark = $derived(node.required && !form.readonly ? $t('form.required') : undefined);
  let value = $derived(form.valueAt(node.pointer));
  let error = $derived(
    [
      ...form.errorsAt(node.pointer).map((code) => $t(errorKey(code))),
      form.isMissing(node.pointer) ? $t('form.error.missing') : null,
    ]
      .filter((text): text is string => !!text)
      .join(' ') || null,
  );
  let reading = $derived(form.readonly || inheritedReadOnly || node.readOnly);
  let level = $derived(Math.min(6, form.headingLevel + depth));
  /** Unique on the page: a row editor over the form holds sections with the same pointers. */
  const sectionId = uniqueId('section');

  /** @returns the options of a select: the members of the enum, and the held value when it is none of them */
  function selectOptions(): SelectOption[] {
    const members = enumMembers(node.schema) ?? [];
    const offered = members.map((member, index) => ({
      value: String(index),
      label: optionOf($messagesStore, form.category, form.kind, node.path, member),
    }));
    return heldIndex() === 'held' ? [{ value: 'held', label: String(value) }, ...offered] : offered;
  }

  /** @returns the value of the select: the index of the held member, `held` for a value that is none, or empty */
  function heldIndex(): string {
    if (value === undefined || value === null) return '';
    const members = enumMembers(node.schema) ?? [];
    const index = members.findIndex((member) => jsonEqual(member, value));
    return index < 0 ? 'held' : String(index);
  }

  /** @param chosen the value the select reports */
  function choose(chosen: string): void {
    const members = enumMembers(node.schema) ?? [];
    if (chosen === '') form.change(node.pointer, undefined);
    else if (chosen !== 'held') form.change(node.pointer, members[Number(chosen)]);
  }

  /** @param typed the text of a number field @param input the input itself */
  function typeNumber(typed: string, input: HTMLInputElement): void {
    if (typed === '') {
      // `-` or `1e` read as empty while the number is half typed: the value stays until it is emptied for good.
      if (!input.validity.badInput) form.change(node.pointer, undefined);
      return;
    }
    const parsed = Number(typed);
    if (!Number.isNaN(parsed)) form.change(node.pointer, parsed);
  }

  /** @param typed the text of a text field */
  function typeText(typed: string): void {
    form.change(node.pointer, typed === '' ? undefined : typed);
  }
</script>

{#if node.kind === 'section'}
  <section
    class="section"
    class:section--nested={depth > 0}
    aria-labelledby={sectionId}
    data-pointer={node.pointer}
  >
    <svelte:element this={`h${level}`} class="section__title" id={sectionId}>{label}</svelte:element
    >
    {#each hints as line, index (index)}
      <p class="field__hint">{line}</p>
    {/each}
    {#if error}<p class="field__error">{error}</p>{/if}
    <div class="fields">
      {#each childNodes(node, form.root) as child (child.pointer)}
        <SchemaField node={child} depth={depth + 1} inheritedReadOnly={reading} />
      {/each}
    </div>
  </section>
{:else if node.kind === 'table'}
  <div class="field" data-pointer={node.pointer}>
    <TableField {node} {label} {hints} {error} {reading} />
  </div>
{:else if reading || node.kind === 'plain'}
  <div class="field" data-pointer={node.pointer}>
    <dl class="read">
      <dt class="read__label">{label}</dt>
      <dd class="read__value"><ReadValue {node} {value} /></dd>
    </dl>
    {#each hints as line, index (index)}
      <p class="field__hint">{line}</p>
    {/each}
    {#if node.kind === 'plain'}
      <p class="field__hint">{$t('form.plain.note')}</p>
    {/if}
    {#if error}<p class="field__error">{error}</p>{/if}
  </div>
{:else}
  <div class="field" data-pointer={node.pointer}>
    {#if node.kind === 'text' && node.schema['x-free-text'] === true}
      <TextArea
        {label}
        value={typeof value === 'string' ? value : ''}
        hint={hints}
        {mark}
        {error}
        oninput={typeText}
      />
    {:else if node.kind === 'text'}
      <TextField
        {label}
        value={typeof value === 'string' ? value : ''}
        hint={hints}
        {mark}
        {error}
        oninput={typeText}
      />
    {:else if node.kind === 'number'}
      <TextField
        {label}
        type="number"
        step={node.schema.type === 'integer' ? '1' : 'any'}
        value={typeof value === 'number' ? String(value) : ''}
        hint={hints}
        {mark}
        {error}
        oninput={typeNumber}
      />
    {:else if node.kind === 'date-time' || node.kind === 'date'}
      <DateTimeField
        {label}
        format={node.kind}
        {value}
        hint={hints}
        {mark}
        {error}
        onchange={(next) => form.change(node.pointer, next)}
      />
    {:else if node.kind === 'select'}
      <Select
        {label}
        options={selectOptions()}
        value={heldIndex()}
        placeholder={$t('form.choose')}
        hint={hints}
        {mark}
        {error}
        onchange={choose}
      />
    {:else if node.kind === 'toggle'}
      <FieldFrame hint={hints} {error}>
        {#snippet children(described)}
          <Toggle
            {label}
            checked={value === true}
            describedby={described}
            invalid={!!error}
            onchange={(next) => form.change(node.pointer, next)}
          />
        {/snippet}
      </FieldFrame>
    {:else if node.kind === 'catalog'}
      <CatalogPicker
        {label}
        catalog={catalogsOf(node.schema)}
        value={typeof value === 'string' ? value : undefined}
        hint={hints}
        {mark}
        {error}
        onchange={(next) => form.change(node.pointer, next)}
      />
    {:else if node.kind === 'person'}
      <PersonPicker
        {label}
        value={typeof value === 'string' ? value : undefined}
        hint={hints}
        {mark}
        {error}
        onchange={(next) => form.change(node.pointer, next)}
      />
    {:else if node.kind === 'docref'}
      <DocumentRefField
        {label}
        value={typeof value === 'string' ? value : undefined}
        hint={hints}
        {mark}
        {error}
        onchange={(next) => form.change(node.pointer, next)}
      />
    {:else if node.kind === 'asciidoc'}
      <AsciiDocField
        {label}
        value={typeof value === 'string' ? value : undefined}
        hint={hints}
        {mark}
        {error}
        onchange={(next) => form.change(node.pointer, next)}
      />
    {/if}
  </div>
{/if}

<style>
  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .field {
    max-inline-size: var(--measure);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-block-start: var(--space-6);
    border-block-start: 1px solid var(--color-border);
  }

  .section--nested {
    padding-block-start: var(--space-3);
    border-block-start: none;
  }

  .section__title {
    margin: 0;
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
    font-weight: var(--weight-semibold);
  }

  .section--nested > .section__title {
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
  }

  .read {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .read__label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
  }

  .read__value {
    margin: 0;
    font-family: var(--font-serif);
    font-size: var(--text-md);
    line-height: var(--line-height-md);
  }

  .field__hint {
    margin: var(--space-1) 0 0;
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }

  .field__error {
    margin: var(--space-1) 0 0;
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
