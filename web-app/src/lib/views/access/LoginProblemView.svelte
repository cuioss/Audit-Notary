<script lang="ts">
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import { LOGIN_PROBLEM_REASONS, loginProviderOf, loginStartAddress } from '../../access/access';
  import { t } from '../../i18n';
  import GateFrame from '../../shell/GateFrame.svelte';
  import { status } from '../../stores/app';
  import WizardPage from '../../templates/WizardPage.svelte';

  /**
   * The page `/login-problem?reason=<reason>` outside the shell (UC-ACC-1, rest-api.adoc, Addresses Outside the
   * Shell): the login could not start or complete. The reason is one of the three the server names; any other, or
   * none, is the general failure. One act: try again, which starts the login with `return=/`. No mascot: a failure is
   * no calm surface.
   */
  interface Props {
    /** The query of the address, `?reason=…`. */
    search: string;
  }

  let { search }: Props = $props();

  let provider = $derived(loginProviderOf($status));
  let reason = $derived.by(() => {
    const asked = new URLSearchParams(search).get('reason') ?? '';
    return Object.hasOwn(LOGIN_PROBLEM_REASONS, asked) ? asked : 'general';
  });
</script>

<GateFrame>
  <WizardPage
    title={$t('login-problem.title')}
    intro={$t('login-problem.intro')}
    testId="login-problem-view"
  >
    <Notice
      tone={LOGIN_PROBLEM_REASONS[reason] ?? 'danger'}
      title={$t(`login-problem.reason.${reason}.title`)}
      body={$t(`login-problem.reason.${reason}.body`)}
      live
    />
    <p>
      <Link
        href={loginStartAddress(provider, '/')}
        look="primary"
        data-sveltekit-reload
        data-testid="login-problem-retry"
      >
        {$t('login-problem.act')}
      </Link>
    </p>
  </WizardPage>
</GateFrame>
