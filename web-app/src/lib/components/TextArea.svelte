<script lang="ts">
  import { uniqueId } from './uniqueId';

  /**
   * Free text with its label, an optional hint and its field error: a comment, a narrative fragment. For a field marked
   * `x-free-text` the caller passes the hint "no personal details" (AUN-WEB-4); the schema-driven form will do so
   * for every such field once it exists.
   */
  interface Props {
    /** The label. */
    label: string;
    /** The value, bindable. */
    value?: string;
    /** The hint under the label. */
    hint?: string;
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
    error = null,
    rows = 3,
    readonly = false,
    oninput,
    testId,
  }: Props = $props();

  const id = uniqueId('area');
  let described = $derived(
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
      undefined,
  );
</script>

<div class="area">
  <label class="area__label" for={id}>{label}</label>
  {#if hint}
    <p class="area__hint" id="{id}-hint">{hint}</p>
  {/if}
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
