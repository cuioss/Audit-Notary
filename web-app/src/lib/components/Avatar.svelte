<script lang="ts">
  import { initials } from '../format';

  /**
   * A person's initials in a disc, beside their name or standing for it with its accessible name. Never a picture:
   * the app keeps no photo of anyone (doc/concepts/data-protection-and-repository-layout.adoc).
   */
  interface Props {
    /** The person's name. */
    name: string;
    /** Whether the name is said by the avatar alone (no visible name beside it). */
    labelled?: boolean;
    /** The size. */
    size?: 'sm' | 'md';
  }

  let { name, labelled = false, size = 'md' }: Props = $props();
</script>

<span
  class="avatar avatar--{size}"
  role={labelled ? 'img' : undefined}
  aria-label={labelled ? name : undefined}
  aria-hidden={labelled ? undefined : 'true'}
  title={labelled ? name : undefined}>{initials(name)}</span
>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--radius-full);
    background-color: var(--color-bg-surface);
    border: 1px solid var(--color-border-strong);
    color: var(--color-text-secondary);
    font-size: 11px;
    font-weight: var(--weight-semibold);
    letter-spacing: 0.02em;
  }

  .avatar--sm {
    inline-size: 22px;
    block-size: 22px;
    font-size: 10px;
  }
</style>
