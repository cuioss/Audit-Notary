<script lang="ts">
  import Link from '../../components/Link.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import {
    PROTECTION_DIMENSIONS,
    type CatalogEntryRead,
    type Dependency,
    type EffectiveNeeds,
    type ProtectionNeeds,
  } from '../../api/types';
  import { nameOfRef, refAddress } from '../../catalogs/catalogs';
  import { t } from '../../i18n';

  /**
   * What a service's protection needs come to once its dependencies are read (UC-CAT-3, AUN-DIR-5): the needs stored on
   * the service beside the effective ones, the dependency that decides each dimension, and the dependencies as the chain
   * `service › depends on`, each with its reason to count or not. Read from the saved entry; a change that is not saved
   * yet is not in it.
   */
  interface Props {
    /** The saved entry of the service. */
    entry: CatalogEntryRead;
    /** What its dependencies come to. */
    effective: EffectiveNeeds;
    /** The needs stored on the service itself. */
    stored: Partial<ProtectionNeeds>;
  }

  let { entry, effective, stored }: Props = $props();

  let own = $derived({ ref: `service:${entry.id}`, name: entry.name });

  /**
   * @param ref a reference
   * @returns the words for a reference: this service, or the name of the entry it names
   */
  function who(ref: string): string {
    return ref === own.ref ? $t('catalogs.needs.itself') : nameOfRef(ref, own, effective);
  }

  /**
   * @param level a level, or nothing when the service holds none
   * @returns its words
   */
  function levelText(level: string | undefined): string {
    return level ? $t(`catalogs.level.${level}`) : $t('catalogs.level.none');
  }

  /**
   * @param dependency a dependency
   * @returns the word that says whether it counts, and why not when it does not
   */
  function stateOf(dependency: Dependency): { tone: 'neutral' | 'attention'; label: string } {
    if (dependency.counts) return { tone: 'neutral', label: $t('catalogs.depends.counts') };
    if (dependency.retired) {
      return { tone: 'attention', label: $t('catalogs.depends.not-counted.retired') };
    }
    return {
      tone: 'neutral',
      label: dependency.ref.startsWith('external:')
        ? $t('catalogs.depends.not-counted.external')
        : $t('catalogs.depends.not-counted.unknown'),
    };
  }
</script>

