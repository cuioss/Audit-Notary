<script lang="ts">
  import EmptyState from '../components/EmptyState.svelte';
  import Link from '../components/Link.svelte';
  import { t } from '../i18n';
  import DashboardPage from '../templates/DashboardPage.svelte';

  /** The answer for an address that names no view (AUN-WEB-3). */
</script>

<DashboardPage title={$t('error.not-found.title')} testId="not-found-view">
  <EmptyState
    icon="state.alert"
    title={$t('error.not-found.title')}
    body={$t('error.not-found.body')}
  >
    {#snippet actions()}
      <Link href="/">{$t('error.not-found.home')}</Link>
    {/snippet}
  </EmptyState>
</DashboardPage>
