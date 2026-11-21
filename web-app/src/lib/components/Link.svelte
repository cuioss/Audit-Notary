<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes } from 'svelte/elements';

  /**
   * Navigation: a link of the closed vocabulary. Navigation is a link, an act is a button.
   *
   * Same-origin addresses stay inside the app (SvelteKit's client-side navigation).
   */
  interface Props extends Omit<HTMLAnchorAttributes, 'children'> {
    /** The address. */
    href: string;
    /** Shown as a quiet link without underline, for rows and navigation items. */
    quiet?: boolean;
    /** The content. */
    children: Snippet;
  }

  let { href, quiet = false, children, ...rest }: Props = $props();
</script>

<a {...rest} {href} class="link" class:link--quiet={quiet}>{@render children()}</a>

<style>
  .link--quiet {
    color: inherit;
    text-decoration: none;
  }

  .link--quiet:hover {
    color: inherit;
  }
</style>
