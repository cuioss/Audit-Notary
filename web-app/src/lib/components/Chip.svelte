<script lang="ts">
  /**
   * An identifier a person compares or copies: a pseudonym, a release tag, a blob id. Monospace, quiet.
   */
  interface Props {
    /** The identifier. */
    value: string;
    /** What the identifier is, said to assistive technology before it (a code element takes no own name). */
    label?: string;
    /** A test id. */
    testId?: string;
  }

  let { value, label, testId }: Props = $props();
</script>

<code class="chip" data-testid={testId}
  >{#if label}<span class="sr-only">{label}:&nbsp;</span>{/if}{value}</code
>

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