<section class="needs" data-testid="service-needs">
  <h2 class="needs__title">{$t('catalogs.needs.title')}</h2>
  <p class="needs__note">{$t('catalogs.needs.note')}</p>

  <div class="grid-frame">
    <table class="grid" data-testid="needs-table">
      <caption class="sr-only">{$t('catalogs.needs.title')}</caption>
      <thead class="grid__head">
        <tr>
          <th scope="col">{$t('catalogs.needs.dimension')}</th>
          <th scope="col">{$t('catalogs.needs.stored')}</th>
          <th scope="col">{$t('catalogs.needs.effective')}</th>
          <th scope="col">{$t('catalogs.needs.decided-by')}</th>
        </tr>
      </thead>
      <tbody>
        {#each PROTECTION_DIMENSIONS as dimension (dimension)}
          {@const decider = effective.decidedBy[dimension]}
          <tr data-testid="needs-{dimension}">
            <th scope="row">{$t(`catalogs.dimension.${dimension}`)}</th>
            <td data-label={$t('catalogs.needs.stored')}>{levelText(stored[dimension])}</td>
            <td data-label={$t('catalogs.needs.effective')}>
              <span class="grid__figure">{levelText(effective.protectionNeeds[dimension])}</span>
            </td>
            <td data-label={$t('catalogs.needs.decided-by')}>
              {#if decider === own.ref}
                {who(decider)}
              {:else if refAddress(decider)}
                <Link href={refAddress(decider) ?? ''}>{who(decider)}</Link>
              {:else}
                {who(decider)}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h2 class="needs__title needs__title--spaced">{$t('catalogs.depends.title')}</h2>
  {#if effective.dependencies.length === 0}
    <p class="needs__note" data-testid="depends-none">{$t('catalogs.depends.none')}</p>
  {:else}
    <p class="needs__note">{$t('catalogs.depends.note')}</p>
    <div class="grid-frame">
      <table class="grid" data-testid="depends-table">
        <caption class="sr-only">{$t('catalogs.depends.title')}</caption>
        <thead class="grid__head">
          <tr>
            <th scope="col">{$t('catalogs.depends.service')}</th>
            <th scope="col">{$t('catalogs.depends.via')}</th>
            <th scope="col">{$t('catalogs.depends.needs')}</th>
            <th scope="col">{$t('catalogs.depends.state')}</th>
          </tr>
        </thead>
        <tbody>
          {#each effective.dependencies as dependency (dependency.ref)}
            {@const state = stateOf(dependency)}
            <tr data-testid="depends-{dependency.ref}">
              <th scope="row" style:--depth={dependency.depth - 1}>
                <span class="grid__name">
                  {#if refAddress(dependency.ref)}
                    <Link href={refAddress(dependency.ref) ?? ''}>{dependency.name}</Link>
                  {:else}
                    {dependency.name}
                  {/if}
                </span>
              </th>
              <td data-label={$t('catalogs.depends.via')}>{who(dependency.via)}</td>
              <td data-label={$t('catalogs.depends.needs')}>
                {#if dependency.protectionNeeds}
                  {@const needs = dependency.protectionNeeds}
                  <dl class="levels">
                    {#each PROTECTION_DIMENSIONS as dimension (dimension)}
                      <div>
                        <dt>{$t(`catalogs.dimension.${dimension}`)}</dt>
                        <dd>{levelText(needs[dimension])}</dd>
                      </div>
                    {/each}
                  </dl>
                {:else}
                  <span class="needs__note">{$t('catalogs.level.none')}</span>
                {/if}
              </td>
              <td data-label={$t('catalogs.depends.state')}>
                <!-- The reasons are sentences: they wrap inside the cell instead of widening the page on a phone. -->
                <StatusLabel tone={state.tone} label={state.label} wrap />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .needs {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-block-start: var(--space-8);
    margin-block-start: var(--space-8);
    border-block-start: 1px solid var(--color-border);
  }

  .needs__title {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
    font-weight: var(--weight-semibold);
  }

  .needs__title--spaced {
    margin-block-start: var(--space-6);
  }

  .needs__note {
    max-inline-size: var(--measure);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .grid-frame {
    container-type: inline-size;
  }

  .grid {
    inline-size: 100%;
    border-collapse: collapse;
  }

  .grid th,
  .grid td {
    padding: var(--space-2) var(--space-3) var(--space-2) 0;
    text-align: start;
    vertical-align: top;
    border-block-end: 1px solid var(--color-border);
    font-weight: var(--weight-regular);
    overflow-wrap: anywhere;
  }

  .grid thead th {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
  }

  .grid tbody th {
    font-weight: var(--weight-medium);
  }

  .grid__figure {
    font-family: var(--font-serif);
    font-weight: var(--weight-semibold);
  }

  .grid__name {
    display: block;
    padding-inline-start: calc(var(--depth, 0) * var(--space-5));
  }

  /* The three dimensions as two aligned columns; a line is never broken between its term and its level. */
  .levels {
    display: grid;
    grid-template-columns: auto auto;
    justify-content: start;
    gap: 2px var(--space-2);
    font-size: var(--text-sm);
    white-space: nowrap;
  }

  .levels div {
    display: contents;
  }

  .levels dt {
    color: var(--color-text-muted);
  }

  .levels dt::after {
    content: ':';
  }

  @container (max-width: 40rem) {
    .grid,
    .grid tbody,
    .grid tr,
    .grid th,
    .grid td {
      display: block;
    }

    .grid__head {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    .grid tr {
      padding-block: var(--space-2);
      border-block-end: 1px solid var(--color-border);
    }

    .grid th,
    .grid td {
      border-block-end: none;
      padding-block: var(--space-1);
    }

    .grid td {
      display: grid;
      grid-template-columns: minmax(5rem, 9rem) minmax(0, 1fr);
      gap: var(--space-2);
      align-items: baseline;
    }

    /* A link of the stacked rows is a touch target of the phone's size; the padding reaches it without a box. */
    .grid :global(a) {
      display: inline-block;
      padding-block: var(--space-3);
    }

    .grid td[data-label]::before {
      content: attr(data-label);
      font-size: var(--text-xs);
      color: var(--color-text-muted);
    }
  }
</style>
