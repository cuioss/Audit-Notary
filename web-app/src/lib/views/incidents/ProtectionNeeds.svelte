<script lang="ts">
  import type { CatalogEntry, IncidentProtection } from '../../api/types';
  import { PROTECTION_DIMENSIONS } from '../../api/types';
  import { createFormServices } from '../../forms/services';
  import { parseCatalogRef } from '../../forms/lookup.svelte';
  import { t } from '../../i18n';

  /**
   * The protection needs of an incident (UC-IR-1, AUN-IR-4): per dimension the highest need of the affected services and the
   * service that decides it. They are derived by the server and never typed; this only reads them, so the person sees what
   * their choice of services means for the report.
   */
  interface Props {
    /** The derived needs; `null` for an incident without an affected service. */
    protection: IncidentProtection | null;
  }

  let { protection }: Props = $props();

  const services = createFormServices();
  let entries = $state<CatalogEntry[]>([]);

  $effect(() => {
    if (protection === null) return;
    let live = true;
    void services.catalog('service').then((answer) => {
      if (live && answer.state === 'found') entries = answer.value;
    });
    return () => {
      live = false;
    };
  });

  /** @returns the name of the service a reference names, its id while the catalog is not read */
  function nameOf(ref: string): string {
    const parts = parseCatalogRef(ref);
    if (!parts) return ref;
    return entries.find((entry) => entry.id === parts.id)?.name ?? parts.id;
  }
</script>

<section class="needs" aria-labelledby="incident-protection" data-testid="protection-needs">
  <h3 class="needs__title" id="incident-protection">{$t('incidents.protection.title')}</h3>
  {#if protection === null}
    <p class="needs__note" data-testid="protection-none">{$t('incidents.protection.none')}</p>
  {:else}
    <p class="needs__note">{$t('incidents.protection.note')}</p>
    <dl class="needs__list">
      {#each PROTECTION_DIMENSIONS as dimension (dimension)}
        <div data-testid="protection-{dimension}">
          <dt>{$t(`catalogs.dimension.${dimension}`)}</dt>
          <dd>
            {$t(`reports.need.${protection.needs[dimension]}`)}
            <span class="needs__by">
              {$t('incidents.protection.decided-by', {
                service: nameOf(protection.decidedBy[dimension]),
              })}
            </span>
          </dd>
        </div>
      {/each}
    </dl>
  {/if}
</section>

<style>
  .needs {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-block-start: var(--space-6);
    border-block-start: 1px solid var(--color-border);
  }

  .needs__title {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
    font-weight: var(--weight-semibold);
  }

  .needs__note,
  .needs__by {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .needs__list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-4) var(--space-6);
  }

  .needs__list dt {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  .needs__list dd {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-family: var(--font-serif);
  }

  .needs__by {
    font-family: var(--font-sans);
  }
</style>
