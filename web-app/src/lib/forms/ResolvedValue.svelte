<script lang="ts">
  import Chip from '../components/Chip.svelte';
  import Link from '../components/Link.svelte';
  import ReasonBadge from '../components/ReasonBadge.svelte';
  import StatusLabel from '../components/StatusLabel.svelte';
  import type { CatalogEntry, Membership } from '../api/types';
  import { t } from '../i18n';
  import { parseCatalogRef, useLookup, type LookupState } from './lookup.svelte';
  import { personName, useFormServices } from './services';

  /**
   * What a held reference stands for, said in the words of the domain (AUN-WEB-4, The Pickers): the name of a catalog
   * entry, a person, or the title of a document, each with its marks: *retired*, *not yet bound*, *former* with the
   * team and the role the entry held (never a name), *unknown person*, *not found*. It is the reading of the three
   * pickers; in the editing the picker shows the name itself and this shows only the marks.
   */
  interface Props {
    /** What the reference points at. */
    kind: 'catalog' | 'person' | 'docref';
    /** The held value: `<catalog>:<id>`, a pseudonym or `<alias>:<kind>/<id>`. */
    value: string;
    /** The catalog of a catalog reference. */
    catalog?: string;
    /** Whether only the marks are shown, because the name stands in the control beside. */
    marksOnly?: boolean;
  }

  let { kind, value, catalog = '', marksOnly = false }: Props = $props();

  const services = useFormServices();

  const entries = useLookup(() => (kind === 'catalog' ? services.catalog(catalog) : null));
  const person = useLookup(() => (kind === 'person' ? services.person(value) : null));
  const reference = useLookup(() => (kind === 'docref' ? services.reference(value) : null));
  const teams = useLookup(() =>
    kind === 'person' && person.current.state === 'found' && person.current.value.state === 'former'
      ? services.catalog('team')
      : null,
  );
  const roles = useLookup(() =>
    kind === 'person' && person.current.state === 'found' && person.current.value.state === 'former'
      ? services.catalog('role')
      : null,
  );

  let entry = $derived.by(() => {
    if (kind !== 'catalog' || entries.current.state !== 'found') return null;
    // A reference into another catalog (`team:ledger` in the service catalog) names no entry of this one.
    const parts = parseCatalogRef(value);
    if (parts === null || parts.catalog !== catalog) return null;
    return entries.current.value.find((candidate) => candidate.id === parts.id) ?? null;
  });

  /**
   * @param ref a catalog reference
   * @param source the catalog's reading
   * @returns the name of the entry, or the id when the catalog is not (yet) known
   */
  function nameOf(ref: string, source: LookupState<CatalogEntry[]>): string {
    const parts = parseCatalogRef(ref);
    if (!parts) return ref;
    if (source.state === 'found') {
      return source.value.find((candidate) => candidate.id === parts.id)?.name ?? parts.id;
    }
    return parts.id;
  }

  /**
   * @param membership a membership of a former member
   * @returns the words for the team and the role the entry held
   */
  function membershipText(membership: Membership): string {
    return $t('form.person.membership', {
      team: nameOf(membership.team, teams.current),
      role: nameOf(membership.role, roles.current),
    });
  }

  /** @returns whether the address is one of this app (the server names canonical addresses) */
  function isLocalAddress(address: string | null): address is string {
    return address !== null && address.startsWith('/') && !address.startsWith('//');
  }
</script>

<span class="resolved" data-testid="resolved-{kind}">
  {#if kind === 'catalog'}
    {#if entries.current.state === 'found'}
      {#if entry}
        {#if !marksOnly}<span class="resolved__name">{entry.name}</span>{/if}
        {#if entry.retired}<StatusLabel tone="attention" label={$t('form.mark.retired')} />{/if}
      {:else}
        {#if !marksOnly}<Chip {value} />{/if}
        <ReasonBadge label={$t('form.mark.not-found')} />
      {/if}
    {:else if !marksOnly}
      <Chip {value} />
    {/if}
  {:else if kind === 'person'}
    {#if person.current.state === 'found'}
      {@const found = person.current.value}
      {#if found.state === 'former'}
        <StatusLabel tone="neutral" label={$t('form.mark.former')} />
        <span class="resolved__detail">{found.memberships.map(membershipText).join('; ')}</span>
      {:else}
        {#if !marksOnly}<span class="resolved__name">{personName(found)}</span>{/if}
        {#if found.state === 'unbound'}
          <StatusLabel tone="neutral" label={$t('form.mark.unbound')} />
        {/if}
      {/if}
    {:else if person.current.state === 'missing'}
      <ReasonBadge label={$t('form.mark.unknown-person')} />
      <Chip {value} />
    {:else if !marksOnly}
      <Chip {value} />
    {/if}
  {:else if reference.current.state === 'found'}
    {@const found = reference.current.value}
    {#if found.found}
      {#if isLocalAddress(found.address)}
        <Link href={found.address}>{found.title ?? value}</Link>
      {:else}
        <span class="resolved__name">{found.title ?? value}</span>
      {/if}
      {#if found.retired}<StatusLabel tone="attention" label={$t('form.mark.retired')} />{/if}
    {:else}
      <Chip {value} />
      <ReasonBadge label={$t('form.mark.not-found')} />
    {/if}
  {:else if reference.current.state === 'missing'}
    <Chip {value} />
    <ReasonBadge label={$t('form.mark.not-found')} />
  {:else}
    <Chip {value} />
  {/if}
</span>

<style>
  .resolved {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
  }

  .resolved__detail {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }
</style>
