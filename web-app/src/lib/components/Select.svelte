<script lang="ts">
  import { uniqueId } from './uniqueId';

  /** One option of a select. */
  export interface SelectOption {
    value: string;
    label: string;
  }

  /**
   * A pick from a closed list, with its label and its field error.
   */
  interface Props {
    /** The label. */
    label: string;
    /** The options. */
    options: SelectOption[];
    /** The chosen value, bindable; empty while nothing is chosen. */
    value?: string;
    /** The text of the empty choice. */
    placeholder: string;
    /** The field error. */
    error?: string | null;
    /** Whether a choice is required. */
    required?: boolean;
    /** A test id. */
    testId?: string;
  }

  let {
    label,
    options,
    value = $bindable(''),
    placeholder,
    error = null,
    required = false,
    testId,
  }: Props = $props();

  const id = uniqueId('select');
</script>

<div class="field">
  <label class="field__label" for={id}>{label}</label>
  <select
    {id}
    class="field__select"
    bind:value
    {required}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={error ? `${id}-error` : undefined}
    data-testid={testId}
  >
    <option value="">{placeholder}</option>
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
  {#if error}
    <p class="field__error" id="{id}-error">{error}</p>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field__label {
    font-weight: var(--weight-medium);
  }

  .field__select {
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: 1px solid var(--control-border);
    border-radius: var(--control-radius);
    background-color: var(--control-bg);
  }

  .field__select[aria-invalid='true'] {
    border-color: var(--color-danger);
  }

  .field__error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
