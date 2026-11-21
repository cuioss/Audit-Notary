<script lang="ts">
  import Button from '../components/Button.svelte';
  import { apiClient } from '../api/client';
  import { t } from '../i18n';
  import { session } from '../stores/app';
  import LiveIndicator from './LiveIndicator.svelte';

  /**
   * The top bar: where the user is, the search, the live indicator and the account.
   */
  interface Props {
    /** The catalogue key of the current view's title. */
    titleKey: string;
    /** Opens the search (the command palette). */
    onSearch: () => void;
  }

  let { titleKey, onSearch }: Props = $props();

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
    <span class="top-bar__title" data-testid="view-title">{$t(titleKey)}</span>
  </nav>
  <div class="top-bar__tools">
    <Button variant="ghost" icon="act.search" onclick={onSearch} data-testid="search-open">
      {$t('shell.search.open')}
    </Button>
    <LiveIndicator />
    {#if $session}
      <span class="top-bar__user" data-testid="user-name">
        {$t('shell.user.signed-in-as', { name: $session.user.name })}
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
    background-color: var(--color-bg-app);
    border-block-end: 1px solid var(--color-border);
  }

  .top-bar__title {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  .top-bar__tools {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .top-bar__user {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  @media (max-width: 767px) {
    .top-bar {
      padding-inline: var(--space-4);
    }

    .top-bar__user {
      display: none;
    }
  }
</style>
