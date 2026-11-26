<script lang="ts">
  import '../styles/base.css';
  import { onMount, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Button from '../lib/components/Button.svelte';
  import Notice from '../lib/components/Notice.svelte';
  import Wordmark from '../lib/brand/Wordmark.svelte';
  import { catalogueReady, t } from '../lib/i18n';
  import { isOutsideShell, lensOf, parseAddress, routeTitleKey } from '../lib/routes';
  import AccessNotices from '../lib/shell/AccessNotices.svelte';
  import AppShell from '../lib/shell/AppShell.svelte';
  import { boot, bootOutsideShell, bootPhase, session, status } from '../lib/stores/app';
  import { applyTheme, readThemeChoice, watchSystemTheme } from '../lib/theme';

  /**
   * The root of the app: theme, start (status, texts, session, event stream), the first-login rule
   * (AUN-DIR-2) and the shell around every view. The three addresses outside the shell (`/login`, `/signed-out`,
   * `/login-problem`) start without a session and render without the shell.
   */
  let { children }: { children: Snippet } = $props();

  let address = $derived(parseAddress(page.url.pathname, page.url.search));
  let route = $derived(address?.route ?? null);
  let titleKey = $derived(route === null ? 'error.not-found.title' : routeTitleKey(route));
  let outside = $derived(isOutsideShell(route));

  function navigate(href: string) {
    void goto(href);
  }

  async function start() {
    if (outside) {
      await bootOutsideShell();
      return () => {};
    }
    const result = await boot();
    return result.stop;
  }

  onMount(() => {
    applyTheme(readThemeChoice());
    const stopTheme = watchSystemTheme(() => applyTheme(readThemeChoice()));
    let stopBoot: (() => void) | undefined;
    void start().then((stop) => (stopBoot = stop));
    return () => {
      stopTheme();
      stopBoot?.();
    };
  });

  // Until the own entry is saved, the first-login form is the only view (AUN-DIR-2).
  $effect(() => {
    if ($bootPhase === 'ready' && $session?.firstLoginRequired && route !== 'welcome') {
      void goto('/welcome', { replaceState: true });
    }
  });

  // The app started outside the shell and the address moved into it without a page load: start it properly.
  $effect(() => {
    if ($bootPhase === 'outside' && !outside) window.location.reload();
  });

  $effect(() => {
    if ($catalogueReady) {
      document.title = $t('page.title', { view: $t(titleKey) });
    }
  });
</script>

{#if outside && ($bootPhase === 'outside' || $bootPhase === 'ready')}
  {@render children()}
{:else if $bootPhase === 'ready'}
  <AppShell activeLens={route === null ? null : lensOf(route)} {titleKey} onnavigate={navigate}>
    {#snippet notices()}
      <AccessNotices />
      {#if $status?.degraded}
        <Notice
          tone="attention"
          title={$t('status.degraded.title')}
          body={$t('status.degraded.body')}
          live
        />
      {/if}
    {/snippet}
    {#snippet content()}
      {@render children()}
    {/snippet}
  </AppShell>
{:else}
  <div
    class="boot"
    data-testid="boot"
    data-phase={$bootPhase}
    aria-busy={$catalogueReady ? undefined : 'true'}
  >
    {#if $catalogueReady}
      <Wordmark withTagline />
    {/if}
    {#if $bootPhase === 'failed'}
      <Notice tone="danger" title={$t('error.unexpected')} live>
        {#snippet actions()}
          <Button onclick={() => window.location.reload()}>{$t('common.retry')}</Button>
        {/snippet}
      </Notice>
    {:else if $catalogueReady}
      <p class="boot__loading">{$t('common.loading')}</p>
    {/if}
  </div>
{/if}

<style>
  .boot {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-6);
    min-block-size: 100vh;
    padding: var(--space-6);
  }

  .boot__loading {
    color: var(--color-text-muted);
  }
</style>
