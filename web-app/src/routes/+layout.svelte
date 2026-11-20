<script lang="ts">
  import '../styles/base.css';
  import { onMount, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Button from '../lib/components/Button.svelte';
  import Notice from '../lib/components/Notice.svelte';
  import Wordmark from '../lib/brand/Wordmark.svelte';
  import { catalogueReady, t } from '../lib/i18n';
  import { lensOf, parseAddress, routeTitleKey } from '../lib/routes';
  import AppShell from '../lib/shell/AppShell.svelte';
  import { boot, bootPhase, session, status } from '../lib/stores/app';
  import { applyTheme, readThemeChoice, watchSystemTheme } from '../lib/theme';

  /**
   * The root of the app: theme, start (status, texts, session, event stream), the first-login rule
   * (TRH-DIR-2) and the shell around every view.
   */
  let { children }: { children: Snippet } = $props();

  let address = $derived(parseAddress(page.url.pathname));
  let route = $derived(address?.route ?? null);
  let titleKey = $derived(route === null ? 'error.not-found.title' : routeTitleKey(route));

  function navigate(href: string) {
    void goto(href);
  }

  async function start() {
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

  // Until the own entry is saved, the first-login form is the only view (TRH-DIR-2).
  $effect(() => {
    if ($bootPhase === 'ready' && $session?.firstLoginRequired && route !== 'welcome') {
      void goto('/welcome', { replaceState: true });
    }
  });

  $effect(() => {
    if ($catalogueReady) {
      document.title = $t('page.title', { view: $t(titleKey) });
    }
  });
</script>

{#if $bootPhase === 'ready'}
  <AppShell activeLens={route === null ? null : lensOf(route)} {titleKey} onnavigate={navigate}>
    {#snippet notices()}
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
