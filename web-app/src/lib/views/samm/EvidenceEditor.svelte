<script lang="ts">
  import { tick } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Dialog from '../../components/Dialog.svelte';
  import Link from '../../components/Link.svelte';
  import Select from '../../components/Select.svelte';
  import TextField from '../../components/TextField.svelte';
  import type { SammEvidenceLink, SammQuestion } from '../../api/types';
  import DataTable from '../../forms/DataTable.svelte';
  import { errorKey } from '../../forms/fieldErrors';
  import { t } from '../../i18n';
  import {
    MAX_EVIDENCE,
    MAX_EVIDENCE_TITLE,
    MAX_EVIDENCE_URL,
    isHttpsUrl,
    linkProblem,
    locateLink,
    type EvidenceErrors,
  } from '../../samm/evidence';

  /**
   * The evidence links of a practice (UC-SAMM-3, AUN-SAMM-7): a title and an absolute `https` address, for one question of
   * the practice or for the practice as a whole. Evidence is a link, never a file. A link is edited in a dialog over a
   * copy, so cancelling changes nothing; removing one asks first; the limit of the practice is explained where the act
   * would be, never a dead control. A link the browser would send is checked here; the server's verdict is shown at the
   * link it names. Read, the same table shows the links without an act.
   *
   * The editor holds nothing: it reports the whole list, as the save carries it.
   */
  interface Props {
    /** The links as they stand. */
    links: SammEvidenceLink[];
    /** The questions of the practice, in order. */
    questions: SammQuestion[];
    /** Called with the whole list after a link was added, changed, moved or removed. */
    onchange?: (links: SammEvidenceLink[]) => void;
    /** Whether the table shows the links and offers no act. */
    readonly?: boolean;
    /** What a refusal says about the list and its links. */
    errors?: EvidenceErrors;
    /** A test id prefix. */
    testId?: string;
  }

  let {
    links,
    questions,
    onchange,
    readonly = false,
    errors = { rows: {}, list: null },
    testId = 'evidence',
  }: Props = $props();

  let table: DataTable | undefined = $state();
  /** The link in the editor: its position, or `null` for one to add; `undefined` while the editor is closed. */
  let editing = $state<{ index: number | null } | undefined>();
  /** The link as it stood when the editor opened on it: what the position is checked against before it is applied. */
  let opened: SammEvidenceLink | null = null;
  /** What the dialog says when the list changed or filled up while it was open; the typed values stay. */
  let dialogNote = $state<string | null>(null);
  let editorOpen = $state(false);
  let titleText = $state('');
  let urlText = $state('');
  let questionId = $state('');
  let removing = $state<number | null>(null);
  /** The link as it stood when its removal was asked: what the position is checked against before it goes. */
  let removingLink: SammEvidenceLink | null = null;
  let removeOpen = $state(false);
  let showProblem = $state(false);
  /** Whether the list was reordered or shortened since the server's refusal: its row numbers no longer fit. */
  let rowsStale = $state(false);
  $effect.pre(() => {
    // A new refusal is about the list as it stands.
    void errors;
    rowsStale = false;
  });
  let rows = $derived(rowsStale ? {} : errors.rows);

  let problem = $derived(linkProblem({ title: titleText, url: urlText }));
  let addReason = $derived(
    links.length >= MAX_EVIDENCE ? $t('samm.evidence.max', { count: MAX_EVIDENCE }) : null,
  );
  let rowErrors = $derived(
    Object.entries(rows)
      .map(([row, codes]) => ({
        row: Number(row),
        codes: Object.values(codes).filter((code): code is string => !!code),
      }))
      .filter((entry) => entry.codes.length > 0 && entry.row < links.length),
  );

  /** @returns the text of the question a link belongs to, or the practice as a whole */
  function aboutOf(link: SammEvidenceLink): string {
    if (link.question === null) return $t('samm.evidence.practice');
    return questions.find((question) => question.id === link.question)?.text ?? link.question;
  }

  /** @param code the code of an error @param member the field it is about @returns its text */
  function textOf(code: string, member: 'title' | 'url' | 'question' | 'link'): string {
    if (member === 'url' && code === 'PATTERN') return $t('samm.evidence.url.https');
    return $t(errorKey(code));
  }

  /** @returns the error of the field of the link being edited that the server named, or the browser's advice */
  function fieldError(member: 'title' | 'url'): string | null {
    const index = editing?.index;
    const server = index === null || index === undefined ? undefined : rows[index]?.[member];
    if (server) return textOf(server, member);
    if (!showProblem) return null;
    if (member === 'title' && titleText.trim() === '') return $t('form.error.required');
    if (member === 'title' && titleText.trim().length > MAX_EVIDENCE_TITLE)
      return $t('form.error.max-length');
    if (member === 'url' && urlText.trim() === '') return $t('form.error.required');
    if (member === 'url' && !isHttpsUrl(urlText.trim())) return $t('samm.evidence.url.https');
    return null;
  }

  function openEditor(index: number | null) {
    const held = index === null ? undefined : links[index];
    titleText = held?.title ?? '';
    urlText = held?.url ?? '';
    questionId = held?.question ?? '';
    showProblem = false;
    dialogNote = null;
    opened = held ? { ...held } : null;
    editing = { index };
    editorOpen = true;
  }

  function apply() {
    if (problem !== null) {
      showProblem = true;
      return;
    }
    const link: SammEvidenceLink = {
      question: questionId === '' ? null : questionId,
      title: titleText.trim(),
      url: urlText.trim(),
    };
    let index = editing?.index ?? null;
    // The list may have been replaced by a newer one while the dialog was open (live refresh): the position it was
    // opened with is checked against the list as it stands now, and the typed values stay.
    if (index !== null && opened !== null) {
      const found = locateLink(links, opened, index);
      if (found !== index) {
        if (found < 0) {
          // The link is gone or was changed by someone else: applying would add what is typed as a new link.
          editing = { index: null };
          opened = null;
        } else {
          editing = { index: found };
        }
        dialogNote = $t('samm.evidence.stale');
        return;
      }
    }
    if (index === null && links.length >= MAX_EVIDENCE) {
      dialogNote = $t('samm.evidence.max', { count: MAX_EVIDENCE });
      return;
    }
    index = editing?.index ?? null;
    onchange?.(
      index === null
        ? [...links, link]
        : links.map((held, position) => (position === index ? link : held)),
    );
    editorOpen = false;
  }

  function move(row: number, direction: -1 | 1) {
    const target = row + direction;
    if (target < 0 || target >= links.length) return;
    const next = [...links];
    [next[row], next[target]] = [next[target], next[row]];
    rowsStale = true;
    onchange?.(next);
  }

  async function remove() {
    const asked = removing;
    const confirmed = removingLink;
    removeOpen = false;
    removing = null;
    removingLink = null;
    if (asked === null) return;
    // The link that was confirmed is the one that goes, wherever a newer list holds it now; one that is gone stays gone.
    const index = confirmed === null ? asked : locateLink(links, confirmed, asked);
    if (index < 0 || index >= links.length) return;
    rowsStale = true;
    onchange?.(links.filter((_, position) => position !== index));
    await tick();
    await table?.focusRow(index);
  }
