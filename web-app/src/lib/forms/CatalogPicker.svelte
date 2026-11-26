<script lang="ts">
  import Select, { type SelectOption } from '../components/Select.svelte';
  import { t } from '../i18n';
  import { useLookup } from './lookup.svelte';
  import ResolvedValue from './ResolvedValue.svelte';
  import { useFormServices } from './services';

  /**
   * The pick of an entry of a catalog (AUN-WEB-4, The Pickers). The list holds the retired entries too, because a
   * reference to one still resolves, but the picker offers only the entries that are not retired. A held value that
   * names a retired entry is shown with the name and the mark *retired* and can be kept or replaced; a held value that
   * names no entry is shown as the reference itself with the mark *not found*. The value is `<catalog>:<id>`.
   */
  interface Props {
    /** The label. */
    label: string;
    /** The catalog. */
    catalog: string;
    /** The held reference, or nothing. */
    value?: string;
    /** The field error. */
    error?: string | null;
    /** The word that says the field is mandatory. */
    mark?: string;
    /** The lines of help. */
    hint?: string | string[];
    /** Called with the new reference, or `undefined` when the choice was emptied. */
    onchange: (next: string | undefined) => void;
    /** A test id. */
    testId?: string;
  }

  let { label, catalog, value, error = null, mark, hint, onchange, testId }: Props = $props();

  const services = useFormServices();
  const entries = useLookup(() => services.catalog(catalog));

  let held = $derived(typeof value === 'string' && value !== '' ? value : '');
  let options = $derived.by((): SelectOption[] => {
    const list = entries.current.state === 'found' ? entries.current.value : [];
    const offered = list
      .filter((entry) => !entry.retired)
      .map((entry) => ({ value: `${catalog}:${entry.id}`, label: entry.name }));
    if (held === '' || offered.some((option) => option.value === held)) return offered;
    const known = list.find((entry) => `${catalog}:${entry.id}` === held);
    return [{ value: held, label: known?.name ?? held }, ...offered];
  });
</script>

<Select
  {label}
  {options}
  value={held}
  placeholder={$t('form.choose')}
  {error}
  {mark}
  {hint}
  onchange={(next) => onchange(next === '' ? undefined : next)}
  {testId}
>
  {#snippet after()}
    {#if entries.current.state === 'failed'}
      <span class="picker__note">{$t('form.picker.unavailable')}</span>
    {/if}
    {#if held !== ''}
      <ResolvedValue kind="catalog" value={held} {catalog} marksOnly />
    {/if}
  {/snippet}
</Select>

<style>
  .picker__note {
    color: var(--color-text-muted);
  }
</style>
