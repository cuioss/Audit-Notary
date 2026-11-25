<script lang="ts">
  /**
   * A setting that is on or off, said by its label: a switch (`role="switch"`), so assistive technology announces
   * "on" and "off".
   */
  interface Props {
    /** The label. */
    label: string;
    /** Whether it is on. */
    checked: boolean;
    /** Called with the new value. */
    onchange: (checked: boolean) => void;
    /** A test id. */
    testId?: string;
  }

  let { label, checked, onchange, testId }: Props = $props();
</script>

<button
  class="toggle"
  type="button"
  role="switch"
  aria-checked={checked}
  onclick={() => onchange(!checked)}
  data-testid={testId}
>
  <span class="toggle__track" aria-hidden="true"><span class="toggle__thumb"></span></span>
  <span class="toggle__label">{label}</span>
</button>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 32px;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    text-align: start;
    border-radius: var(--radius-sm);
  }

  .toggle__track {
    position: relative;
    flex: 0 0 auto;
    inline-size: 30px;
    block-size: 18px;
    border-radius: var(--radius-full);
    background-color: var(--color-bg-surface);
    border: 1px solid var(--color-border-field);
    transition: background-color var(--duration-fast) var(--ease-standard);
  }

  .toggle__thumb {
    position: absolute;
    inset-block-start: 2px;
    inset-inline-start: 2px;
    inline-size: 12px;
    block-size: 12px;
    border-radius: var(--radius-full);
    background-color: var(--color-text-muted);
    transition: transform var(--duration-fast) var(--ease-standard);
  }

  .toggle[aria-checked='true'] .toggle__track {
    background-color: var(--color-brand);
    border-color: var(--color-brand);
  }

  .toggle[aria-checked='true'] .toggle__thumb {
    transform: translateX(12px);
    background-color: var(--color-on-brand);
  }
</style>
