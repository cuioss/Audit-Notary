<script lang="ts">
  import type { OtmMitigation, OtmThreat } from '../../api/types';
  import { t } from '../../i18n';
  import { categorySlug, issuesText, riskOf, treatmentOf } from '../../threats/model';

  /**
   * One side of the change of a threat or a countermeasure in the diff of a release: what the entry says, in the words of
   * the domain (its name, its status, the threat a countermeasure treats, the issues), and "gone" for an entry that the
   * release removes. A threat that was transferred names the risk it became.
   */
  interface Props {
    /** The kind of entry: `threats` or `mitigations`. */
    list: 'threats' | 'mitigations';
    /** The entry; `null` for the side on which it does not exist. */
    entry: unknown;
  }

  let { list, entry }: Props = $props();

  let threat = $derived(list === 'threats' && entry ? (entry as OtmThreat) : null);
  let risk = $derived(threat ? riskOf(threat.attributes.transferred) : null);
  let mitigation = $derived(list === 'mitigations' && entry ? (entry as OtmMitigation) : null);
</script>

<span class="entry" data-testid="diff-entry">
  {#if threat}
    <span class="entry__name">{threat.name}</span>
    <span class="entry__line">
      {$t(`threats.status.${treatmentOf(threat.attributes.status)}`)}
    </span>
    <span class="entry__line">
      {$t('threats.likelihood')}: {threat.risk.likelihood}, {$t('threats.impact')}: {threat.risk
        .impact}
    </span>
    {#if threat.categories && threat.categories.length > 0}
      <span class="entry__line">
        {threat.categories.map((name) => $t(`threats.category.${categorySlug(name)}`)).join(', ')}
      </span>
    {/if}
    {#if risk}
      <span class="entry__line">{$t('threats.transferred')} {risk.id}</span>
    {/if}
  {:else if mitigation}
    <span class="entry__name">{mitigation.name}</span>
    <span class="entry__line">
      {$t('threats.mitigation.of', { threat: mitigation.attributes.threat })}
    </span>
    <span class="entry__line">
      {mitigation.attributes.status
        ? $t(`threats.mitigation.status.${mitigation.attributes.status}`)
        : $t('threats.mitigation.status.none')}
    </span>
    {#if mitigation.attributes.issues && mitigation.attributes.issues.length > 0}
      <span class="entry__line">
        {$t('threats.mitigation.col.issues')}: {issuesText(mitigation.attributes.issues)}
      </span>
    {/if}
  {:else}
    <span class="entry__line">{$t('threats.diff.gone')}</span>
  {/if}
</span>

<style>
  .entry {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .entry__name {
    font-family: var(--font-serif);
    font-weight: var(--weight-semibold);
  }

  .entry__line {
    font-size: var(--text-sm);
  }
</style>
