<script lang="ts">
  import { uniqueId } from './uniqueId';

  /**
   * A text field with its label and its field error.
   */
  interface Props {
    /** The label. */
    label: string;
    /** The value, bindable. */
    value?: string;
    /** The field error, the text of a refusal for this field. */
    error?: string | null;
    /** Whether the field must be filled. */
    required?: boolean;
    /** The `name` of the input. */
    name?: string;
    /** The autocomplete hint. */
    autocomplete?: HTMLInputElement['autocomplete'];
    /** The input type: text, or a password that is not shown. */
    type?: 'text' | 'password';
    /** A test id. */
    testId?: string;
  }

  let {
    label,
    value = $bindable(''),
    error = null,
    required = false,
    name,
    autocomplete,
    type = 'text',
    testId,
  }: Props = $props();

  const id = uniqueId('field');
</script>

<div class="field">
  <label class="field__label" for={id}>{label}</label>
  <input
    {id}
    class="field__input"
    {type}
    bind:value
    {name}
    {required}
    {autocomplete}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={error ? `${id}-error` : undefined}
    data-testid={testId}
  />
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

  .field__input {
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: 1px solid var(--control-border);
    border-radius: var(--control-radius);
    background-color: var(--control-bg);
  }

  .field__input[aria-invalid='true'] {
    border-color: var(--color-danger);
  }

  .field__error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
