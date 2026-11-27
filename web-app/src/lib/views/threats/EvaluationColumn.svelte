<script lang="ts">
  import ColumnHead from '../../components/ColumnHead.svelte';
  import Notice from '../../components/Notice.svelte';
  import type { ThreatEvaluation } from '../../api/types';
  import { t } from '../../i18n';
  import { EVALUATION_ADDRESS } from '../../threats/model';
  import ThreatEvaluationTable from '../reports/ThreatEvaluationTable.svelte';

  /**
   * The first column of the lens Threat models (UC-TM-4): every threat model of the services with its review and its
   * threats, and the services that have none, each offered with *New threat model* for a person who may create one. It
   * is the table of the report `/reports/threat-evaluation`, read from the same answer, so both say the same.
   */
  interface Props {
    /** The evaluation, or `null` while it is read. */
    evaluation: ThreatEvaluation | null;
    /** Whether the person may not read the threat models. */
    forbidden?: boolean;
    /** Whether the person may create a model: the act *New threat model* is offered only then. */
    canCreate?: boolean;
  }

  let { evaluation, forbidden = false, canCreate = false }: Props = $props();
</script>

<ColumnHead
  kind="threat-model"
  kindLabel={$t('lens.threat-models')}
  title={$t('threats.evaluation.title')}
  href={EVALUATION_ADDRESS}
/>
<div class="column" data-testid="evaluation-column">
  {#if forbidden}
    <div data-testid="threat-forbidden">
      <Notice
        tone="info"
        title={$t('reports.threat.forbidden.title')}
        body={$t('reports.threat.forbidden.body')}
      />
    </div>
  {:else if evaluation === null}
    <p class="column__loading">{$t('common.loading')}</p>
  {:else}
    <ThreatEvaluationTable {evaluation} sortable={false} offerNew={canCreate} />
  {/if}
</div>

<style>
  .column {
    padding: 0 var(--space-4);
  }

  .column__loading {
    color: var(--color-text-muted);
  }
</style>