</script>

<div class="evidence" data-testid={testId}>
  <DataTable
    bind:this={table}
    caption={$t('samm.evidence.caption')}
    columns={[
      { key: 'title', label: $t('samm.evidence.title') },
      { key: 'url', label: $t('samm.evidence.url') },
      { key: 'about', label: $t('samm.evidence.about') },
    ]}
    rowCount={links.length}
    {readonly}
    empty={$t('samm.evidence.empty')}
    flagged={(row) => Object.keys(rows[row] ?? {}).length > 0}
    addDisabledReason={addReason}
    note={errors.list ? textOf(errors.list, 'link') : null}
    onadd={() => openEditor(null)}
    onedit={(row) => openEditor(row)}
    onremove={(row) => {
      removing = row;
      removingLink = links[row] ? { ...links[row] } : null;
      removeOpen = true;
    }}
    onmove={move}
    testId="{testId}-table"
  >
    {#snippet cell(row, column)}
      {@const link = links[row]}
      {#if column === 0}
        {link.title}
      {:else if column === 1}
        <!-- Only an absolute https address becomes a link: the server's text is data, never a way out of the page. -->
        {#if isHttpsUrl(link.url)}
          <Link href={link.url} rel="noopener noreferrer" target="_blank">{link.url}</Link>
        {:else}
          {link.url}
        {/if}
      {:else}
        {aboutOf(link)}
      {/if}
    {/snippet}
  </DataTable>

  {#if rowErrors.length > 0}
    <ul class="errors" data-testid="{testId}-errors">
      {#each rowErrors as entry (entry.row)}
        <li>
          {$t('samm.evidence.error.row', {
            number: entry.row + 1,
            problems: Object.entries(rows[entry.row] ?? {})
              .map(([member, code]) =>
                textOf(code ?? '', member as 'title' | 'url' | 'question' | 'link'),
              )
              .join(' '),
          })}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<Dialog
  bind:open={editorOpen}
  title={editing?.index === null ? $t('samm.evidence.add.title') : $t('samm.evidence.edit.title')}
  closeLabel={$t('common.close')}
>
  <div class="editor">
    <TextField
      label={$t('samm.evidence.title')}
      mark={$t('form.required')}
      bind:value={titleText}
      error={fieldError('title')}
      testId="{testId}-field-title"
    />
    <TextField
      label={$t('samm.evidence.url')}
      mark={$t('form.required')}
      hint={$t('samm.evidence.url.hint', { max: MAX_EVIDENCE_URL })}
      bind:value={urlText}
      error={fieldError('url')}
      testId="{testId}-field-url"
    />
    <Select
      label={$t('samm.evidence.about')}
      options={questions.map((question) => ({ value: question.id, label: question.text }))}
      bind:value={questionId}
      placeholder={$t('samm.evidence.practice')}
      testId="{testId}-field-question"
    />
    {#if dialogNote}
      <p class="note" role="alert" data-testid="{testId}-dialog-note">{dialogNote}</p>
    {/if}
    <div class="acts">
      <Button onclick={() => (editorOpen = false)} data-testid="{testId}-cancel">
        {$t('common.cancel')}
      </Button>
      <Button variant="primary" onclick={apply} data-testid="{testId}-apply">
        {$t('form.table.editor.apply')}
      </Button>
    </div>
  </div>
</Dialog>

<Dialog
  bind:open={removeOpen}
  title={$t('samm.evidence.remove.title')}
  closeLabel={$t('common.close')}
  onclose={() => (removing = null)}
>
  <p>
    {$t('samm.evidence.remove.body', {
      title: removing === null ? '' : (links[removing]?.title ?? ''),
    })}
  </p>
  <div class="acts">
    <Button onclick={() => (removeOpen = false)} data-testid="{testId}-remove-cancel">
      {$t('common.cancel')}
    </Button>
    <Button variant="danger" onclick={() => void remove()} data-testid="{testId}-remove-confirm">
      {$t('form.table.remove')}
    </Button>
  </div>
</Dialog>

<style>
  .evidence {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .errors {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    list-style: none;
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  .note {
    color: var(--color-danger);
    font-size: var(--text-sm);
  }

  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* Phone: an address in a row is a target of 44 px, however many lines it takes. */
  @media (max-width: 599px) {
    .evidence :global(a.link) {
      display: inline-flex;
      align-items: center;
      min-block-size: 44px;
      overflow-wrap: anywhere;
    }
  }

  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-block-start: var(--space-4);
  }
</style>
