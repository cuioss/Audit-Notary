<script lang="ts">
  import Notice from '../components/Notice.svelte';
  import { hasNoRights, loginProviderOf } from '../access/access';
  import { t } from '../i18n';
  import { session, status } from '../stores/app';

  /**
   * The notices every page of the app keeps while they hold: the installation uses local test accounts
   * (AUN-AUTH-6, on the login page and in the shell), and the user is logged in without a right on any repository
   * (rest-api.adoc, A Session Without Rights). Neither is an error, and neither asks for another login.
   */
</script>

{#if loginProviderOf($status) === 'local'}
  <Notice tone="attention" title={$t('access.local.title')} body={$t('access.local.body')} />
{/if}
{#if hasNoRights($session)}
  <Notice tone="info" title={$t('access.no-rights.title')} body={$t('access.no-rights.body')} />
{/if}
