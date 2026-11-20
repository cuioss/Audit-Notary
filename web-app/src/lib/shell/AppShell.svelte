<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../i18n';
  import type { Lens } from '../routes';
  import BottomBar from './BottomBar.svelte';
  import CommandPalette from './CommandPalette.svelte';
  import NavRail from './NavRail.svelte';
  import TopBar from './TopBar.svelte';
  import { readRailCollapsed, writeRailCollapsed } from './nav';

  /**
   * The frame of every view: rail, top bar, notices, the view, and the bottom bar on the phone
   * (doc/concepts/web-app.adoc, Structure of the App).
   */
  interface Props {
    /** The lens of the current view, or `null`. */
    activeLens: Lens | null;
    /** The catalogue key of the current view's title. */
    titleKey: string;
    /** Opens an address inside the app. */
    onnavigate: (href: string) => void;
    /** The notices above the view, such as the degraded state. */
    notices?: Snippet;
    /** The view. */
    content: Snippet;
  }

  let { activeLens, titleKey, onnavigate, notices, content }: Props = $props();

  let collapsed = $state(readRailCollapsed());
  let searching = $state(false);

  function toggle() {
    collapsed = !collapsed;
    writeRailCollapsed(collapsed);
  }
</script>

<a class="skip" href="#main">{$t('shell.skip-to-content')}</a>
<div class="app-shell">
  <NavRail {activeLens} {collapsed} onToggle={toggle} />
  <div class="app-shell__main">
    <TopBar {titleKey} onSearch={() => (searching = true)} />
    {#if notices}
      <div class="app-shell__notices">{@render notices()}</div>
    {/if}
    <main id="main" class="app-shell__body" tabindex="-1">{@render content()}</main>
    <BottomBar {activeLens} />
  </div>
</div>
<CommandPalette bind:open={searching} {onnavigate} />

<style>
  .skip {
    position: absolute;
    inset-inline-start: var(--space-2);
    inset-block-start: -100px;
    z-index: var(--layer-dialog);
    padding: var(--space-2) var(--space-3);
    background-color: var(--color-bg-raised);
    border-radius: var(--radius-sm);
  }

  .skip:focus {
    inset-block-start: var(--space-2);
  }

  .app-shell {
    display: flex;
    flex: 1 1 auto;
    min-block-size: 100vh;
    background-color: var(--color-bg-app);
  }

  .app-shell__main {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-inline-size: 0;
    min-block-size: 100vh;
  }

  .app-shell__notices {
    padding: var(--space-4) var(--space-6) 0;
  }

  .app-shell__body {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .app-shell__body:focus {
    outline: 2px solid transparent;
  }

  @media (max-width: 767px) {
    .app-shell__notices {
      padding-inline: var(--space-4);
    }
  }
</style>
