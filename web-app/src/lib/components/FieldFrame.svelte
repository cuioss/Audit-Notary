<script lang="ts">
  import type { Snippet } from 'svelte';
  import { uniqueId } from './uniqueId';

  /**
   * The help and the error of a field whose control has no label of its own: a switch, a table. The control stands
   * first, the help under it, the error last; the control gets the ids it must name in `aria-describedby`.
   */
  interface Props {
    /** One or more lines of help. */
    hint?: string | string[];
    /** The field error. */
    error?: string | null;
    /** The control, given the ids of the help and the error. */
    children: Snippet<[string | undefined]>;
    /** A test id. */
    testId?: string;
  }

  let { hint, error = null, children, testId }: Props = $props();

  const id = uniqueId('frame');
  let hints = $derived(
    (Array.isArray(hint) ? hint : [hint]).filter((line): line is string => !!line),
  );
  let described = $derived(
    [...hints.map((_, index) => `${id}-hint-${index}`), error ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined,
  );
</script>

<div class="frame" data-testid={testId}>
  {@render children(described)}
  {#each hints as line, index (index)}
    <p class="frame__hint" id="{id}-hint-{index}">{line}</p>
  {/each}
  {#if error}
    <p class="frame__error" id="{id}-error">{error}</p>
  {/if}
</div>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .frame__hint {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }

  .frame__error {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }
</style>
