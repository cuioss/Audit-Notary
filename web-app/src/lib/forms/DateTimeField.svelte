<script lang="ts">
  import Chip from '../components/Chip.svelte';
  import TextField from '../components/TextField.svelte';
  import { t } from '../i18n';
  import { instantToLocalInput, localInputToInstant } from './dateTime';

  /**
   * A date and a time, or a date alone (AUN-WEB-4, Values). A `date-time` is stored as an RFC 3339 instant in UTC to
   * the second (`2026-11-24T09:30:00Z`), and shown and entered in the time zone of the browser; a value the person did
   * not touch is stored back unchanged, whatever its offset. A `date` is stored as `YYYY-MM-DD` and is not converted.
   * A held value that is no date shows empty, with the text as it is stored beside it.
   */
  interface Props {
    /** The label. */
    label: string;
    /** `date-time`, or `date` for the date-only mode. */
    format: 'date-time' | 'date';
    /** The held value, or nothing. */
    value?: unknown;
    /** The field error. */
    error?: string | null;
    /** The word that says the field is mandatory. */
    mark?: string;
    /** The lines of help. */
    hint?: string | string[];
    /** Called with the new value, or `undefined` when the field was emptied. */
    onchange: (next: string | undefined) => void;
    /** A test id. */
    testId?: string;
  }

  let { label, format, value, error = null, mark, hint, onchange, testId }: Props = $props();

  let held = $derived(typeof value === 'string' ? value : '');
  let shown = $derived(
    format === 'date'
      ? /^\d{4}-\d{2}-\d{2}$/.test(held)
        ? held
        : ''
      : (instantToLocalInput(held) ?? ''),
  );
  let unreadable = $derived(value !== undefined && value !== null && value !== '' && shown === '');

  /**
   * @param typed the value of the input
   * @param input the input itself
   */
  function handle(typed: string, input: HTMLInputElement): void {
    if (typed === '') {
      // A half-typed entry reads as empty; clearing the value then would wipe what the person is typing.
      if (!input.validity.badInput) onchange(undefined);
    } else if (format === 'date') {
      onchange(typed);
    } else {
      // The input drops zero seconds (`09:30` for `09:30:00`): compare the instants, not the texts. A value that
      // stays as it was is not rewritten, so its offset stays the document's.
      const instant = localInputToInstant(typed);
      if (instant !== null && instant !== localInputToInstant(shown)) onchange(instant);
    }
  }
</script>

<TextField
  {label}
  type={format === 'date' ? 'date' : 'datetime-local'}
  step={format === 'date' ? undefined : '1'}
  value={shown}
  {error}
  {mark}
  {hint}
  oninput={handle}
  {testId}
>
  {#snippet after()}
    {#if unreadable}
      <span class="stored">{$t('form.date.as-stored')} <Chip value={String(value)} /></span>
    {/if}
  {/snippet}
</TextField>

<style>
  .stored {
    color: var(--color-text-muted);
  }
</style>
