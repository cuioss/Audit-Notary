<script lang="ts">
  import type { Snippet } from 'svelte';
  import Wordmark from '../brand/Wordmark.svelte';
  import AccessNotices from './AccessNotices.svelte';

  /**
   * The frame of the pages outside the shell (`/login`, `/signed-out`, `/login-problem`): the name above one
   * column on the desk, with the notice of local test accounts when the installation has them, and no rail, no top
   * bar and no session (doc/specification/rest-api.adoc, Addresses Outside the Shell).
   */
  interface Props {
    /** The page. */
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<div class="gate">
  <header class="gate__head"><Wordmark /></header>
  <main id="main" class="gate__main" tabindex="-1">
    <div class="gate__notices"><AccessNotices /></div>
    {@render children()}
  </main>
</div>

<style>
  .gate {
    display: flex;
    flex-direction: column;
    min-block-size: 100vh;
    background-color: var(--color-bg-app);
  }

  .gate__head {
    padding: var(--space-5) var(--space-6);
  }

  .gate__main {
    flex: 1 1 auto;
    inline-size: 100%;
    max-inline-size: 720px;
    margin-inline: auto;
  }

  .gate__main:focus {
    outline: 2px solid transparent;
  }

  .gate__notices {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-inline: var(--space-6);
  }

  @media (max-width: 767px) {
    .gate__head,
    .gate__notices {
      padding-inline: var(--space-4);
    }
  }
</style>
