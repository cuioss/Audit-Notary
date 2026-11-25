<script lang="ts">
  /**
   * An identifier a person compares or copies: a pseudonym, a release tag, a blob id. Monospace, quiet.
   */
  interface Props {
    /** The identifier. */
    value: string;
    /** An accessible name where the identifier alone does not say what it is. */
    label?: string;
    /** A test id. */
    testId?: string;
  }

  let { value, label, testId }: Props = $props();
</script>

<code class="chip" aria-label={label} data-testid={testId}>{value}</code>

<style>
  .chip {
    display: inline-block;
    max-inline-size: 100%;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    background-color: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    line-height: 1.5rem;
    overflow-wrap: anywhere;
    vertical-align: middle;
  }
</style>
