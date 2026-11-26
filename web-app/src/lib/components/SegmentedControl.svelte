<script lang="ts">
  import Icon from './Icon.svelte';
  import { uniqueId } from './uniqueId';

  /** One option of the control. */
  export interface Segment {
    value: string;
    label: string;
    icon?: string;
  }

  /**
   * Two to five views of the same thing side by side (the seal or the table of the scores): radio buttons, so the
   * arrow keys move between them.
   */
  interface Props {
    /** The accessible name of the group. */
    label: string;
    /** The options. */
    options: Segment[];
    /** The chosen value. */
    value: string;
    /** Called with the chosen value. */
    onchange: (value: string) => void;
    /** A test id prefix; each option gets `<testId>-<value>`. */
    testId?: string;
  }

  let { label, options, value, onchange, testId }: Props = $props();

  const name = uniqueId('segment');
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
  {#each options as option (option.value)}
    <label class="segmented__option" class:segmented__option--chosen={option.value === value}>
      <input
        class="sr-only"
        type="radio"
        {name}
        value={option.value}
        checked={option.value === value}
        onchange={() => onchange(option.value)}
        data-testid={testId ? `${testId}-${option.value}` : undefined}
      />
      {#if option.icon}<Icon name={option.icon} size={16} />{/if}
      <span>{option.label}</span>
    </label>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    padding: 2px;
    gap: 2px;
    border-radius: var(--radius-md);
    background-color: var(--color-bg-sunken);
  }

  .segmented__option {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-block-size: 28px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .segmented__option:hover {
    color: var(--color-text-primary);
  }

  .segmented__option--chosen {
    background-color: var(--color-bg-surface);
    color: var(--color-text-primary);
    font-weight: var(--weight-medium);
    box-shadow: var(--shadow-1);
  }

  .segmented__option:has(input:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  /* Phone: the target is the whole option, 44 px high. */
  @media (max-width: 599px) {
    .segmented__option {
      min-block-size: 44px;
    }
  }
</style>
