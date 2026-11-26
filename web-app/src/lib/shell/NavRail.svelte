<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import IconButton from '../components/IconButton.svelte';
  import Wordmark from '../brand/Wordmark.svelte';
  import { t } from '../i18n';
  import type { Lens } from '../routes';
  import { RAIL_FOOT, railGroups, type NavItem } from './nav';

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
    /** Whether the generic documents lens exists, which adds its entry between ISMS and Catalogs. */
    documents?: boolean;
  }

  let { activeLens, collapsed, onToggle, documents = false }: Props = $props();
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
    {#each railGroups(documents) as group (group.titleKey)}
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
  /*
   * The rail is the register's spine: the navy of the notary's suit in both themes, the mark in its own colours on
   * it, the lenses in the rail's own text colours (tokens.css, `--color-rail-*`).
   */
  .rail {
    position: sticky;
    inset-block-start: 0;
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
    inline-size: 232px;
    block-size: 100vh;
    padding: var(--space-4) var(--space-3);
    gap: var(--space-6);
    background-color: var(--color-bg-rail);
    border-inline-end: 1px solid var(--color-rail-border);
    color: var(--color-rail-text);
  }

  .rail--collapsed {
    inline-size: 64px;
    padding-inline: var(--space-2);
    align-items: center;
  }

  .rail__head {
    padding: var(--space-1) var(--space-2) 0;
  }

  .rail__brand {
    display: inline-flex;
    color: var(--color-rail-text-strong);
    text-decoration: none;
    border-radius: var(--radius-sm);
  }

  .rail__brand:hover {
    color: var(--color-rail-text-strong);
  }

  .rail__brand :global(.wordmark__name) {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    letter-spacing: 0;
  }

  .rail__groups {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    gap: var(--space-5);
    overflow-y: auto;
  }

  .rail__group-title {
    padding-inline: var(--space-3);
    margin-block-end: var(--space-1);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--color-rail-text-muted);
  }

  .rail__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
  }

  .rail__item {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-block-size: 38px;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--color-rail-text);
    text-decoration: none;
    transition: background-color var(--duration-fast) var(--ease-standard);
  }

  .rail__item:hover {
    background-color: var(--color-rail-hover);
    color: var(--color-rail-text-strong);
  }

  .rail__item--active,
  .rail__item--active:hover {
    background-color: var(--color-rail-active);
    color: var(--color-rail-text-strong);
    font-weight: var(--weight-semibold);
  }

  .rail__item--active::before {
    content: '';
    position: absolute;
    inset-block: var(--space-2);
    inset-inline-start: 0;
    inline-size: 3px;
    border-radius: 0 2px 2px 0;
    background-color: var(--color-rail-focus);
  }

  .rail :global(a:focus-visible),
  .rail :global(button:focus-visible) {
    box-shadow: var(--focus-ring-rail);
  }

  .rail--collapsed .rail__label {
    display: none;
  }

  .rail--collapsed .rail__item {
    justify-content: center;
    padding-inline: 0;
    inline-size: 44px;
  }

  .rail__foot {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block-start: var(--space-3);
    border-block-start: 1px solid var(--color-rail-border);
  }

  .rail__foot :global(.icon-btn) {
    color: var(--color-rail-text);
  }

  .rail__foot :global(.icon-btn:hover) {
    background-color: var(--color-rail-hover);
    color: var(--color-rail-text-strong);
  }

  .rail--collapsed .rail__foot :global(.icon-btn) {
    transform: scaleX(-1);
  }

  @media (forced-colors: active) {
    .rail__item--active {
      outline: 2px solid Highlight;
    }
  }

  @media (max-width: 767px) {
    .rail {
      display: none;
    }
  }
</style>
