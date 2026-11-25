<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import TextField from '../../components/TextField.svelte';
  import { loginProviderOf, loginStartAddress } from '../../access/access';
  import { apiClient } from '../../api/client';
  import { errorMessageKey } from '../../api/errors';
  import { t } from '../../i18n';
  import { checkReturn } from '../../routes';
  import GateFrame from '../../shell/GateFrame.svelte';
  import { status } from '../../stores/app';
  import WizardPage from '../../templates/WizardPage.svelte';

  /**
   * The login page `/login?return=<address>` outside the shell (UC-ACC-1, UC-ACC-7, rest-api.adoc, Addresses
   * Outside the Shell). With local test accounts it is a form with a username and a password, posted to Quarkus' form
   * login; a wrong password says so and keeps the form, with the password cleared. With the identity provider the
   * page only starts the provider's login at once. The `return` is checked against the canonical addresses here
   * too; `/` when it fails.
   */
  interface Props {
    /** The query of the address, `?return=…`. */
    search: string;
  }

  let { search }: Props = $props();

  let provider = $derived(loginProviderOf($status));
  let returnTo = $derived(checkReturn(new URLSearchParams(search).get('return')));

  let username = $state('');
  let password = $state('');
  let usernameError = $state<string | null>(null);
  let passwordError = $state<string | null>(null);
  let failure = $state<string | null>(null);
  let busy = $state(false);

  onMount(() => {
    if (provider === 'oidc') apiClient.startLogin('oidc', returnTo);
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    usernameError = username.trim() === '' ? $t('error.validation.REQUIRED') : null;
    passwordError = password === '' ? $t('error.validation.REQUIRED') : null;
    failure = null;
    if (usernameError || passwordError) return;
    busy = true;
    try {
      if (await apiClient.localLogin(username.trim(), password)) {
        apiClient.go(returnTo);
        return;
      }
      failure = 'login.failed';
      password = '';
    } catch (error) {
      failure = errorMessageKey(error);
      password = '';
    }
    busy = false;
  }
</script>

<GateFrame>
  {#if provider === 'local'}
    <WizardPage title={$t('login.title')} intro={$t('login.intro')} testId="login-view">
      <form class="login" onsubmit={submit} novalidate>
        {#if failure}
          <Notice tone="danger" title={$t(failure)} live />
        {/if}
        <TextField
          label={$t('login.username')}
          name="j_username"
          autocomplete="username"
          bind:value={username}
          error={usernameError}
          required
          testId="login-username"
        />
        <TextField
          label={$t('login.password')}
          name="j_password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          error={passwordError}
          required
          testId="login-password"
        />
        <div class="login__acts">
          <Button type="submit" variant="primary" {busy} data-testid="login-submit">
            {$t('login.submit')}
          </Button>
        </div>
      </form>
    </WizardPage>
  {:else}
    <WizardPage
      title={$t('login.provider.title')}
      intro={$t('login.provider.intro')}
      testId="login-provider-view"
    >
      <p>
        <Link
          href={loginStartAddress('oidc', returnTo)}
          look="primary"
          data-sveltekit-reload
          data-testid="login-continue"
        >
          {$t('login.provider.continue')}
        </Link>
      </p>
    </WizardPage>
  {/if}
</GateFrame>

<style>
  .login {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .login__acts {
    display: flex;
    justify-content: flex-end;
  }
</style>
