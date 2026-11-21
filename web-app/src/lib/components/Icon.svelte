<script lang="ts">
  import { uiIconUrl } from '../icons/uiIcons';

  /**
   * One icon of the set, painted through its alpha mask in the current text colour.
   *
   * Decorative wherever a visible label carries the meaning; `label` names it where it stands alone. The
   * size and the mask are set through the CSSOM (`style:`), which `style-src 'self'` permits (TRH-WEB-8).
   */
  interface Props {
    /** The icon name from `uiIcons`. */
    name: string | null | undefined;
    /** The delivered size: 16, 20 or 24. */
    size?: 16 | 20 | 24;
    /** An accessible name, for an icon without a visible label. */
    label?: string;
  }

  let { name, size = 20, label }: Props = $props();

  let url = $derived(uiIconUrl(name));
</script>

{#if url}
  <span
    class="ui-icon"
    style:--ui-icon-url={`url("${url}")`}
    style:--ui-icon-size={`${size}px`}
    role={label ? 'img' : undefined}
    aria-label={label || undefined}
    aria-hidden={label ? undefined : 'true'}
    data-icon={name ?? ''}
  ></span>
{/if}

<style>
  .ui-icon {
    display: inline-block;
    inline-size: var(--ui-icon-size);
    block-size: var(--ui-icon-size);
    flex: 0 0 auto;
    background-color: currentcolor;
    mask-image: var(--ui-icon-url);
    mask-repeat: no-repeat;
    mask-position: center;
    mask-size: contain;
    vertical-align: -0.125em;
  }
</style>
