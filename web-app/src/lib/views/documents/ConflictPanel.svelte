<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Notice from '../../components/Notice.svelte';
  import type { ConflictField } from '../../api/types';
  import { fieldLabel } from '../../documents/categories';
  import { plainValue } from '../../documents/display';
  import { messagesStore, t } from '../../i18n';
  import { tick } from 'svelte';

  /**
   * The conflict of a save (UC-DOC-4, AUN-WEB-5): each field that someone else changed meanwhile, with the own and the
   * other version side by side and the person's decision per field. Nothing is saved until every field is decided; the
   * own changes are kept as a draft meanwhile.
   */
  interface Props {
    /** The fields to decide, by JSON Pointer. */
    conflicts: Record<string, ConflictField>;
    /** The category id, for the labels. */
    category: string;
    /** The document type id, for the labels. */
    kind: string;
    /** Whether nothing can be decided now (the sheet cannot be edited). */
    locked: boolean;
    /** Decides one field. */
    onresolve: (pointer: string, keep: 'own' | 'other') => void;
    /** Called after the last field was decided and the panel is gone: where the keyboard goes on. */
    ondecided?: () => void;
  }

  let { conflicts, category, kind, locked, onresolve, ondecided }: Props = $props();

  let entries = $derived(Object.entries(conflicts));
  let panel: HTMLElement | undefined = $state();

  /**
   * Decides one field. The decided field leaves the list together with the button that was pressed, so the focus moves
   * on to the next field to decide, or to `ondecided` after the last one, and never falls to the page.
   */
  async function decide(pointer: string, keep: 'own' | 'other') {
    const index = entries.findIndex(([key]) => key === pointer);
    onresolve(pointer, keep);
    await tick();
    const rows = panel?.querySelectorAll<HTMLElement>('.conflict') ?? [];
    if (rows.length === 0) {
      ondecided?.();
      return;
    }
    rows[Math.min(index, rows.length - 1)].querySelector<HTMLElement>('button')?.focus();
  }
</script>

{#if entries.length > 0}
  <section class="conflicts" data-testid="conflict-panel" bind:this={panel}>
    <Notice
      tone="attention"
      title={$t('documents.conflict.title', { count: entries.length })}
      body={$t('documents.conflict.body')}
      live
    />
    <ul class="conflicts__list">
      {#each entries as [pointer, conflict] (pointer)}
        <li class="conflict" data-testid="conflict-{pointer}">
          <h3 class="conflict__field">{fieldLabel($messagesStore, category, kind, pointer)}</h3>
          <dl class="conflict__versions">
            <div>
              <dt>{$t('documents.conflict.own')}</dt>
              <dd>{plainValue($messagesStore, category, kind, pointer, conflict.own, $t)}</dd>
            </div>
            <div>
              <dt>{$t('documents.conflict.other', { name: conflict.by.name })}</dt>
              <dd>{plainValue($messagesStore, category, kind, pointer, conflict.other, $t)}</dd>
            </div>
          </dl>
          <div class="conflict__acts">
            <Button
              onclick={() => void decide(pointer, 'own')}
              disabledReason={locked ? $t('documents.conflict.locked') : null}
              data-testid="keep-own-{pointer}"
            >
              {$t('documents.conflict.keep-own')}
            </Button>
            <Button
              onclick={() => void decide(pointer, 'other')}
              disabledReason={locked ? $t('documents.conflict.locked') : null}
              data-testid="take-other-{pointer}"
            >
              {$t('documents.conflict.take-other', { name: conflict.by.name })}
            </Button>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .conflicts {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-block-end: var(--space-8);
  }

  .conflicts__list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    list-style: none;
  }

  .conflict {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-attention);
    border-radius: var(--radius-md);
    background-color: var(--color-attention-subtle);
  }

  .conflict__field {
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
  }

  .conflict__versions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--space-3);
  }

  .conflict__versions dt {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
  }

  .conflict__versions dd {
    font-family: var(--font-serif);
    font-size: var(--text-base);
    overflow-wrap: anywhere;
  }

  .conflict__acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
