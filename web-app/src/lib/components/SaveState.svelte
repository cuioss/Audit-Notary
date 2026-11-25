<script lang="ts" module>
  /**
   * Where the person's work stands (AUN-WEB-5): nothing changed, a change not yet kept, kept for them only (a draft),
   * being saved, saved for everyone, or a save that did not go through.
   */
  export type SaveStateKind =
    | 'clean'
    | 'changed'
    | 'drafting'
    | 'draft'
    | 'saving'
    | 'saved'
    | 'conflict'
    | 'failed'
    | 'read-only';
</script>

<script lang="ts">
  import Icon from './Icon.svelte';

  /**
   * The save state of a document in its margin: an icon and one sentence, announced politely as it changes. "Saved
   * for you" and "saved for everyone" are two states the person must always be able to tell apart.
   */
  interface Props {
    /** The state. */
    state: SaveStateKind;
    /** The sentence, from the catalogue, with the time where there is one. */
    label: string;
    /** A test id. */
    testId?: string;
  }

  let { state, label, testId }: Props = $props();

  const ICONS: Record<SaveStateKind, string> = {
    clean: 'state.check',
    changed: 'state.draft',
    drafting: 'state.draft',
    draft: 'state.person',
    saving: 'act.save',
    saved: 'state.done',
    conflict: 'state.conflict',
    failed: 'state.alert',
    'read-only': 'state.lock',
  };
</script>

<p class="save save--{state}" role="status" data-testid={testId} data-state={state}>
  <Icon name={ICONS[state]} size={16} />
  <span>{label}</span>
</p>

<style>
  .save {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font-size: var(--text-sm);
    line-height: var(--line-height-sm);
    color: var(--color-text-secondary);
  }

  .save :global(.ui-icon) {
    margin-block-start: 1px;
  }

  .save--saved {
    color: var(--color-success);
  }

  .save--draft,
  .save--changed,
  .save--drafting {
    color: var(--color-text-primary);
  }

  .save--conflict,
  .save--failed {
    color: var(--color-danger);
    font-weight: var(--weight-medium);
  }
</style>
