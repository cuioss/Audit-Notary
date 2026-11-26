<script lang="ts">
  import TextArea from '../components/TextArea.svelte';
  import { t } from '../i18n';
  import AsciiDocView from './AsciiDocView.svelte';

  /**
   * A text area for AsciiDoc source and the server's preview of it (AUN-WEB-4, AsciiDoc Preview). The value is the
   * source as a string; the rendered HTML is never stored. The preview follows the source no sooner than 500 ms after
   * the last change.
   */
  interface Props {
    /** The label. */
    label: string;
    /** The source. */
    value?: string;
    /** The field error. */
    error?: string | null;
    /** The word that says the field is mandatory. */
    mark?: string;
    /** The lines of help, the hint of a free text included. */
    hint?: string | string[];
    /** Called with the new source, or `undefined` when the field was emptied. */
    onchange: (next: string | undefined) => void;
    /** A test id. */
    testId?: string;
  }

  let { label, value, error = null, mark, hint, onchange, testId }: Props = $props();

  /** The pause after the last change before the preview is asked for, in milliseconds. */
  const PREVIEW_DELAY_MS = 500;

  let source = $derived(typeof value === 'string' ? value : '');
</script>

<TextArea
  {label}
  value={source}
  {hint}
  {mark}
  {error}
  rows={8}
  oninput={(next) => onchange(next === '' ? undefined : next)}
  {testId}
>
  {#snippet after()}
    {#if source.trim() !== ''}
      <section class="preview" aria-label={$t('form.preview.title')}>
        <p class="preview__title">{$t('form.preview.title')}</p>
        <AsciiDocView
          {source}
          delay={PREVIEW_DELAY_MS}
          testId={testId ? `${testId}-preview` : undefined}
        />
      </section>
    {/if}
  {/snippet}
</TextArea>

<style>
  .preview {
    margin-block-start: var(--space-2);
    padding-inline-start: var(--space-4);
    border-inline-start: 1px solid var(--color-border-strong);
  }

  .preview__title {
    margin: 0 0 var(--space-1);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
  }
</style>
