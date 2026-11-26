<script lang="ts">
  import Avatar from '../components/Avatar.svelte';
  import Button from '../components/Button.svelte';
  import Icon from '../components/Icon.svelte';
  import Link from '../components/Link.svelte';
  import { apiClient } from '../api/client';
  import { t } from '../i18n';
  import { session } from '../stores/app';
  import { breadcrumb } from '../stores/breadcrumb';

  /**
   * The top bar: where the user is — the lens and the path below it, the page's one breadcrumb — the search and the
   * account. The state of the event stream is not shown (owner's decision): saves by others and the degraded state
   * still arrive over it and speak where they matter.
   */
  interface Props {
    /** The catalogue key of the current view's title. */
    titleKey: string;
    /** The address of the lens, the first step of the path. */
    lensHref?: string | null;
    /** The catalogue key of the lens's name, the first step of the path below the lens. */
    lensKey?: string | null;
    /** Opens the search (the command palette). */
    onSearch: () => void;
  }

  let { titleKey, lensHref = null, lensKey = null, onSearch }: Props = $props();

  let signingOut = $state(false);

  async function signOut() {
    signingOut = true;
    try {
      await apiClient.logout();
    } finally {
      signingOut = false;
    }
  }
</script>

<header class="top-bar">
  <nav class="top-bar__where" aria-label={$t('shell.breadcrumb')}>
    <ol class="crumbs">
      <li class="crumbs__step crumbs__step--lens">
        {#if lensHref && $breadcrumb.length > 0}
          <Link href={lensHref} quiet
            ><span data-testid="view-title">{$t(lensKey ?? titleKey)}</span></Link
          >
        {:else}
          <span class="top-bar__title" data-testid="view-title" aria-current="page"
            >{$t(titleKey)}</span
          >
        {/if}
      </li>
      {#each $breadcrumb as crumb, index (index)}
        {@const last = index === $breadcrumb.length - 1}
        <li class="crumbs__step" class:crumbs__step--inner={!last}>
          <span class="crumbs__sep" aria-hidden="true"><Icon name="act.next" size={16} /></span>
          {#if last}
            <span class="crumbs__current" aria-current="page">{crumb.label}</span>
          {:else}
            <Link href={crumb.href} quiet>{crumb.label}</Link>
          {/if}
        </li>
      {/each}
    </ol>
  </nav>
  <div class="top-bar__tools">
    <span class="top-bar__search">
      <Button variant="ghost" icon="act.search" onclick={onSearch} data-testid="search-open">
        <span class="top-bar__search-label">{$t('shell.search.open')}</span>
      </Button>
    </span>
    {#if $session}
      <span
        class="top-bar__user"
        title={$t('shell.user.signed-in-as', { name: $session.user.name })}
      >
        <Avatar name={$session.user.name} size="sm" />
        <span class="top-bar__user-name" aria-hidden="true">{$session.user.name}</span>
        <span class="sr-only" data-testid="user-name">
          {$t('shell.user.signed-in-as', { name: $session.user.name })}
        </span>
      </span>
      <Button variant="ghost" busy={signingOut} onclick={signOut} data-testid="sign-out">
        {$t('shell.user.logout')}
      </Button>
    {/if}
  </div>
</header>

<style>
  .top-bar {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--layer-bar);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    min-block-size: 56px;
    padding: var(--space-2) var(--space-6);
    background-color: color-mix(in srgb, var(--color-bg-app) 92%, transparent);
    backdrop-filter: blur(8px);
    border-block-end: 1px solid var(--color-border);
  }

  .top-bar__where {
    min-inline-size: 0;
  }

  .crumbs {
    display: flex;
    align-items: center;
    min-inline-size: 0;
    list-style: none;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .crumbs__step {
    display: inline-flex;
    align-items: center;
    min-inline-size: 0;
    white-space: nowrap;
  }

  .crumbs__step :global(.link) {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The way up keeps its words; the long title of the page itself gives way first. */
  .crumbs__step:not(:last-child) {
    flex-shrink: 0;
    max-inline-size: 16rem;
  }

  .crumbs__step :global(.link:hover) {
    color: var(--color-text-primary);
    text-decoration: underline;
  }

  .crumbs__step--lens {
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
  }

  .crumbs__sep {
    display: inline-flex;
    padding-inline: var(--space-1);
    color: var(--color-text-muted);
  }

  .crumbs__current {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-text-primary);
    font-weight: var(--weight-medium);
  }

  .top-bar__title {
    font-weight: var(--weight-semibold);
  }

  .top-bar__tools {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .top-bar__user {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .top-bar__user-name {
    white-space: nowrap;
  }

  @media (max-width: 1279px) {
    .crumbs__step--inner:not(:nth-child(2)) {
      display: none;
    }
  }

  @media (max-width: 1023px) {
    .top-bar__user-name {
      display: none;
    }

    .crumbs__step--inner {
      display: none;
    }
  }

  @media (max-width: 767px) {
    .top-bar {
      padding-inline: var(--space-4);
    }

    .top-bar__user {
      display: none;
    }

    .crumbs__step--lens:not(:only-child) {
      display: none;
    }

    .crumbs__step:last-child .crumbs__sep {
      display: none;
    }

    .top-bar__search-label {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
</style>
