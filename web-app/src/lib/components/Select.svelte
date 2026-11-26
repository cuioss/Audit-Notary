<script lang="ts" module>
  /** One option of a select. */
  export interface SelectOption {
    value: string;
    label: string;
    /** The heading of the group the option stands under (a list that mixes catalogs); none for an option of no group. */
    group?: string;
  }

  /** The options in the order they come, the ones of a group together at the group's first place. */
  export function groupOptions(
    options: SelectOption[],
  ): { label: string | null; options: SelectOption[] }[] {
    const groups: { label: string | null; options: SelectOption[] }[] = [];
    for (const option of options) {
      const label = option.group ?? null;
      const found = label === null ? undefined : groups.find((group) => group.label === label);
      if (found) found.options.push(option);
      else groups.push({ label, options: [option] });
    }
    return groups;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { uniqueId } from './uniqueId';

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
    /** The word after the label that says the choice is mandatory (the schema's `required`); no native validation. */
    mark?: string;
    /** One or more lines of help under the label. */
    hint?: string | string[];
    /** Called with the chosen value after a change. */
    onchange?: (value: string) => void;
    /** Content below the choice: the marks and the notes of what is chosen. */
    after?: Snippet;
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
    mark,
    hint,
    onchange,
    after,
    testId,
  }: Props = $props();

  const id = uniqueId('select');
  let groups = $derived(groupOptions(options));
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
  <select
    {id}
    class="field__select"
    bind:value
    {required}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={described}
    onchange={() => onchange?.(value)}
    data-testid={testId}
  >
    <option value="">{placeholder}</option>
    {#each groups as group (group.label === null ? `o:${group.options[0].value}` : `g:${group.label}`)}
      {#if group.label === null}
        {#each group.options as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      {:else}
        <optgroup label={group.label}>
          {#each group.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </optgroup>
      {/if}
    {/each}
  </select>
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

  .field__after {
    font-size: var(--text-sm);
  }

  /* A picker hands over a holder that has nothing to say yet (no mark): it must not leave a blank line. */
  .field__after:has(> :global(:only-child:empty)) {
    display: none;
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
