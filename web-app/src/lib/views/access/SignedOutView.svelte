<script lang="ts">
  import Link from '../../components/Link.svelte';
  import MascotFigure from '../../brand/MascotFigure.svelte';
  import { loginProviderOf, loginStartAddress } from '../../access/access';
  import { t } from '../../i18n';
  import GateFrame from '../../shell/GateFrame.svelte';
  import { status } from '../../stores/app';
  import WizardPage from '../../templates/WizardPage.svelte';

  /**
   * The landing of every logout, `/signed-out`, outside the shell (UC-ACC-2, rest-api.adoc, Addresses Outside the
   * Shell): the session of this browser has ended, and one act starts the login again with `return=/`. Opening the
   * page needs no session and creates none. A calm surface: the notary stands beside the words.
   */
  let provider = $derived(loginProviderOf($status));
</script>

<GateFrame>
  <WizardPage
    title={$t('signed-out.title')}
    intro={$t('signed-out.intro')}
    testId="signed-out-view"
  >
    <div class="signed-out">
      <MascotFigure pose="done" />
      <Link
        href={loginStartAddress(provider, '/')}
        look="primary"
        data-sveltekit-reload
        data-testid="signed-out-login"
      >
        {$t('signed-out.act')}
      </Link>
    </div>
  </WizardPage>
</GateFrame>

<style>
  .signed-out {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-6);
  }

  .signed-out :global(.mascot) {
    max-inline-size: 9rem;
  }
</style>
