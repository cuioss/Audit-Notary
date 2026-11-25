<script lang="ts">
  import Icon from './Icon.svelte';

  /**
   * A state that needs the person: a box with the alert mark and its reason ("3 days overdue", "Conflict"). At most
   * one per row; information without an act is a {@link StatusLabel} instead.
   */
  interface Props {
    /** The reason. */
    label: string;
    /** `danger` only for what is already late or lost; `attention` otherwise. */
    tone?: 'attention' | 'danger';
    /** A test id. */
    testId?: string;
  }

  let { label, tone = 'attention', testId }: Props = $props();
</script>

<span class="reason reason--{tone}" data-testid={testId} data-tone={tone}>
  <Icon name="state.alert" size={16} />
  <span>{label}</span>
</span>

<style>
  .reason {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 1px var(--space-2) 1px var(--space-1);
    border: 1px solid var(--color-attention);
    border-radius: var(--radius-full);
    background-color: var(--color-attention-subtle);
    color: var(--color-attention-text);
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-medium);
    white-space: nowrap;
  }

  .reason--danger {
    border-color: var(--color-danger);
    background-color: var(--color-danger-subtle);
    color: var(--color-danger);
  }
</style>
