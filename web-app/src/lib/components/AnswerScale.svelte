<script lang="ts" module>
  /** One answer of the scale: its value in the model and its text. */
  export interface ScaleOption {
    value: number;
    text: string;
  }
</script>

<script lang="ts">
  import { uniqueId } from './uniqueId';

  /**
   * The answer of one SAMM question: the model's answers as one row of choices, from "No" to the fullest answer.
   * Native radio buttons, so the arrow keys move between the answers and a screen reader names the group by its
   * question. Each choice shows how much of the answer it is as a small gauge, so the row reads as a scale at a
   * glance; the text says it. With `hints`, the number key that picks the answer stands in its corner.
   */
  interface Props {
    /** The id of the element that names the group, the question's text. */
    labelledby: string;
    /** The model's answers, lowest first. */
    options: ScaleOption[];
    /** The chosen value, or `null` while unanswered. */
    value: number | null;
    /** Called with the chosen value. */
    onchange: (value: number) => void;
    /** Whether the answer can be changed. */
    readonly?: boolean;
    /** Whether the number keys are shown. */
    hints?: boolean;
    /** A test id prefix; each answer gets `<testId>-<index>`. */
    testId?: string;
  }

  let {
    labelledby,
    options,
    value,
    onchange,
    readonly = false,
    hints = false,
    testId,
  }: Props = $props();

  const name = uniqueId('answer');
  const max = $derived(Math.max(...options.map((option) => option.value), 1));
</script>

<div class="scale-frame">
  <div
    class="scale"
    class:scale--readonly={readonly}
    role="radiogroup"
    aria-labelledby={labelledby}
    aria-readonly={readonly ? 'true' : undefined}
    data-testid={testId}
  >
    {#each options as option, index (option.value)}
      <label class="scale__option" class:scale__option--chosen={option.value === value}>
        <input
          class="sr-only"
          type="radio"
          {name}
          value={option.value}
          checked={option.value === value}
          disabled={readonly && option.value !== value}
          onchange={() => {
            if (!readonly) onchange(option.value);
          }}
          data-testid={testId ? `${testId}-${index}` : undefined}
        />
        <span class="scale__gauge" aria-hidden="true">
          <span class="scale__gauge-fill" style:--gauge={`${(option.value / max) * 100}%`}></span>
        </span>
        <span class="scale__text">{option.text}</span>
        {#if hints && !readonly}
          <kbd class="scale__key" aria-hidden="true">{index + 1}</kbd>
        {/if}
      </label>
    {/each}
  </div>
</div>

<style>
  .scale-frame {
    container-type: inline-size;
  }

  .scale {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .scale__option {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-block-size: 64px;
    padding: var(--space-2) var(--space-3) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background-color: var(--color-bg-surface);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: var(--line-height-sm);
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }

  .scale__option:hover {
    border-color: var(--color-border-field);
    color: var(--color-text-primary);
  }

  .scale__option--chosen,
  .scale__option--chosen:hover {
    border-color: var(--color-brand);
    background-color: var(--color-brand-subtle);
    color: var(--color-text-primary);
    box-shadow: inset 0 0 0 1px var(--color-brand);
  }

  .scale__option:has(input:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  .scale--readonly .scale__option {
    cursor: default;
  }

  .scale--readonly .scale__option:not(.scale__option--chosen) {
    opacity: 0.55;
  }

  .scale__gauge {
    position: relative;
    display: block;
    inline-size: 100%;
    block-size: 4px;
    border-radius: var(--radius-full);
    background-color: var(--color-bg-sunken);
    overflow: hidden;
  }

  .scale__gauge-fill {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    inline-size: var(--gauge);
    background-color: var(--color-text-muted);
  }

  .scale__option--chosen .scale__gauge-fill {
    background-color: var(--color-brand);
  }

  .scale__key {
    position: absolute;
    inset-block-start: var(--space-2);
    inset-inline-end: var(--space-2);
    min-inline-size: 18px;
    padding: 0 4px;
    border: 1px solid var(--color-border-strong);
    border-radius: 4px;
    background-color: var(--color-bg-subtle);
    color: var(--color-text-muted);
    font-family: var(--font-sans);
    font-size: 11px;
    line-height: 16px;
    text-align: center;
  }

  .scale__text {
    padding-inline-end: var(--space-5);
  }

  /* A touch screen has no number keys to hint at. */
  @media (hover: none) and (pointer: coarse) {
    .scale__key {
      display: none;
    }

    .scale__text {
      padding-inline-end: 0;
    }
  }

  @container (max-width: 540px) {
    .scale {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (forced-colors: active) {
    .scale__option--chosen {
      outline: 3px solid Highlight;
    }

    .scale__gauge-fill {
      background-color: CanvasText;
    }
  }
</style>
