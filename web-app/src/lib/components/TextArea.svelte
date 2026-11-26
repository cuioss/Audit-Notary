<script lang="ts">
  import type { Snippet } from 'svelte';
  import { uniqueId } from './uniqueId';

  /**
   * Free text with its label, optional hints and its field error: a comment, a narrative fragment. For a field marked
   * `x-free-text` the schema-driven form passes the hint "no personal details" (AUN-WEB-4).
   */
  interface Props {
    /** The label. */
    label: string;
    /** The value, bindable. */
    value?: string;
    /** One or more hints under the label. */
    hint?: string | string[];
    /** The word after the label that says the text is mandatory (the schema's `required`). */
    mark?: string;
    /** Content below the text: the preview of what it renders to. */
    after?: Snippet;
    /** The field error. */
    error?: string | null;
    /** Visible rows. */
    rows?: number;
    /** Whether the text can be changed. */
    readonly?: boolean;
    /** Called after every change. */
    oninput?: (value: string) => void;
    /** A test id. */
    testId?: string;
  }

  let {
    label,
    value = $bindable(''),
    hint,
    mark,
    after,
    error = null,
    rows = 3,
    readonly = false,
    oninput,
    testId,
  }: Props = $props();

  const id = uniqueId('area');
  let hints = $derived(
    (Array.isArray(hint) ? hint : [hint]).filter((line): line is string => !!line),
  );
  let described = $derived(
    [...hints.map((_, index) => `${id}-hint-${index}`), error ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined,
  );
</script>

<div class="area">
  <label class="area__label" for={id}
    >{label}{#if mark}<span class="area__mark">{mark}</span>{/if}</label
  >
  {#each hints as line, index (index)}
    <p class="area__hint" id="{id}-hint-{index}">{line}</p>
  {/each}
  <textarea
    {id}
    class="area__input"
    bind:value
    {rows}
    {readonly}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={described}
    oninput={() => oninput?.(value)}
    data-testid={testId}
  ></textarea>
  {#if after}
    <div class="area__after">{@render after()}</div>
  {/if}
  {#if error}
    <p class="area__error" id="{id}-error">{error}</p>
  {/if}
</div>

<style>
  .area {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .area__label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
  }

  .area__mark {
    margin-inline-start: var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    color: var(--color-text-muted);
  }

  .area__after {
    font-size: var(--text-sm);
  }

  .area__hint {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }

  .area__input {
    inline-size: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--control-border);
    border-radius: var(--control-radius);
    background-color: var(--control-bg);
    font-family: var(--font-serif);
    font-size: var(--text-md);
    line-height: var(--line-height-md);
    resize: vertical;
  }

  .area__input[readonly] {
    border-style: dashed;
    background-color: var(--color-bg-subtle);
  }

  .area__input[aria-invalid='true'] {
    border-color: var(--color-danger);
  }

  .area__error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
