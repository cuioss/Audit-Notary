<script lang="ts">
  import { t } from '../i18n';
  import { sanitizeHtml, type SafeNode } from './sanitize';
  import SafeNodes from './SafeNodes.svelte';
  import { exceedsRenderLimit, useFormServices } from './services';

  /**
   * The server's rendering of an AsciiDoc source (AUN-WEB-4, AsciiDoc Preview). It asks no sooner than `delay` ms after
   * the last change and drops the answer of a request that a later one has overtaken. The answer is cut down to the
   * allow-list and drawn with elements of the app; nothing is inserted as markup.
   *
   * A source that is too large or an unavailable renderer costs the preview only: the view says that no preview is
   * shown. Where the text is read and not edited (`fallback`), the source is shown as preformatted text with the note
   * that it is not rendered, so that what is read is never lost.
   */
  interface Props {
    /** The AsciiDoc source. */
    source: string;
    /** The pause after the last change before the server is asked, in milliseconds. */
    delay?: number;
    /** Whether the source stands in for a preview that cannot be had. */
    fallback?: boolean;
    /** A test id. */
    testId?: string;
  }

  let { source, delay = 0, fallback = false, testId }: Props = $props();

  const services = useFormServices();

  let nodes: SafeNode[] = $state([]);
  let outcome: 'idle' | 'rendering' | 'shown' | 'too-large' | 'unavailable' = $state('idle');
  let latest = 0;

  $effect(() => {
    const text = source;
    const ticket = (latest += 1);
    if (text.trim() === '') {
      nodes = [];
      outcome = 'idle';
      return;
    }
    if (exceedsRenderLimit(text)) {
      nodes = [];
      outcome = 'too-large';
      return;
    }
    outcome = 'rendering';
    const timer = setTimeout(() => {
      void services.render(text).then((answer) => {
        // A later source has been asked since: its answer is the one that counts.
        if (ticket !== latest) return;
        if (answer.state === 'html') {
          nodes = sanitizeHtml(answer.html);
          outcome = 'shown';
        } else {
          nodes = [];
          outcome = answer.state;
        }
      });
    }, delay);
    return () => clearTimeout(timer);
  });
</script>

<div class="asciidoc" data-testid={testId} data-outcome={outcome}>
  {#if outcome === 'shown'}
    <div class="asciidoc__rendered"><SafeNodes {nodes} /></div>
  {:else if outcome === 'too-large' || outcome === 'unavailable'}
    <p class="asciidoc__note">
      {#if fallback}
        {$t('form.preview.not-rendered')}
      {:else}
        {outcome === 'too-large' ? $t('form.preview.too-large') : $t('form.preview.unavailable')}
      {/if}
    </p>
    {#if fallback}
      <pre class="asciidoc__source">{source}</pre>
    {/if}
  {/if}
</div>

<style>
  .asciidoc__note {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .asciidoc__source {
    margin: var(--space-2) 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .asciidoc__rendered {
    font-family: var(--font-serif);
    font-size: var(--text-md);
    line-height: var(--line-height-md);
    overflow-wrap: anywhere;
  }

  .asciidoc__rendered :global(h2),
  .asciidoc__rendered :global(h3),
  .asciidoc__rendered :global(h4),
  .asciidoc__rendered :global(h5),
  .asciidoc__rendered :global(h6) {
    margin: var(--space-4) 0 var(--space-2);
    font-weight: var(--weight-semibold);
    line-height: var(--line-height-lg);
  }

  .asciidoc__rendered :global(h2) {
    font-size: var(--text-xl);
  }

  .asciidoc__rendered :global(h3) {
    font-size: var(--text-lg);
  }

  .asciidoc__rendered :global(p),
  .asciidoc__rendered :global(ul),
  .asciidoc__rendered :global(ol),
  .asciidoc__rendered :global(dl),
  .asciidoc__rendered :global(blockquote),
  .asciidoc__rendered :global(pre),
  .asciidoc__rendered :global(table) {
    margin: 0 0 var(--space-3);
  }

  .asciidoc__rendered :global(ul),
  .asciidoc__rendered :global(ol) {
    padding-inline-start: var(--space-6);
  }

  .asciidoc__rendered :global(code),
  .asciidoc__rendered :global(pre) {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .asciidoc__rendered :global(pre) {
    padding: var(--space-3);
    background-color: var(--color-bg-subtle);
    overflow-x: auto;
  }

  .asciidoc__rendered :global(blockquote) {
    padding-inline-start: var(--space-4);
    border-inline-start: 2px solid var(--color-border-strong);
    color: var(--color-text-secondary);
  }

  .asciidoc__rendered :global(table) {
    border-collapse: collapse;
  }

  .asciidoc__rendered :global(th),
  .asciidoc__rendered :global(td) {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    text-align: start;
  }
</style>
