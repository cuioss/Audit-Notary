<script lang="ts">
  import { uniqueId } from './uniqueId';

  /** One choice of the group. */
  export interface Choice {
    value: string;
    label: string;
  }

  /**
   * A small set of exclusive choices shown at once (radio buttons), such as the theme.
   */
  interface Props {
    /** The legend. */
    legend: string;
    /** The choices. */
    choices: Choice[];
    /** The chosen value. */
    value: string;
    /** Called with the chosen value. */
    onchange: (value: string) => void;
    /** A test id prefix; each choice gets `<testId>-<value>`. */
    testId?: string;
  }

  let { legend, choices, value, onchange, testId }: Props = $props();

  const name = uniqueId('choice');
</script>

<fieldset class="choices">
  <legend class="choices__legend">{legend}</legend>
  <div class="choices__options">
    {#each choices as choice (choice.value)}
      <label class="choices__option" class:choices__option--chosen={choice.value === value}>
        <input
          type="radio"
          {name}
          value={choice.value}
          checked={choice.value === value}
          onchange={() => onchange(choice.value)}
          data-testid={testId ? `${testId}-${choice.value}` : undefined}
        />
        <span>{choice.label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .choices {
    border: none;
  }

  .choices__legend {
    font-weight: var(--weight-medium);
    margin-block-end: var(--space-2);
  }

  .choices__options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .choices__option {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--control-height);
    padding: 0 var(--space-3);
    border: 1px solid var(--control-border);
    border-radius: var(--control-radius);
    cursor: pointer;
  }

  .choices__option--chosen {
    border-color: var(--color-brand);
    background-color: var(--color-brand-subtle);
  }

  .choices__option input {
    accent-color: var(--color-brand);
  }
</style>
