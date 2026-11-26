<script lang="ts">
  import Select, { type SelectOption } from '../components/Select.svelte';
  import TextField from '../components/TextField.svelte';
  import type { PersonSummary } from '../api/types';
  import { t } from '../i18n';
  import { parseCatalogRef, useLookup } from './lookup.svelte';
  import ResolvedValue from './ResolvedValue.svelte';
  import { personName, useFormServices } from './services';

  /**
   * The pick of a person from the directory (AUN-WEB-4, The Pickers). The document stores the pseudonym, never a
   * name (AUN-DP-5). The list holds the bound entries and the prefilled ones that no login has bound yet (marked *not
   * yet bound*; they may be referenced all the same). An erased person is a former member: the held value shows the
   * mark and the team and role the entry held, and the list does not offer such a person. A pseudonym that resolves to
   * nobody is shown as an unknown person.
   *
   * A list of more than a few people comes with a field that narrows it by name; with more than the server lists, the
   * server narrows it (`?q=`) and the field says so.
   */
  interface Props {
    /** The label. */
    label: string;
    /** The held pseudonym, or nothing. */
    value?: string;
    /** The field error. */
    error?: string | null;
    /** The word that says the field is mandatory. */
    mark?: string;
    /** The lines of help. */
    hint?: string | string[];
    /** Called with the new pseudonym, or `undefined` when the choice was emptied. */
    onchange: (next: string | undefined) => void;
    /** A test id. */
    testId?: string;
  }

  let { label, value, error = null, mark, hint, onchange, testId }: Props = $props();

  /** The list from which a field to narrow it is offered. */
  const NARROW_FROM = 8;
  /** The pause after the last typed letter before the server is asked. */
  const NARROW_DELAY_MS = 300;

  const services = useFormServices();
  const everyone = useLookup(() => services.persons());
  const teams = useLookup(() => services.catalog('team'));

  let filter = $state('');
  let query = $state('');
  $effect(() => {
    const typed = filter.trim();
    const timer = setTimeout(() => (query = typed), typed === '' ? 0 : NARROW_DELAY_MS);
    return () => clearTimeout(timer);
  });

  let truncated = $derived(everyone.current.state === 'found' && everyone.current.value.truncated);
  const narrowed = useLookup(() => (truncated && query !== '' ? services.persons(query) : null));

  let held = $derived(typeof value === 'string' && value !== '' ? value : '');
  let listed = $derived.by((): PersonSummary[] => {
    const answer = narrowed.current.state === 'found' ? narrowed.current : everyone.current;
    return answer.state === 'found' ? answer.value.persons : [];
  });
  let shown = $derived.by(() => {
    const needle = query.toLowerCase();
    return needle === ''
      ? listed
      : listed.filter((person) => (person.name ?? '').toLowerCase().includes(needle));
  });
  const holder = useLookup(() => {
    return held !== '' && !listed.some((person) => person.pseudonym === held)
      ? services.person(held)
      : null;
  });

  /**
   * @param person a person of the directory
   * @returns the text of its option: the name, the team, and the mark of an entry no login has bound yet
   */
  function optionLabel(person: PersonSummary): string {
    const team = person.memberships[0]?.team;
    const parts = team ? parseCatalogRef(team) : null;
    const teamName =
      parts && teams.current.state === 'found'
        ? (teams.current.value.find((entry) => entry.id === parts.id)?.name ?? parts.id)
        : null;
    const name = personName(person);
    const text = teamName ? $t('form.person.option', { name, team: teamName }) : name;
    return person.state === 'unbound' ? `${text} – ${$t('form.mark.unbound')}` : text;
  }

  let options = $derived.by((): SelectOption[] => {
    const offered = shown.map((person) => ({
      value: person.pseudonym,
      label: optionLabel(person),
    }));
    if (held === '' || offered.some((option) => option.value === held)) return offered;
    const known = listed.find((person) => person.pseudonym === held);
    let heldLabel = held;
    if (known) heldLabel = optionLabel(known);
    else if (holder.current.state === 'found') {
      const person = holder.current.value;
      heldLabel = person.state === 'former' ? $t('form.mark.former') : optionLabel(person);
    } else if (holder.current.state === 'missing') heldLabel = $t('form.mark.unknown-person');
    return [{ value: held, label: heldLabel }, ...offered];
  });

  let narrowable = $derived(
    truncated || (everyone.current.state === 'found' && listed.length >= NARROW_FROM),
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
    {#if everyone.current.state === 'failed'}
      <p class="picker__note">{$t('form.picker.unavailable')}</p>
    {/if}
    {#if held !== ''}
      <ResolvedValue kind="person" value={held} marksOnly />
    {/if}
    {#if narrowable}
      <div class="picker__narrow">
        <TextField
          label={$t('form.person.narrow')}
          hint={truncated ? $t('form.person.truncated') : undefined}
          bind:value={filter}
          testId={testId ? `${testId}-narrow` : undefined}
        />
        {#if query !== '' && shown.length === 0}
          <p class="picker__note">{$t('form.person.none')}</p>
        {/if}
      </div>
    {/if}
  {/snippet}
</Select>

<style>
  .picker__note {
    color: var(--color-text-muted);
  }

  .picker__narrow {
    margin-block-start: var(--space-2);
  }
</style>
