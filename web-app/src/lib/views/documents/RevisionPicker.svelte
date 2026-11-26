<script lang="ts">
  import Link from '../../components/Link.svelte';
  import Select, { type SelectOption } from '../../components/Select.svelte';
  import type { Revision, RevisionAt } from '../../api/types';
  import { revisionKind } from '../../documents/history';
  import { formatDateTime } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { formatAddress } from '../../routes';

  /**
   * The earlier states of a document (UC-DOC-2): a choice among the releases and the saves, which reads the document as it
   * was then at `?at=`. The current state is the empty choice; an earlier one comes with a link back.
   */
  interface Props {
    /** The category id. */
    category: string;
    /** The document id. */
    document: string;
    /** The revisions, newest first; `null` while loading or when they could not be listed. */
    revisions: Revision[] | null;
    /** Whether the server holds more revisions than the list. */
    truncated?: boolean;
    /** Whether listing them failed. */
    failed?: boolean;
    /** What the open read says about its revision; `null` for the current state. */
    reading: RevisionAt | null;
    /** Opens an address inside the app. */
    onnavigate: (href: string) => void;
  }

  let {
    category,
    document: id,
    revisions,
    truncated = false,
    failed = false,
    reading,
    onnavigate,
  }: Props = $props();

  /** @returns the address of the document as it was at a revision, or the current state for none */
  function addressOf(ref: string | null): string {
    return formatAddress({
      route: 'categories.document',
      params: { category, document: id },
      ...(ref ? { query: { at: ref } } : {}),
    });
  }

  /** @returns the line that tells a revision apart: what it was, by whom, when */
  function describe(what: string, name: string, at: string): string {
    return $t('documents.revision.option', {
      what,
      name,
      when: formatDateTime(at, $currentLocale),
    });
  }

  let options: SelectOption[] = $derived.by(() => {
    const listed: SelectOption[] = (revisions ?? []).map((revision) => ({
      value: revision.ref,
      label: describe(revisionKind(revision, $t), revision.by.name, revision.at),
    }));
    // A revision the list does not hold (an address typed by hand) stays a choice, so the picker never shows another.
    if (reading && !listed.some((option) => option.value === reading.ref)) {
      listed.unshift({
        value: reading.ref,
        label: describe(revisionKind(reading, $t), reading.by.name, reading.at),
      });
    }
    return listed;
  });
</script>

<div class="revisions" data-testid="revision-picker">
  {#if failed}
    <p class="revisions__note">{$t('documents.revision.failed')}</p>
  {:else if revisions !== null || reading}
    <Select
      label={$t('documents.revision.label')}
      placeholder={$t('documents.revision.current')}
      value={reading?.ref ?? ''}
      {options}
      onchange={(ref) => onnavigate(addressOf(ref || null))}
      testId="revision-select"
    />
    {#if truncated}
      <p class="revisions__note">{$t('documents.revision.truncated')}</p>
    {/if}
    {#if reading}
      <Link href={addressOf(null)} data-testid="revision-back">
        {$t('documents.revision.back')}
      </Link>
    {/if}
  {/if}
</div>

<style>
  .revisions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .revisions :global(.field) {
    align-self: stretch;
  }

  .revisions__note {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }

  @media (max-width: 599px) {
    .revisions :global(a.link) {
      display: inline-flex;
      align-items: center;
      min-block-size: 44px;
    }
  }
</style>
