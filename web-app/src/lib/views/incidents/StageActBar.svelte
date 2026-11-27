<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import type { IncidentStage } from '../../api/types';
  import { fieldLabel } from '../../documents/categories';
  import {
    INCIDENT_CATEGORY,
    incidentAddress,
    partKind,
    splitPointer,
  } from '../../incidents/model';
  import type { StageRefusal } from '../../incidents/stageActs.svelte';
  import { messagesStore, t } from '../../i18n';

  /**
   * The act of one stage (UC-IR-1, UC-IR-3): *Complete stage* signs off a stage that is open, *Reopen stage* takes the sign-off
   * back. A step acts on the saved part, so with changes only the person has the bar asks to save first; a refusal lists the
   * mandatory fields that are empty, each as a way to the field, and the stages that must be completed before. The act is
   * disabled with its reason while a stage before is open, and a stage that asks for the confirmation says so beside it.
   */
  interface Props {
    /** The stage. */
    stage: IncidentStage;
    /** The name of every stage, by id, for the stages that come first. */
    names: Record<string, string>;
    /** The address parts of the incident, for the links to the stages that come first. */
    year: number;
    incident: string;
    /** Whether the person may complete and reopen: the right `edit` on a document that is not frozen or a revision. */
    mayAct: boolean;
    /** Whether the stage's part has changes that only the person has. */
    unsaved: boolean;
    /** Whether the stage's part has conflicts to decide, which no step may be taken over. */
    undecided: boolean;
    /** Whether the request of this stage is running. */
    busy: boolean;
    /** Whether a request of another stage is running. */
    waiting: boolean;
    /** Whether the bar waits for the save that comes first. */
    askSave: boolean;
    /** The refusal of the last completion of this stage, `null` for none. */
    refusal: StageRefusal | null;
    /** The line that tells the person confirms their identity once more, `null` when the stage asks for nothing. */
    stepUpLine: string | null;
    /** Whether the act carries the primary look: no save is waiting for the person. */
    primary: boolean;
    /** The person takes the act. */
    onact: () => void;
    /** The person saves, then takes the act. */
    onsavefirst: () => void;
    /** The person goes to a missing field (a pointer into the document's value). */
    ongo: (pointer: string) => void;
    /** The person goes back to editing: the refusal closes. */
    onback: () => void;
  }

  let {
    stage,
    names,
    year,
    incident,
    mayAct,
    unsaved,
    undecided,
    busy,
    waiting,
    askSave,
    refusal,
    stepUpLine,
    primary,
    onact,
    onsavefirst,
    ongo,
    onback,
  }: Props = $props();

  let completed = $derived(stage.status === 'completed');
  let act = $derived(completed ? $t('incidents.stage.reopen') : $t('incidents.stage.complete'));

  /** @returns why the act cannot be taken now, `null` when it can */
  let reason = $derived.by(() => {
    if (completed) return waiting ? $t('incidents.stage.reason.running') : null;
    if (stage.blockedBy.length > 0) {
      return $t('incidents.stage.reason.blocked', {
        stages: stage.blockedBy.map((id) => names[id] ?? id).join(', '),
      });
    }
    if (undecided) return $t('incidents.stage.reason.conflict');
    return waiting ? $t('incidents.stage.reason.running') : null;
  });
</script>

{#if mayAct && stage.status !== 'not-applicable'}
  <div class="bar" data-testid="stage-bar">
    <div class="bar__act">
      <Button
        variant={completed || !primary ? 'secondary' : 'primary'}
        icon={completed ? 'act.reopen' : 'state.check'}
        {busy}
        onclick={onact}
        disabledReason={reason}
        data-testid={completed ? 'stage-reopen' : 'stage-complete'}
      >
        {act}
      </Button>
      {#if stepUpLine && !completed}
        <p class="bar__note" data-testid="stage-step-up-note">{stepUpLine}</p>
      {/if}
    </div>
    {#if askSave && unsaved}
      <Notice
        tone="attention"
        title={$t('documents.transition.save-first.title')}
        body={$t('documents.transition.save-first.body')}
        live
      >
        {#snippet actions()}
          <Button
            variant="primary"
            icon="act.save"
            onclick={onsavefirst}
            data-testid="stage-save-first"
          >
            {$t('documents.transition.save-first.act', { act })}
          </Button>
        {/snippet}
      </Notice>
    {/if}
    {#if refusal && refusal.stage === stage.id}
      <Notice
        tone="attention"
        title={$t('incidents.stage.refused.title', { stage: names[stage.id] ?? stage.id })}
        body={$t('incidents.stage.refused.body')}
        live
        stacked
      >
        {#snippet actions()}
          <div class="refusal" data-testid="stage-refusal">
            {#if refusal.open.length > 0}
              <ul class="refusal__list" data-testid="stage-open-before">
                {#each refusal.open as id (id)}
                  <li>
                    <Link href={incidentAddress(year, incident, { stage: id })}>
                      {$t('incidents.stage.refused.open', { stage: names[id] ?? id })}
                    </Link>
                  </li>
                {/each}
              </ul>
            {/if}
            {#if refusal.missing.length > 0}
              <ul class="refusal__list" data-testid="missing-fields">
                {#each refusal.missing as pointer (pointer)}
                  <li>
                    <Button onclick={() => ongo(pointer)}>
                      {$t('documents.missing.go', {
                        field: fieldLabel(
                          $messagesStore,
                          INCIDENT_CATEGORY,
                          partKind(splitPointer(pointer).part),
                          splitPointer(pointer).pointer,
                        ),
                      })}
                    </Button>
                  </li>
                {/each}
              </ul>
            {/if}
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
    padding-block-start: var(--space-4);
    border-block-start: 1px solid var(--color-border);
  }

  .bar__act {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .bar__act :global(.btn-with-reason) {
    align-items: flex-start;
  }

  .bar__act :global(.btn__reason) {
    text-align: start;
  }

  /* The act of a notice names the stage, so in a long language it can be wider than a phone: it wraps and keeps the notice. */
  .bar :global(.notice__actions) {
    flex: 0 1 auto;
    min-inline-size: 0;
    max-inline-size: 100%;
  }

  .bar :global(.notice__actions .btn) {
    max-inline-size: 100%;
    white-space: normal;
    text-align: start;
  }

  .bar__note {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }

  .refusal {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .refusal__list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    list-style: none;
  }

  @media (max-width: 767px) {
    .refusal__list :global(.link) {
      display: inline-flex;
      align-items: center;
      min-block-size: 44px;
    }
  }
</style>
