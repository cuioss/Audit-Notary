<script lang="ts">
  import Select, { type SelectOption } from '../../components/Select.svelte';
  import TextField from '../../components/TextField.svelte';
  import type { SammModel, SammTarget } from '../../api/types';
  import { errorKey } from '../../forms/fieldErrors';
  import { isDate } from '../../forms/validate';
  import { formatDate } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { formatScore } from '../../samm/scores';
  import {
    parseTarget,
    targetOptions,
    targetText,
    withTarget,
    type TargetErrors,
  } from '../../samm/targets';

  /**
   * The targets of a scope, practice by practice, grouped by business function (UC-SAMM-1, AUN-SAMM-6): the maturity a
   * practice should reach, 0 to 3 in steps of 0.5, and optionally the day by which it should be reached. A practice
   * without a target has none, and no gap against it; choosing "no target" removes the entry and its day. Read, the same
   * table shows the values as text.
   *
   * The editor holds nothing: it reports the whole map of the targets with every change.
   */
  interface Props {
    /** The model whose practices are listed. */
    model: SammModel;
    /** The targets as they stand. */
    targets: Record<string, SammTarget>;
    /** Called with the targets after a change. */
    onchange?: (targets: Record<string, SammTarget>) => void;
    /** Whether the table shows its values and offers no control. */
    readonly?: boolean;
    /** The codes of the errors of a refusal, per practice and field. */
    errors?: TargetErrors;
    /** A test id prefix. */
    testId?: string;
  }

  let {
    model,
    targets,
    onchange,
    readonly = false,
    errors = {},
    testId = 'targets',
  }: Props = $props();

  let steps = $derived(targetOptions($currentLocale));

  /** @returns the options of the target of a practice: the steps, and the held value when it is none of them */
  function optionsOf(entry: SammTarget | undefined): SelectOption[] {
    const held = targetText(entry);
    return held === '' || steps.some((step) => step.value === held)
      ? steps
      : [{ value: held, label: formatScore(Number(held), $currentLocale) }, ...steps];
  }

  /**
   * @param practice a practice id
   * @param field a field of its target
   * @returns the text of the error of the field, or `null`
   */
  function errorOf(practice: string, field: 'target' | 'due'): string | null {
    const code = errors[practice]?.[field] ?? errors[practice]?.entry;
    return code ? $t(errorKey(code)) : null;
  }

  function setTarget(practice: string, text: string) {
    onchange?.(withTarget(targets, practice, parseTarget(text), targets[practice]?.due));
  }

  function setDue(practice: string, typed: string, input: HTMLInputElement) {
    const entry = targets[practice];
    if (!entry) return;
    // A half-typed date reads as empty; clearing the day then would wipe what the person is typing.
    if (typed === '' && input.validity.badInput) return;
    if (typed !== '' && !isDate(typed)) return;
    onchange?.(withTarget(targets, practice, entry.target, typed));
  }
</script>

<div class="targets" data-testid={testId}>
  {#each model.functions as fn (fn.id)}
    <section class="group" aria-labelledby="{testId}-{fn.id}">
      <h3 class="group__title" id="{testId}-{fn.id}">{fn.name}</h3>
      <p class="head" aria-hidden="true">
        <span></span>
        <span>{$t('samm.target')}</span>
        <span>{$t('samm.target.due')}</span>
      </p>
      <ul class="rows" aria-label={$t('samm.targets.caption', { name: fn.name })}>
        {#each fn.practices as practice (practice.id)}
          {@const entry = targets[practice.id]}
          <li class="row" data-practice={practice.id}>
            <span class="row__name">{practice.name}</span>
            <span class="row__cell">
              <span class="row__cap" aria-hidden="true">{$t('samm.target')}</span>
              {#if readonly}
                <span class="row__value"
                  >{entry ? formatScore(entry.target, $currentLocale) : '–'}</span
                >
              {:else}
                <Select
                  label={$t('samm.targets.of', { name: practice.name })}
                  labelHidden
                  options={optionsOf(entry)}
                  value={targetText(entry)}
                  placeholder={$t('samm.targets.none')}
                  error={errorOf(practice.id, 'target')}
                  onchange={(text) => setTarget(practice.id, text)}
                  testId="{testId}-{practice.id}-target"
                />
              {/if}
            </span>
            <span class="row__cell">
              <span class="row__cap" aria-hidden="true">{$t('samm.target.due')}</span>
              {#if readonly}
                <span class="row__value"
                  >{entry?.due ? formatDate(entry.due, $currentLocale) : '–'}</span
                >
              {:else if entry}
                <TextField
                  label={$t('samm.targets.due-of', { name: practice.name })}
                  labelHidden
                  type="date"
                  value={entry.due ?? ''}
                  error={errorOf(practice.id, 'due')}
                  oninput={(typed, input) => setDue(practice.id, typed, input)}
                  testId="{testId}-{practice.id}-due"
                />
              {:else}
                <span class="row__value">–</span>
              {/if}
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  .targets {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-inline-size: 44rem;
  }

  .group {
    container-type: inline-size;
  }

  .group__title {
    margin-block-end: var(--space-1);
    font-size: var(--text-sm);
    line-height: var(--line-height-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  .head,
  .row {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) 7rem 10rem;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }

  .head {
    padding-block-end: var(--space-1);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    border-block-end: 1px solid var(--color-border-strong);
  }

  .rows {
    list-style: none;
  }

  .row {
    padding-block: var(--space-2);
    border-block-end: 1px solid var(--color-border);
  }

  .row__name {
    font-weight: var(--weight-medium);
  }

  .row__cell {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }

  .row__cap {
    display: none;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .row__value {
    font-feature-settings: 'tnum' 1;
  }

  /* Narrow: the head goes, each cell names itself, the name stands over the two cells. */
  @container (max-width: 27rem) {
    .head {
      display: none;
    }

    .row {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .row__name {
      grid-column: 1 / -1;
    }

    .row__cap {
      display: block;
    }
  }
</style>
