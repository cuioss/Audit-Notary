<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import IconButton from '../components/IconButton.svelte';
  import Wordmark from '../brand/Wordmark.svelte';
  import { t } from '../i18n';
  import type { Lens } from '../routes';
  import { RAIL_FOOT, RAIL_GROUPS, type NavItem } from './nav';

  /**
   * The navigation rail: the mark with the name, the lenses in two groups, Settings at the foot.
   * Collapsible to icons; hidden on the phone, where the bottom bar takes over.
   */
  interface Props {
    /** The lens of the current view, or `null`. */
    activeLens: Lens | null;
    /** Whether the rail shows icons only. */
    collapsed: boolean;
    /** Turns the rail between full and icon width. */
    onToggle: () => void;
  }

  let { activeLens, collapsed, onToggle }: Props = $props();
</script>

{#snippet entry(item: NavItem)}
  <li>
    <a
      class="rail__item"
      class:rail__item--active={item.lens === activeLens}
      href={item.href}
      aria-current={item.lens === activeLens ? 'page' : undefined}
      title={collapsed ? $t(item.labelKey) : undefined}
      data-testid={item.testId}
    >
      <Icon name={item.icon} size={20} />
      <span class="rail__label">{$t(item.labelKey)}</span>
    </a>
  </li>
{/snippet}

<nav class="rail" class:rail--collapsed={collapsed} aria-label={$t('shell.rail.label')}>
  <div class="rail__head">
    <a class="rail__brand" href="/" aria-label={collapsed ? $t('shell.home') : undefined}>
      <Wordmark compact={collapsed} />
    </a>
  </div>
  <div class="rail__groups">
    {#each RAIL_GROUPS as group (group.titleKey)}
      <section class="rail__group">
        {#if !collapsed}
          <h2 class="rail__group-title">{$t(group.titleKey)}</h2>
        {/if}
        <ul class="rail__list">
          {#each group.items as item (item.lens)}
            {@render entry(item)}
          {/each}
        </ul>
      </section>
    {/each}
  </div>
  <div class="rail__foot">
    <ul class="rail__list">
      {@render entry(RAIL_FOOT)}
    </ul>
    <IconButton
      icon="act.back"
      label={$t(collapsed ? 'shell.rail.expand' : 'shell.rail.collapse')}
      pressed={collapsed}
      onclick={onToggle}
      data-testid="rail-toggle"
    />
  </div>
</nav>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
    inline-size: 232px;
    min-block-size: 100vh;
    padding: var(--space-3) var(--space-2);
    gap: var(--space-4);
    background-color: var(--color-bg-rail);
    border-inline-end: 1px solid var(--color-border);
  }

  .rail--collapsed {
    inline-size: 64px;
    padding-inline: var(--space-1);
    align-items: center;
  }

  .rail__head {
    padding-inline: var(--space-2);
  }

  .rail__brand {
    display: inline-flex;
    color: var(--color-text-primary);
    text-decoration: none;
    border-radius: var(--radius-sm);
  }

  .rail__brand:hover {
    color: var(--color-text-primary);
  }

  .rail__groups {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    gap: var(--space-4);
    overflow-y: auto;
  }

  .rail__group-title {
    padding-inline: var(--space-2);
    margin-block-end: var(--space-1);
    font-size: var(--text-xs);
    letter-spacing: 0.02em;
    color: var(--color-text-muted);
  }

  .rail__list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    list-style: none;
  }

  .rail__item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 36px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    text-decoration: none;
  }

  .rail__item:hover {
    background-color: var(--color-bg-subtle);
    color: var(--color-text-primary);
  }

  .rail__item--active,
  .rail__item--active:hover {
    background-color: var(--color-brand-subtle);
    color: var(--color-brand);
    font-weight: var(--weight-semibold);
  }

  .rail--collapsed .rail__label {
    display: none;
  }

  .rail--collapsed .rail__item {
    justify-content: center;
  }

  .rail__foot {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .rail--collapsed .rail__foot :global(.icon-btn) {
    transform: scaleX(-1);
  }

  @media (max-width: 767px) {
    .rail {
      display: none;
    }
  }
</style>
