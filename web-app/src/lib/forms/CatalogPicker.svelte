<script lang="ts">
  import Select, { type SelectOption } from '../components/Select.svelte';
  import { t } from '../i18n';
  import type { CatalogEntry } from '../api/types';
  import { useLookup } from './lookup.svelte';
  import type { Lookup } from './services';
  import ResolvedValue from './ResolvedValue.svelte';
  import { useFormServices } from './services';

  /**
   * The pick of an entry of a catalog (AUN-WEB-4, The Pickers). The list holds the retired entries too, because a
   * reference to one still resolves, but the picker offers only the entries that are not retired. A held value that
   * names a retired entry is shown with the name and the mark *retired* and can be kept or replaced; a held value that
   * names no entry is shown as the reference itself with the mark *not found*. The value is `<catalog>:<id>`.
   *
   * A field that names several catalogs (`x-catalog` as an array, PROVISIONAL) lists their entries grouped by catalog
   * and stores the reference with the prefix of the catalog it came from.
   */
  interface Props {
    /** The label. */
    label: string;
    /** The catalog, or the catalogs of a field that names several. */
    catalog: string | string[];
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
  let catalogs = $derived([catalog].flat());
  let grouped = $derived(catalogs.length > 1);

  /** What the field's catalogs held. */
  interface Read {
    read: { catalog: string; entries: CatalogEntry[] }[];
    failed: boolean;
  }

  /** The entries of every catalog the field names; one that cannot be read leaves the others. */
  const entries = useLookup<Read>(() =>
    Promise.all(catalogs.map((name) => services.catalog(name))).then((answers): Lookup<Read> => {
      const read: Read['read'] = [];
      answers.forEach((answer, index) => {
        if (answer.state === 'found')
          read.push({ catalog: catalogs[index], entries: answer.value });
      });
      return read.length === 0
        ? { state: 'failed' }
        : { state: 'found', value: { read, failed: read.length < answers.length } };
    }),
  );

  let held = $derived(typeof value === 'string' && value !== '' ? value : '');
  let options = $derived.by((): SelectOption[] => {
    const read = entries.current.state === 'found' ? entries.current.value.read : [];
    const all = read.flatMap((part) =>
      part.entries.map((entry) => ({
        value: `${part.catalog}:${entry.id}`,
        label: entry.name,
        retired: entry.retired === true,
        group: grouped ? $t(`catalog.${part.catalog}.name`) : undefined,
      })),
    );
    const offered = all
      .filter((entry) => !entry.retired)
      .map(({ value: ref, label, group }) => ({ value: ref, label, group }));
    if (held === '' || offered.some((option) => option.value === held)) return offered;
    const known = all.find((entry) => entry.value === held);
    return [{ value: held, label: known?.label ?? held, group: known?.group }, ...offered];
  });
  let unavailable = $derived(
    entries.current.state === 'failed' ||
      (entries.current.state === 'found' && entries.current.value.failed),
  );
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
    {#if unavailable}
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
