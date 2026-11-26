<script lang="ts">
  import TextField from '../components/TextField.svelte';
  import ResolvedValue from './ResolvedValue.svelte';
  import { isGdrLink } from './validate';

  /**
   * A text field for a reference to a document, `<alias>:<kind>/<id>` with an optional `#<fragment>` (AUN-WEB-4, The
   * Pickers; PROVISIONAL). It resolves what it holds and shows the title of the target and, when the target has a
   * canonical address, a link to it, or the mark *not found*. A reference into a repository the user may not read is
   * reported as not found as well (AUN-DP-2).
   */
  interface Props {
    /** The label. */
    label: string;
    /** The held reference, or nothing. */
    value?: string;
    /** The field error. */
    error?: string | null;
    /** The word that says the field is mandatory. */
    mark?: string;
    /** The lines of help. */
    hint?: string | string[];
    /** Called with the new reference, or `undefined` when the field was emptied. */
    onchange: (next: string | undefined) => void;
    /** A test id. */
    testId?: string;
  }

  let { label, value, error = null, mark, hint, onchange, testId }: Props = $props();

  /** The pause after the last typed letter before the reference is resolved. */
  const RESOLVE_DELAY_MS = 400;

  let text = $state('');
  let settled = $state('');
  $effect(() => {
    text = typeof value === 'string' ? value : '';
  });
  $effect(() => {
    const typed = text.trim();
    const timer = setTimeout(() => (settled = typed), settled === '' ? 0 : RESOLVE_DELAY_MS);
    return () => clearTimeout(timer);
  });
</script>

<TextField
  {label}
  value={text}
  {error}
  {mark}
  {hint}
  oninput={(next) => {
    text = next;
    onchange(next === '' ? undefined : next);
  }}
  {testId}
>
  {#snippet after()}
    {#if settled !== '' && isGdrLink(settled)}
      <ResolvedValue kind="docref" value={settled} />
    {/if}
  {/snippet}
</TextField>
