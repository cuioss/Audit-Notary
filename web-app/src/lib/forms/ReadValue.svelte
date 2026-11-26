<script lang="ts">
  import { currentLocale, messagesStore, t } from '../i18n';
  import { formatDate, formatDateTime } from '../format';
  import AsciiDocView from './AsciiDocView.svelte';
  import { useForm } from './context';
  import ResolvedValue from './ResolvedValue.svelte';
  import { catalogsOf, enumMembers, jsonEqual, type FieldNode } from './schema';
  import { optionOf } from './texts';
  import { isEmptyValue } from './validate';

  /**
   * A value shown as text and not as a control (AUN-WEB-4, Read-Only Rendering): the localised date and time, the text
   * of the option, yes or no, the name of a catalog entry, a person or the title of a document with their marks, the
   * rendered AsciiDoc (the source as preformatted text, with a note, when it cannot be rendered), and a dash for an
   * empty value. A value the form does not edit is shown as plain data.
   */
  interface Props {
    /** The field. */
    node: FieldNode;
    /** The value. */
    value: unknown;
    /** Whether a cell of a table shows it: a long text stays on one line, the rendering of AsciiDoc is left out. */
    compact?: boolean;
  }

  let { node, value, compact = false }: Props = $props();

  const form = useForm();

  /** @returns the text of the held member of an `enum`, or the value as it is */
  function optionText(held: unknown): string {
    const members = enumMembers(node.schema) ?? [];
    const member = members.find((candidate) => jsonEqual(candidate, held));
    return member === undefined
      ? String(held)
      : optionOf($messagesStore, form.category, form.kind, node.path, member);
  }

  /** @returns the number in the language the app shows */
  function numberText(held: unknown): string {
    return typeof held === 'number'
      ? new Intl.NumberFormat($currentLocale).format(held)
      : String(held);
  }

  /** @returns the value of a plain field as data */
  function dataText(held: unknown): string {
    return JSON.stringify(held, null, 2) ?? '';
  }

  let text = $derived(typeof value === 'string' ? value : '');
</script>

{#if isEmptyValue(value)}
  <span class="read__empty"
    ><span aria-hidden="true">–</span><span class="sr-only">{$t('form.read.empty')}</span></span
  >
{:else if node.kind === 'text'}
  <span class="read__text" class:read__text--lines={!compact}>{text}</span>
{:else if node.kind === 'number'}
  <span class="read__number">{numberText(value)}</span>
{:else if node.kind === 'date-time'}
  <span>{formatDateTime(text, $currentLocale)}</span>
{:else if node.kind === 'date'}
  <span>{formatDate(text, $currentLocale)}</span>
{:else if node.kind === 'select'}
  <span>{optionText(value)}</span>
{:else if node.kind === 'toggle'}
  <span>{value === true ? $t('form.read.yes') : $t('form.read.no')}</span>
{:else if node.kind === 'catalog'}
  <ResolvedValue kind="catalog" value={text} catalog={catalogsOf(node.schema)} />
{:else if node.kind === 'person'}
  <ResolvedValue kind="person" value={text} />
{:else if node.kind === 'docref'}
  <ResolvedValue kind="docref" value={text} />
{:else if node.kind === 'asciidoc'}
  {#if compact}
    <span class="read__text">{text}</span>
  {:else}
    <AsciiDocView source={text} fallback />
  {/if}
{:else}
  <pre class="read__data">{dataText(value)}</pre>
{/if}

<style>
  .read__text--lines {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .read__number {
    font-feature-settings: 'tnum' 1;
  }

  .read__empty {
    color: var(--color-text-muted);
  }

  .read__data {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    max-block-size: 16rem;
    overflow: auto;
    background-color: var(--color-bg-subtle);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
  }
</style>
