<script lang="ts">
  import Button from '../components/Button.svelte';
  import { apiClient } from '../api/client';
  import { t } from '../i18n';
  import { streamState } from '../stores/app';

  /**
   * The state of the event stream (AUN-WEB-5): a word and a dot, never a colour alone. Offline offers
   * "Try again".
   */
  const LABELS = {
    connecting: 'live.connecting',
    connected: 'live.connected',
    reconnecting: 'live.reconnecting',
    offline: 'live.offline',
  } as const;

  let label = $derived($t(LABELS[$streamState]));
</script>

<span
  class="live live--{$streamState}"
  role="status"
  title={$t('live.title', { state: label })}
  data-testid="live-indicator"
  data-state={$streamState}
>
  <span class="live__dot" aria-hidden="true"></span>
  <span>{label}</span>
  {#if $streamState === 'offline'}
    <Button variant="ghost" onclick={() => apiClient.retryEvents()} data-testid="live-retry">
      {$t('common.retry')}
    </Button>
  {/if}
</span>

<style>
  .live {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .live__dot {
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--radius-full);
    background-color: var(--color-neutral);
  }

  .live--connected .live__dot {
    background-color: var(--color-success);
  }

  .live--reconnecting .live__dot,
  .live--connecting .live__dot {
    background-color: var(--color-attention);
  }

  .live--offline .live__dot {
    background-color: var(--color-danger);
  }
</style>
