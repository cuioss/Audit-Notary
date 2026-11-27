<script lang="ts">
  import { untrack } from 'svelte';
  import AsciiDocView from '../../forms/AsciiDocView.svelte';
  import Notice from '../../components/Notice.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey } from '../../api/errors';
  import type { IncidentReport } from '../../api/types';
  import { createFormServices, provideFormServices } from '../../forms/services';
  import { reportSections } from '../../incidents/report';
  import { formatDateTime } from '../../format';
  import { currentLocale, t } from '../../i18n';

  /**
   * The generated report of an incident, read on the page and never downloaded (UC-IR-3, AUN-IR-1): the working state's
   * preview from the saved data, or the report a release committed. The AsciiDoc is the server's; each section is rendered
   * by the server on its own (the request is limited to 65,536 bytes) and drawn with the app's own elements. The report is
   * written in English whatever language the app shows, and the preview says so.
   */
  interface Props {
    /** The year of the incident. */
    year: string;
    /** The incident's document id. */
    incident: string;
    /** The revision the incident is read at, if any. */
    at?: string;
    /** A text that changes whenever the saved state does, so the preview is read again: the incident's last save. */
    stamp: string;
  }

  let { year, incident, at, stamp }: Props = $props();

  // The renders of the sections share one set of lookups for the preview's life.
  provideFormServices(createFormServices());

  let report = $state<IncidentReport | null>(null);
  let failure = $state<string | null>(null);
  let latest = 0;

  $effect(() => {
    void stamp;
    const read = ++latest;
    untrack(() => {
      failure = null;
    });
    apiClient
      .getIncidentReport(year, incident, at)
      .then((answer) => {
        if (read === latest) report = answer;
      })
      .catch((error) => {
        if (read === latest) failure = errorMessageKey(error);
      });
  });

  let sections = $derived(report ? reportSections(report.adoc) : []);
</script>

<div class="report" data-testid="report-preview">
  {#if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {:else if report === null}
    <p class="meta">{$t('common.loading')}</p>
  {:else}
    <p class="meta" data-testid="report-source">
      {$t(`incidents.report.source.${report.source}`, {
        when: formatDateTime(report.asOf, $currentLocale),
      })}
    </p>
    <p class="meta" data-testid="report-english">{$t('incidents.report.english')}</p>
    {#each sections as section (section.key)}
      <section class="report__section" data-testid="report-section">
        <AsciiDocView source={section.source} fallback />
      </section>
    {/each}
  {/if}
</div>

<style>
  .report {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .report__section {
    padding-block-start: var(--space-3);
    border-block-start: 1px solid var(--color-border);
    overflow-wrap: anywhere;
  }
</style>
