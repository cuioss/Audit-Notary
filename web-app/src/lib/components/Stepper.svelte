<script lang="ts">
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  /** One step of a stepper. */
  export interface StepperStep {
    /** A stable id of the step. */
    id: string;
    /** The title of the step. */
    title: string;
  }

  /**
   * The steps of a guided form (the recipe of a threat model): a numbered list in which the step the person is on says so
   * with `aria-current="step"` and the steps already reached carry a check and are acts that go back to them. A step not
   * yet reached is plain text, so the way forward is the sheet's own act and never a jump. On a phone only the current step
   * and the count ("Step 2 of 4") stay, so the list never takes the room of the form.
   *
   * It holds nothing: the caller decides which step is current and which are reached.
   */
  interface Props {
    /** The accessible name of the list. */
    label: string;
    /** The steps in order. */
    steps: StepperStep[];
    /** The position of the current step. */
    current: number;
    /** The position of the furthest step the person has reached; those up to it can be gone back to. */
    furthest: number;
    /** The count of the current step, as the phone shows it ("Step 2 of 4"). */
    count: string;
    /** What a screen reader hears after a step that is done, so that a check is never the only sign. */
    doneLabel: string;
    /** Called with the position of a reached step the person chose. */
    onselect: (position: number) => void;
    /** A test id; the steps are `<testId>-<position>`. */
    testId?: string;
  }

  let { label, steps, current, furthest, count, doneLabel, onselect, testId }: Props = $props();
</script>

<nav class="stepper" aria-label={label} data-testid={testId}>
  <p class="stepper__count" data-testid={testId ? `${testId}-count` : undefined}>{count}</p>
  <ol class="stepper__list">
    {#each steps as step, position (step.id)}
      {@const done = position < current || (position !== current && position <= furthest)}
      <li
        class="stepper__step"
        class:stepper__step--current={position === current}
        class:stepper__step--done={done}
        aria-current={position === current ? 'step' : undefined}
        data-testid={testId ? `${testId}-${position}` : undefined}
      >
        <span class="stepper__marker" aria-hidden="true">
          {#if done}
            <Icon name="state.check" size={16} />
          {:else}
            {position + 1}
          {/if}
        </span>
        {#if position !== current && position <= furthest}
          <Button variant="ghost" onclick={() => onselect(position)}>
            {step.title}<span class="sr-only"> {doneLabel}</span>
          </Button>
        {:else}
          <span class="stepper__title">{step.title}</span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>

<style>
  .stepper__count {
    display: none;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .stepper__list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
    list-style: none;
    padding-block-end: var(--space-3);
    border-block-end: 1px solid var(--color-border);
  }

  .stepper__step {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 36px;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .stepper__step--done {
    color: var(--color-text-secondary);
  }

  /* A step already reached is an act, set like the plain ones beside it. */
  .stepper__step :global(.btn) {
    min-block-size: 36px;
    padding-inline: 0;
    color: inherit;
  }

  .stepper__step--current {
    color: var(--color-text-primary);
    font-weight: var(--weight-semibold);
  }

  .stepper__marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 24px;
    block-size: 24px;
    flex: 0 0 auto;
    font-size: var(--text-xs);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-full);
  }

  .stepper__step--done .stepper__marker {
    color: var(--color-text-secondary);
  }

  .stepper__step--current .stepper__marker {
    color: var(--color-on-brand);
    background-color: var(--color-brand);
    border-color: var(--color-brand);
  }

  .stepper__step--current .stepper__title {
    border-block-end: 2px solid var(--color-brand);
  }

  @media (forced-colors: active) {
    .stepper__step--current .stepper__marker {
      forced-color-adjust: none;
      color: HighlightText;
      background-color: Highlight;
      border-color: Highlight;
    }
  }

  /* A phone shows the count and the current step only; the sheet's own acts go back and forth. */
  @media (max-width: 767px) {
    .stepper__count {
      display: block;
      margin-block-end: var(--space-2);
    }

    .stepper__list {
      padding-block-end: var(--space-2);
    }

    .stepper__step:not(.stepper__step--current) {
      display: none;
    }
  }
</style>
