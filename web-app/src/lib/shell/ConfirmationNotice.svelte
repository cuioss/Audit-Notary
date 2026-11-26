<script lang="ts">
  import Link from '../components/Link.svelte';
  import Notice from '../components/Notice.svelte';
  import { confirmationDue, PROFILE_ADDRESS } from '../directory/directory';
  import { t } from '../i18n';
  import { session } from '../stores/app';

  /**
   * The notice of a due confirmation of the own directory entry (UC-ACC-5, rest-api.adoc, Decided Provisionally with the
   * directory, point 13): while the session says `directoryConfirmationDue`, every page of the shell carries a notice with
   * a link to `/settings/profile`, where the person is asked "Is this still right?". It is no gate: nothing else is
   * blocked. On the page of the entry itself it is not shown, because the page asks the question.
   */
  interface Props {
    /** The route id of the current view. */
    route: string | null;
  }

  let { route }: Props = $props();
</script>

{#if confirmationDue($session) && route !== 'settings.profile'}
  <div data-testid="confirmation-notice">
    <Notice tone="info" title={$t('profile.notice.title')} body={$t('profile.notice.body')}>
      {#snippet actions()}
        <Link href={PROFILE_ADDRESS} look="secondary" data-testid="confirmation-link">
          {$t('profile.notice.act')}
        </Link>
      {/snippet}
    </Notice>
  </div>
{/if}
