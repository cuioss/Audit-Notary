<script lang="ts" module>
  import type { StatusTone } from './StatusLabel.svelte';

  /** One tab of the stages of a staged document, with its words. */
  export interface StageTab {
    /** The id of the stage. */
    id: string;
    /** The name of the stage. */
    label: string;
    /** The status: a stage that does not apply stays a tab, greyed, so its kept data can still be read. */
    status: 'open' | 'completed' | 'not-applicable';
    /** The word of the status. */
    statusLabel: string;
    /** The condition of a stage that does not apply, or the open question; `null` for none. */
    note: string | null;
    /** The marker of a stage that was signed off before an earlier stage was reopened; `null` for none. */
    marker: string | null;
    /** A mark that needs the person on the tab, such as an undecided conflict; `null` for none. */
    flag: string | null;
  }

  /** @returns the tone of the dot of a status */
  export function toneOf(status: StageTab['status']): StatusTone {
    return status === 'completed' ? 'success' : status === 'open' ? 'running' : 'neutral';
  }
</script>

<script lang="ts">
  import ReasonBadge from './ReasonBadge.svelte';
  import StatusLabel from './StatusLabel.svelte';

  /**
   * The stages of a staged document as tabs (doc/concepts/staged-documents.adoc, In the Web App): one tab for each
   * stage, in the order of the declaration, each with the status of the stage in words. A stage that does not apply
   * stays a tab, greyed, with the condition under which it applies; one that was signed off before an earlier stage was
   * reopened carries a marker. The tabs are a row that wraps and, on a phone, a list of full-width rows.
   *
   * The tabs follow the pattern of the WAI-ARIA tab list: one tab is in the tab order, the arrow keys, `Home` and `End`
   * move the focus, and the stage is chosen with `Enter` or `Space`; the panel it controls is the caller's, named by
   * `panel`.
   */
  interface Props {
    /** The accessible name of the list of tabs. */
    label: string;
    /** The tabs, in order. */
    tabs: StageTab[];
    /** The id of the selected stage. */
    selected: string;
    /** The id of the element the tabs control. */
    panel: string;
    /** Called with the id of the stage the person chose. */
    onselect: (id: string) => void;
    /** A test id; the tabs are `<testId>-<stage>`. */
    testId?: string;
  }

  let { label, tabs, selected, panel, onselect, testId }: Props = $props();

  let list: HTMLElement | undefined = $state();

  /** Moves the focus along the tabs with the arrow keys; the selection stays where it is until the person chooses. */
  function move(event: KeyboardEvent) {
    const buttons = [...(list?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
    const at = buttons.indexOf(event.target as HTMLElement);
    if (at < 0) return;
    let next = at;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (at + 1) % buttons.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (at - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next].focus();
  }
</script>

<div
  class="stage-tabs"
  role="tablist"
  aria-label={label}
  tabindex="-1"
  bind:this={list}
  onkeydown={move}
  data-testid={testId}
>
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      class="stage-tab"
      class:stage-tab--selected={tab.id === selected}
      class:stage-tab--na={tab.status === 'not-applicable'}
      role="tab"
      id="stage-tab-{tab.id}"
      aria-selected={tab.id === selected}
      aria-controls={panel}
      tabindex={tab.id === selected ? 0 : -1}
      onclick={() => onselect(tab.id)}
      data-testid={testId ? `${testId}-${tab.id}` : undefined}
      data-status={tab.status}
    >
      <span class="stage-tab__name">{tab.label}</span>
      <StatusLabel tone={toneOf(tab.status)} label={tab.statusLabel} />
      {#if tab.flag}
        <ReasonBadge tone="attention" label={tab.flag} />
      {/if}
      {#if tab.marker}
        <span class="stage-tab__note stage-tab__marker">{tab.marker}</span>
      {/if}
      {#if tab.note}
        <span class="stage-tab__note">{tab.note}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .stage-tabs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0;
  }

  .stage-tab {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    min-block-size: 44px;
    /* A long word of a long language (Datenschutzbewertung) breaks at its syllables, at worst anywhere, never over its neighbour. */
    min-inline-size: 0;
    overflow-wrap: anywhere;
    hyphens: auto;
    padding: var(--space-3) var(--space-4);
    font: inherit;
    text-align: start;
    color: var(--color-text-primary);
    background: none;
    border: none;
    border-block-end: 1px solid var(--color-border);
    border-inline-end: 1px solid var(--color-border);
    cursor: pointer;
  }

  .stage-tab:hover {
    background-color: var(--color-bg-subtle);
  }

  .stage-tab:focus-visible {
    outline: 2px solid transparent;
    box-shadow: var(--focus-ring);
    position: relative;
  }

  /* The tabs wrap into rows: each one carries its own hairline, and the chosen one a heavier line in the ink. */
  .stage-tab--selected {
    border-block-end: 3px solid var(--color-brand);
    background-color: var(--color-bg-subtle);
  }

  .stage-tab__name {
    font-family: var(--font-serif);
    font-size: var(--text-md);
    line-height: var(--line-height-md);
    font-weight: var(--weight-semibold);
  }

  /* A stage that does not apply is greyed, its condition stands under its name in words. */
  .stage-tab--na .stage-tab__name {
    color: var(--color-text-muted);
    font-weight: var(--weight-regular);
  }

  .stage-tab__note {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }

  .stage-tab__marker {
    color: var(--color-attention-text);
  }

  @media (forced-colors: active) {
    .stage-tab--selected {
      border-block-end-color: Highlight;
    }
  }

  /* A phone stands the tabs as rows, one under the other, so no tab is cut off and each one is a target of 44 px. */
  @media (max-width: 767px) {
    .stage-tabs {
      grid-template-columns: minmax(0, 1fr);
    }

    .stage-tab {
      inline-size: 100%;
      border-inline-end: none;
      border-block-end: 1px solid var(--color-border);
      border-inline-start: 3px solid transparent;
    }

    .stage-tab--selected {
      border-block-end: 1px solid var(--color-border);
      border-inline-start-color: var(--color-brand);
    }

    @media (forced-colors: active) {
      .stage-tab--selected {
        border-inline-start-color: Highlight;
      }
    }
  }
</style>
