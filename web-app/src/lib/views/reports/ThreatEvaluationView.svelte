<script lang="ts">
  import { onMount } from 'svelte';
  import Notice from '../../components/Notice.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError } from '../../api/errors';
  import type { ThreatEvaluation } from '../../api/types';
  import { t } from '../../i18n';
  import { THREAT_EVALUATION_ADDRESS } from '../../reports/reports';
  import ReportPage from './ReportPage.svelte';
  import ThreatEvaluationTable from './ThreatEvaluationTable.svelte';

  /**
   * The threat evaluation (`/reports/threat-evaluation`, UC-TM-4): every threat model of the services with its review and
   * its threats, and the services that have none. A person without the right to read the threat models is told so in
   * words and sees no table.
   */
  let evaluation = $state<ThreatEvaluation | null>(null);
  let failure = $state<string | null>(null);
  let forbidden = $state(false);

  onMount(() => {
    let current = true;
    apiClient.getThreatEvaluation().then(
      (loaded) => {
        if (current) evaluation = loaded;
      },
      (error: unknown) => {
        if (!current) return;
        if (isApiError(error) && error.outcome === 'FORBIDDEN') forbidden = true;
        else failure = errorMessageKey(error);
      },
    );
    return () => {
      current = false;
    };
  });
</script>

<ReportPage
  title={$t('reports.threat.title')}
  intro={$t('reports.threat.lede')}
  address={THREAT_EVALUATION_ADDRESS}
  testId="threat-evaluation-view"
>
  {#if forbidden}
    <div data-testid="threat-forbidden">
      <Notice
        tone="info"
        title={$t('reports.threat.forbidden.title')}
        body={$t('reports.threat.forbidden.body')}
      />
    </div>
  {:else if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {:else if evaluation === null}
    <p class="muted">{$t('common.loading')}</p>
  {:else}
    <ThreatEvaluationTable {evaluation} />
  {/if}
</ReportPage>

<style>
  .muted {
    color: var(--color-text-muted);
  }
</style>
