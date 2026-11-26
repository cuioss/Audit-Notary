<script lang="ts">
  import type { Snippet } from 'svelte';
  import { uniqueId } from './uniqueId';

  /**
   * A text field with its label and its field error. It also takes a number or a date, which the schema-driven form
   * (AUN-WEB-4) reads as text and parses itself.
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
    /** The word after the label that says the field is mandatory (the schema's `required`); no native validation. */
    mark?: string;
    /** One or more lines of help under the label. */
    hint?: string | string[];
    /** The `name` of the input. */
    name?: string;
    /** The autocomplete hint. */
    autocomplete?: HTMLInputElement['autocomplete'];
    /** The input type: text, a password that is not shown, a number, a date or a date and time. */
    type?: 'text' | 'password' | 'number' | 'date' | 'datetime-local';
    /** The step of a number or a time: `1` for whole numbers and seconds, `any` for every number. */
    step?: string;
    /** Called after every change with the text. */
    oninput?: (value: string) => void;
    /** Content below the field: the marks and the notes of what the value is. */
    after?: Snippet;
    /** A test id. */
    testId?: string;
  }

  let {
    label,
    value = $bindable(''),
    error = null,
    required = false,
    mark,
    hint,
    name,
    autocomplete,
    type = 'text',
    step,
    oninput,
    after,
    testId,
  }: Props = $props();

  const id = uniqueId('field');
  let hints = $derived(
    (Array.isArray(hint) ? hint : [hint]).filter((line): line is string => !!line),
  );
  let described = $derived(
    [...hints.map((_, index) => `${id}-hint-${index}`), error ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined,
  );
</script>

<div class="field">
  <label class="field__label" for={id}
    >{label}{#if mark}<span class="field__mark">{mark}</span>{/if}</label
  >
  {#each hints as line, index (index)}
    <p class="field__hint" id="{id}-hint-{index}">{line}</p>
  {/each}
  <input
    {id}
    class="field__input"
    {type}
    {value}
    {step}
    {name}
    {required}
    {autocomplete}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={described}
    oninput={(event) => {
      value = event.currentTarget.value;
      oninput?.(value);
    }}
    data-testid={testId}
  />
  {#if after}
    <div class="field__after">{@render after()}</div>
  {/if}
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

  .field__mark {
    margin-inline-start: var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    color: var(--color-text-muted);
  }

  .field__hint {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
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

  .field__after {
    font-size: var(--text-sm);
  }

  .field__error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
