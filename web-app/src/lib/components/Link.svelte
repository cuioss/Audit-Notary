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
    /**
     * Shown as a button, for navigation that is the act of its screen ("Review and release" opens the release):
     * still a link, because it opens an address.
     */
    look?: 'primary' | 'secondary';
    /** The content. */
    children: Snippet;
  }

  let { href, quiet = false, look, children, ...rest }: Props = $props();
</script>

<a
  {...rest}
  {href}
  class="link {look ? `link--button link--${look}` : ''}"
  class:link--quiet={quiet}>{@render children()}</a
>

<style>
  .link--quiet {
    color: inherit;
    text-decoration: none;
  }

  .link--quiet:hover {
    color: inherit;
  }

  .link--button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--control-height);
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    line-height: 1.25;
    text-decoration: none;
    border: 1px solid transparent;
    border-radius: var(--control-radius);
    white-space: nowrap;
  }

  .link--primary,
  .link--primary:hover {
    background-color: var(--color-brand);
    color: var(--color-on-brand);
  }

  .link--primary:hover {
    background-color: var(--color-brand-hover);
  }

  .link--secondary,
  .link--secondary:hover {
    background-color: var(--color-bg-surface);
    color: var(--color-text-primary);
    border-color: var(--color-border-strong);
  }

  .link--secondary:hover {
    background-color: var(--color-bg-subtle);
  }
</style>
