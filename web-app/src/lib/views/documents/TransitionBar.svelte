<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import type { Action, DocumentTransition } from '../../api/types';
  import { transitionName } from '../../documents/categories';
  import { messagesStore, t } from '../../i18n';

  /**
   * The steps a document's workflow offers in its current state (UC-DOC-6): the transitions the read lists, as acts. The
   * release is the transition marked `release`; it opens the release address and reads "Release" in every case, any
   * other step reads the category's own text. A step acts on the saved document, so with unsaved changes the bar asks to
   * save first; a refusal for empty mandatory fields lists them, each as a way to the field.
   */
  interface Props {
    /** The category id, for the texts of the steps. */
    category: string;
    /** The transitions the document offers now. */
    transitions: DocumentTransition[];
    /** The actions the user may take on the document's repository. */
    rights: Action[];
    /** The address of the release. */
    releaseHref: string;
    /** The id of the step that is running, `null` for none. */
    busy: string | null;
    /** Whether the steps carry the primary look: no save is waiting for the person. */
    primary: boolean;
    /** The step waiting for the changes to be saved first, `null` for none. */
    askSave: DocumentTransition | null;
    /** The empty mandatory fields of the refused step, with their labels. */
    missing: { pointer: string; label: string }[];
    /** The person takes a step. */
    onact: (transition: DocumentTransition) => void;
    /** The person saves, then takes the step. */
    onsavefirst: () => void;
    /** The person goes to a missing field. */
    ongo: (pointer: string) => void;
    /** The person goes back to editing: the list of missing fields closes and the first one is shown. */
    onback: () => void;
  }

  let {
    category,
    transitions,
    rights,
    releaseHref,
    busy,
    primary,
    askSave,
    missing,
    onact,
    onsavefirst,
    ongo,
    onback,
  }: Props = $props();

  /** @returns the words of a step: "Release" for the release, the category's own text for the others */
  function actOf(transition: DocumentTransition): string {
    return transition.release
      ? $t('release.act')
      : transitionName($messagesStore, category, transition.id);
  }

  /** @returns why the person cannot take the step, `null` when they can */
  function reasonOf(transition: DocumentTransition): string | null {
    return rights.includes(transition.right)
      ? null
      : $t('documents.transition.no-right', { right: transition.right });
  }
</script>

{#if transitions.length > 0 || askSave || missing.length > 0}
  <div class="bar" data-testid="transition-bar">
    {#if transitions.length > 0}
      <div class="bar__acts">
        {#each transitions as transition (transition.id)}
          {#if transition.release && reasonOf(transition) === null}
            <Link
              href={releaseHref}
              look={primary ? 'primary' : 'secondary'}
              data-testid="transition-{transition.id}"
            >
              {actOf(transition)}
            </Link>
          {:else}
            <Button
              variant={primary ? 'primary' : 'secondary'}
              icon={transition.release ? 'act.stamp' : 'act.next'}
              busy={busy === transition.id}
              onclick={() => onact(transition)}
              disabledReason={reasonOf(transition)}
              data-testid="transition-{transition.id}"
            >
              {actOf(transition)}
            </Button>
          {/if}
        {/each}
      </div>
    {/if}
    {#if askSave}
      <Notice
        tone="attention"
        title={$t('documents.transition.save-first.title')}
        body={$t('documents.transition.save-first.body')}
        live
      >
        {#snippet actions()}
          <Button variant="primary" icon="act.save" onclick={onsavefirst} data-testid="save-first">
            {$t('documents.transition.save-first.act', { act: actOf(askSave) })}
          </Button>
        {/snippet}
      </Notice>
    {/if}
    {#if missing.length > 0}
      <Notice
        tone="attention"
        title={$t('documents.missing.title')}
        body={$t('documents.missing.body')}
        live
        stacked
      >
        {#snippet actions()}
          <div class="missing__acts">
            <ul class="missing" data-testid="missing-fields">
              {#each missing as field (field.pointer)}
                <li>
                  <Button onclick={() => ongo(field.pointer)}>
                    {$t('documents.missing.go', { field: field.label })}
                  </Button>
                </li>
              {/each}
            </ul>
            <Button onclick={onback} data-testid="back-to-editing">
              {$t('documents.missing.back')}
            </Button>
          </div>
        {/snippet}
      </Notice>
    {/if}
  </div>
{/if}

<style>
  .bar {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-block-end: var(--space-8);
  }

  .bar__acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .missing__acts {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .missing {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    list-style: none;
  }
</style>
