<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import AnswerScale from '../../components/AnswerScale.svelte';
  import Button from '../../components/Button.svelte';
  import Disclosure from '../../components/Disclosure.svelte';
  import HistoryList from '../../components/HistoryList.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import SaveState, { type SaveStateKind } from '../../components/SaveState.svelte';
  import ScoreMeter from '../../components/ScoreMeter.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import TextArea from '../../components/TextArea.svelte';
  import Toggle from '../../components/Toggle.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError } from '../../api/errors';
  import type {
    ConflictField,
    SammAssessment,
    SammModel,
    SammQuestion,
    SammScope,
  } from '../../api/types';
  import { formatTime } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { historyEntries } from '../../samm/history';
  import { findPractice, formatScore, practiceScore, practicesInOrder } from '../../samm/scores';
  import { session } from '../../stores/app';
  import { now } from '../../stores/clock';
  import { stateTone } from './workflow';

  /**
   * One practice as the workshop's sheet (UC-SAMM-3, AUN-SAMM-3, AUN-WEB-5): its two streams, three questions each,
   * level by level, every question with the model's answers as a scale, the quality criteria behind "What counts as
   * yes" and an optional comment.
   *
   * Built for the speed of a discussion: the number keys 1 to 4 answer the question in focus, J and K move between
   * questions, and the scores follow every answer. A change is kept as the person's draft within seconds ("saved for
   * you"); "Save for everyone" writes one signed commit with the blob id the sheet loaded. A conflict shows each
   * differing question with both answers, and the person decides. A save by another assessor refreshes the answers
   * nobody changed here, and says who saved.
   */
  interface Props {
    scope: SammScope | null;
    assessment: SammAssessment | null;
    model: SammModel | null;
    practiceId: string;
    /** Called after a save for everyone, so the view reads the assessment again. */
    onsaved?: () => void;
  }

  let { scope, assessment, model, practiceId, onsaved }: Props = $props();

  /** How long after the last change the draft is kept: well inside the 5 seconds of AUN-WEB-5. */
  const DRAFT_DELAY_MS = 1200;
  const HINTS_KEY = 'audit_notary_key_hints';

  interface Edit {
    answer?: number | null;
    comment?: string;
  }

  let edits: Record<string, Edit> = $state({});
  /** Answers saved for everyone that the loaded assessment does not show yet, by the blob they replaced. */
  let committed: { blob: string; answers: Record<string, Edit> } | null = $state(null);
  let saveState: SaveStateKind = $state('clean');
  let stamp = $state('');
  let failure = $state<string | null>(null);
  let conflicts: Record<string, ConflictField> = $state({});
  let conflictBlob = $state('');
  let announcement = $state('');
  let changedBy: Record<string, string> = $state({});
  let hints = $state(readHints());
  let draftTimer: ReturnType<typeof setTimeout> | null = null;
  let questionElements: HTMLElement[] = $state([]);
  let active = $state(0);

  let entry = $derived(model ? findPractice(model, practiceId) : null);
  let practice = $derived(entry?.practice ?? null);
  let questions: SammQuestion[] = $derived(
    practice?.streams.flatMap((stream) => stream.questions) ?? [],
  );
  let loaded = $derived(assessment?.answers[practiceId] ?? {});
  let rights = $derived(
    $session?.rights.find((right) => right.repository === 'samm-assessments')?.actions ?? [],
  );
  let readonly = $derived(
    !assessment || assessment.state === 'released' || !rights.includes('edit'),
  );
  let target = $derived(scope?.targets[practiceId]?.target ?? null);
  let dirty = $derived(Object.keys(edits).length > 0);

  function readHints(): boolean {
    try {
      return localStorage.getItem(HINTS_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  function setHints(value: boolean) {
    hints = value;
    try {
      localStorage.setItem(HINTS_KEY, value ? 'on' : 'off');
    } catch {
      // Storage refused: the choice holds for this visit.
    }
  }

  /** The answer a question shows: the own change, else what was saved for everyone, else what was loaded. */
  function answerOf(id: string): number | null {
    if (edits[id]?.answer !== undefined) return edits[id].answer ?? null;
    if (committed?.answers[id]?.answer !== undefined) return committed.answers[id].answer ?? null;
    return loaded[id]?.answer ?? null;
  }

  function commentOf(id: string): string {
    return edits[id]?.comment ?? committed?.answers[id]?.comment ?? loaded[id]?.comment ?? '';
  }

  let shown = $derived.by(() => {
    const answers: Record<string, { answer: number | null }> = {};
    for (const question of questions) answers[question.id] = { answer: answerOf(question.id) };
    return answers;
  });
  let score = $derived(practice ? practiceScore({ [practiceId]: shown }, practice) : null);

  // Another practice: a fresh sheet.
  // The work on the sheet belongs to one practice of one assessment. When either changes, unsaved changes are kept
  // as the draft of the document they were made on, and the sheet starts fresh.
  let owner = { document: '', practice: '', blob: '' };
  $effect(() => {
    const document = assessment?.id ?? '';
    if (document === owner.document && practiceId === owner.practice) return;
    untrack(() => {
      const pending: Record<string, Edit> = $state.snapshot(edits);
      if (owner.document && Object.keys(pending).length > 0) {
        void apiClient
          .saveDraft(
            'samm-assessments',
            owner.document,
            requestFor(owner.practice, pending, owner.blob),
          )
          .catch(() => {});
      }
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = null;
    });
    owner = {
      document,
      practice: practiceId,
      blob: untrack(() => assessment?.parts[practiceId]?.blob ?? ''),
    };
    edits = {};
    committed = null;
    conflicts = {};
    failure = null;
    changedBy = {};
    active = 0;
    saveState = 'clean';
  });

  // A new version of this practice's file: once the server shows what was saved here, the overlay goes; a save by
  // someone else is said, and the questions it changed are marked.
  let lastBlob = '';
  $effect(() => {
    const part = assessment?.parts[practiceId];
    const blob = part?.blob ?? '';
    if (blob === lastBlob) return;
    const first = lastBlob === '';
    lastBlob = blob;
    if (committed && committed.blob !== blob) committed = null;
    if (first || !part || part.savedBy.pseudonym === $session?.user.pseudonym) return;
    const marks: Record<string, string> = {};
    for (const question of questions) {
      if (edits[question.id] === undefined) marks[question.id] = part.savedBy.name;
    }
    changedBy = marks;
    announcement = $t('practice.saved-by-other', {
      name: part.savedBy.name,
      practice: practice?.name ?? practiceId,
    });
  });

  function change(id: string, edit: Edit) {
    if (readonly) return;
    edits = { ...edits, [id]: { ...edits[id], ...edit } };
    failure = null;
    // While a save for everyone runs, it stays the state: the act stays busy, and the save keeps this change for
    // the next one when it returns.
    if (saveState === 'saving') return;
    saveState = 'changed';
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => void keepDraft(), DRAFT_DELAY_MS);
  }

  /**
   * @param part the practice
   * @param pending its changes
   * @param blob the version of its file the changes are based on
   * @returns the body of a draft or a save
   */
  function requestFor(part: string, pending: Record<string, Edit>, blob: string) {
    const fields: Record<string, unknown> = {};
    for (const [id, edit] of Object.entries(pending)) {
      if (edit.answer !== undefined) fields[`${id}/answer`] = edit.answer;
      if (edit.comment !== undefined) fields[`${id}/comment`] = edit.comment;
    }
    return { parts: { [part]: { blob, fields } } };
  }

  function partRequest() {
    const blob = conflictBlob || assessment?.parts[practiceId]?.blob || '';
    return requestFor(practiceId, edits, blob);
  }

  async function keepDraft() {
    draftTimer = null;
    if (!assessment || !dirty) return;
    saveState = 'drafting';
    try {
      const answer = await apiClient.saveDraft('samm-assessments', assessment.id, partRequest());
      if (saveState === 'drafting') {
        saveState = 'draft';
        stamp = formatTime(answer.at ? new Date(answer.at) : new Date(), $currentLocale);
      }
    } catch (error) {
      // A save for everyone started meanwhile keeps its own state.
      if (saveState === 'drafting') {
        saveState = 'failed';
        failure = errorMessageKey(error);
      }
    }
  }

  /**
   * @param current the changes now
   * @param sent the changes a save sent
   * @returns the changes the save did not carry: fields changed since, or never sent
   */
  function withoutSent(
    current: Record<string, Edit>,
    sent: Record<string, Edit>,
  ): Record<string, Edit> {
    const rest: Record<string, Edit> = {};
    for (const [id, edit] of Object.entries(current)) {
      const left: Edit = {};
      if (edit.answer !== undefined && edit.answer !== sent[id]?.answer) left.answer = edit.answer;
      if (edit.comment !== undefined && edit.comment !== sent[id]?.comment)
        left.comment = edit.comment;
      if (Object.keys(left).length > 0) rest[id] = left;
    }
    return rest;
  }

  async function saveForEveryone() {
    if (!assessment || !dirty) return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = null;
    saveState = 'saving';
    failure = null;
    // What this save sends; changes made while it runs stay in `edits` and are kept and saved later.
    const sent: Record<string, Edit> = $state.snapshot(edits);
    const request = partRequest();
    // The version this save is based on: until the server shows a newer one, the sent answers stand on the sheet.
    const base = request.parts[practiceId].blob;
    try {
      const answer = await apiClient.saveDocument('samm-assessments', assessment.id, request);
      const merged: Record<string, Edit> = { ...committed?.answers };
      for (const [id, edit] of Object.entries(sent)) merged[id] = { ...merged[id], ...edit };
      // A newer version that arrived meanwhile already shows the save, or will with the next read.
      committed =
        (assessment?.parts[practiceId]?.blob ?? '') === base
          ? { blob: base, answers: merged }
          : null;
      edits = withoutSent(edits, sent);
      conflicts = {};
      conflictBlob = '';
      saveState = Object.keys(edits).length > 0 ? 'changed' : 'saved';
      stamp = formatTime(answer.at ? new Date(answer.at) : new Date(), $currentLocale);
      if (saveState === 'changed') draftTimer = setTimeout(() => void keepDraft(), DRAFT_DELAY_MS);
      onsaved?.();
    } catch (error) {
      if (isApiError(error) && error.outcome === 'CONFLICT') {
        const part = (
          error.details.conflicts as { part: string; blob: string; fields: ConflictField[] }[]
        )?.find((entry) => entry.part === practiceId);
        // Keyed by question and field: `<question>` for the answer, `<question>/comment` for the comment.
        const found: Record<string, ConflictField> = {};
        for (const field of part?.fields ?? []) {
          const segments = field.pointer.split('/');
          const id = segments.at(-2) ?? '';
          found[segments.at(-1) === 'comment' ? `${id}/comment` : id] = field;
        }
        conflicts = found;
        conflictBlob = part?.blob ?? '';
        saveState = 'conflict';
      } else {
        saveState = 'failed';
        failure = errorMessageKey(error);
        // The changes are still the person's: they are kept as a draft again.
        if (draftTimer) clearTimeout(draftTimer);
        draftTimer = setTimeout(() => void keepDraft(), DRAFT_DELAY_MS);
      }
    }
  }

  /**
   * Decides one conflict: keeps the own value, or takes the other into the field it belongs to.
   *
   * @param key `<question>` for the answer, `<question>/comment` for the comment
   * @param keep which value stays
   */
  function resolve(key: string, keep: 'own' | 'other') {
    const field = conflicts[key];
    if (!field) return;
    const [id, name] = key.split('/');
    if (keep === 'other') {
      const value: Edit =
        name === 'comment'
          ? { comment: typeof field.other === 'string' ? field.other : '' }
          : { answer: typeof field.other === 'number' ? field.other : null };
      edits = { ...edits, [id]: { ...edits[id], ...value } };
    }
    const rest = { ...conflicts };
    delete rest[key];
    conflicts = rest;
  }

  /** The conflicts of one question: its answer first, then its comment. */
  function conflictsOf(
    id: string,
  ): { key: string; field: 'answer' | 'comment'; conflict: ConflictField }[] {
    return [
      { key: id, field: 'answer' as const, conflict: conflicts[id] },
      { key: `${id}/comment`, field: 'comment' as const, conflict: conflicts[`${id}/comment`] },
    ].filter(
      (entry): entry is { key: string; field: 'answer' | 'comment'; conflict: ConflictField } =>
        Boolean(entry.conflict),
    );
  }

  let open = $derived(Object.keys(conflicts).length);

  function answerText(question: SammQuestion, value: unknown): string {
    return (
      question.answers.find((option) => option.value === value)?.text ?? $t('practice.unanswered')
    );
  }

  let saveLabel = $derived.by(() => {
    switch (saveState) {
      case 'changed':
        return $t('save.changed');
      case 'drafting':
        return $t('save.drafting');
      case 'draft':
        return $t('save.draft', { time: stamp });
      case 'saving':
        return $t('save.saving');
      case 'saved':
        return $t('save.saved', { time: stamp });
      case 'conflict':
        return $t('save.conflict', { count: open });
      case 'failed':
        return $t('save.failed');
      default:
        return readonly
          ? assessment?.state === 'released'
            ? $t('save.read-only.released')
            : $t('save.read-only.right')
          : $t('save.clean');
    }
  });

  function handleKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (!target || !questionElements[0]?.closest('[data-practice-sheet]')?.contains(target)) return;
    if (target.closest('textarea, input[type="text"], [contenteditable]')) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const question = questions[active];
    if (/^[1-4]$/.test(event.key) && question && !readonly) {
      const option = question.answers[Number(event.key) - 1];
      if (option) {
        event.preventDefault();
        change(question.id, { answer: option.value });
      }
    } else if (event.key === 'j' || event.key === 'k') {
      event.preventDefault();
      const next = Math.max(
        0,
        Math.min(questions.length - 1, active + (event.key === 'j' ? 1 : -1)),
      );
      active = next;
      const element = questionElements[next];
      const radio =
        element?.querySelector<HTMLInputElement>('input[type="radio"]:checked') ??
        element?.querySelector<HTMLInputElement>('input[type="radio"]');
      radio?.focus();
      element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  let order = $derived(model ? practicesInOrder(model) : []);
  let position = $derived(order.findIndex((item) => item.practice.id === practiceId));
  let previous = $derived(position > 0 ? order[position - 1].practice : null);
  let next = $derived(
    position >= 0 && position < order.length - 1 ? order[position + 1].practice : null,
  );
  let base = $derived(scope && assessment ? `/samm/${scope.id}/${assessment.slug}` : '');

  // Closing the sheet keeps every unsaved change as a draft, whether or not a draft timer is still running.
  onDestroy(() => {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = null;
    if (dirty) void keepDraft();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if !assessment || !model || !practice || !entry || !score}
  <Sheet><p class="muted">{$t('common.loading')}</p></Sheet>
{:else}
  <Sheet testId="practice-sheet" marginLabel={$t('sheet.margin')}>
    <div data-practice-sheet>
      <SheetHead
        kind="practice"
        kindLabel={$t('kind.practice-of', { fn: entry.fn.name })}
        title={practice.name}
        lede={practice.description}
        size="title"
        facts={[
          { term: $t('samm.fact.assessment'), value: assessment.title },
          {
            term: $t('samm.fact.answered'),
            value: $t('samm.answered', { count: score.answered, total: score.questions }),
          },
        ]}
      >
        {#snippet state()}
          <StatusLabel
            tone={stateTone(assessment.state)}
            label={$t(`workflow.${assessment.state}`)}
          />
        {/snippet}
      </SheetHead>

      {#if failure}
        <div class="notice"><Notice tone="danger" title={$t(failure)} live /></div>
      {/if}
      {#if open > 0}
        <div class="notice">
          <Notice
            tone="attention"
            title={$t('practice.conflict.title', { count: open })}
            body={$t('practice.conflict.body')}
            live
          />
        </div>
      {/if}

      {#each practice.streams as stream (stream.letter)}
        <section class="stream" aria-labelledby="stream-{stream.letter}">
          <header class="stream__head">
            <h2 class="stream__title" id="stream-{stream.letter}">
              <span class="stream__letter">{$t('practice.stream', { letter: stream.letter })}</span>
              {stream.name}
            </h2>
            <ScoreMeter
              value={score.streams[stream.letter === 'B' ? 1 : 0]}
              text={formatScore(score.streams[stream.letter === 'B' ? 1 : 0], $currentLocale)}
              label={$t('practice.stream-score', {
                letter: stream.letter,
                score: formatScore(score.streams[stream.letter === 'B' ? 1 : 0], $currentLocale),
              })}
            />
          </header>
          <ol class="questions">
            {#each stream.questions as question (question.id)}
              {@const index = questions.indexOf(question)}
              {@const questionConflicts = conflictsOf(question.id)}
              <li
                class="question"
                class:question--active={active === index}
                class:question--conflict={questionConflicts.length > 0}
                bind:this={questionElements[index]}
                onfocusin={() => (active = index)}
                data-question={question.id}
              >
                <span class="question__level" aria-hidden="true">{question.level}</span>
                <div class="question__body">
                  <p class="question__activity">
                    {$t('practice.level', { level: question.level })}
                    <span class="question__activity-name">{question.activity}</span>
                  </p>
                  <p class="question__text" id="q-{question.id}">{question.text}</p>
                  {#if changedBy[question.id] && loaded[question.id]}
                    <p class="question__changed">
                      {$t('practice.changed-by', { name: changedBy[question.id] })}
                    </p>
                  {/if}
                  <AnswerScale
                    labelledby="q-{question.id}"
                    options={question.answers}
                    value={answerOf(question.id)}
                    onchange={(value) => change(question.id, { answer: value })}
                    {readonly}
                    hints={hints && active === index}
                    testId="answer-{question.id}"
                  />
                  {#each questionConflicts as { key, field, conflict } (key)}
                    <div class="conflict" data-testid="conflict-{key.replace('/', '-')}">
                      <p class="conflict__text">
                        {$t(
                          field === 'comment'
                            ? 'practice.conflict.comment'
                            : 'practice.conflict.field',
                          {
                            name: conflict.by.name,
                            other:
                              field === 'comment'
                                ? String(conflict.other ?? '')
                                : answerText(question, conflict.other),
                            own:
                              field === 'comment'
                                ? String(conflict.own ?? '')
                                : answerText(question, conflict.own),
                          },
                        )}
                      </p>
                      <div class="conflict__acts">
                        <Button onclick={() => resolve(key, 'own')}>
                          {$t('practice.conflict.keep-own')}
                        </Button>
                        <Button onclick={() => resolve(key, 'other')}>
                          {$t(
                            field === 'comment'
                              ? 'practice.conflict.take-other-comment'
                              : 'practice.conflict.take-other',
                            { name: conflict.by.name },
                          )}
                        </Button>
                      </div>
                    </div>
                  {/each}
                  <div class="question__more">
                    <Disclosure>
                      {#snippet summary()}{$t('practice.quality')}{/snippet}
                      <ul class="quality">
                        {#each question.quality as criterion (criterion)}
                          <li>{criterion}</li>
                        {/each}
                      </ul>
                    </Disclosure>
                    <Disclosure open={commentOf(question.id) !== ''}>
                      {#snippet summary()}{commentOf(question.id) !== ''
                          ? $t('practice.comment')
                          : $t('practice.comment.add')}{/snippet}
                      <TextArea
                        label={$t('practice.comment')}
                        hint={$t('field.free-text.hint')}
                        value={commentOf(question.id)}
                        {readonly}
                        oninput={(value) => change(question.id, { comment: value })}
                        testId="comment-{question.id}"
                      />
                    </Disclosure>
                  </div>
                </div>
              </li>
            {/each}
          </ol>
        </section>
      {/each}

      <nav class="pager" aria-label={$t('practice.pager')}>
        {#if previous}
          <Link href="{base}/{previous.id}" look="secondary"
            >{$t('practice.previous', { name: previous.name })}</Link
          >
        {:else}
          <span></span>
        {/if}
        {#if next}
          <Link href="{base}/{next.id}" look="secondary"
            >{$t('practice.next', { name: next.name })}</Link
          >
        {/if}
      </nav>
    </div>
    <p class="sr-only" role="status" aria-live="polite">{announcement}</p>

    {#snippet status()}
      <div class="status">
        <SaveState
          state={readonly ? 'read-only' : saveState}
          label={saveLabel}
          testId="save-state"
        />
        {#if !readonly}
          <Button
            variant="primary"
            icon="act.save"
            busy={saveState === 'saving'}
            onclick={saveForEveryone}
            disabledReason={open > 0
              ? $t('practice.save.resolve-first', { count: open })
              : dirty
                ? null
                : $t('practice.save.nothing')}
            data-testid="save-everyone"
          >
            {$t('practice.save')}
          </Button>
        {/if}
      </div>
    {/snippet}

    {#snippet margin()}
      <div class="margin">
        {#if !readonly}
          <p class="margin__note">{$t('practice.save.note')}</p>
        {/if}
        <section class="margin__block">
          <h2 class="margin__title">{$t('practice.score')}</h2>
          <p class="margin__figure">
            {formatScore(score.score, $currentLocale)}<span class="margin__scale"> / 3</span>
          </p>
          <ScoreMeter
            value={score.score}
            {target}
            tone={target !== null && score.score < target ? 'attention' : 'ink'}
            text={target === null
              ? ''
              : $t('samm.target.short', { target: formatScore(target, $currentLocale) })}
            label={target === null
              ? $t('samm.score.of', { score: formatScore(score.score, $currentLocale) })
              : $t('samm.score.of-target', {
                  score: formatScore(score.score, $currentLocale),
                  target: formatScore(target, $currentLocale),
                })}
          />
        </section>
        {#if !readonly}
          <section class="margin__block">
            <h2 class="margin__title">{$t('practice.keys')}</h2>
            <p class="margin__note">{$t('practice.keys.body')}</p>
            <Toggle
              label={$t('practice.keys.show')}
              checked={hints}
              onchange={setHints}
              testId="key-hints"
            />
          </section>
        {/if}
        <section class="margin__block">
          <h2 class="margin__title">{$t('sheet.history')}</h2>
          <HistoryList
            entries={historyEntries(
              assessment.history.filter((line) => line.part === practiceId),
              model,
              $t,
              $currentLocale,
              $now,
            )}
            label={$t('sheet.history')}
          />
          {#if !assessment.history.some((line) => line.part === practiceId)}
            <p class="margin__note">{$t('practice.history.none')}</p>
          {/if}
        </section>
      </div>
    {/snippet}
  </Sheet>
{/if}

<style>
  .muted {
    color: var(--color-text-muted);
  }

  .notice {
    margin-block-end: var(--space-6);
  }

  .stream + .stream {
    margin-block-start: var(--space-12);
  }

  .stream__head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2) var(--space-6);
    padding-block-end: var(--space-3);
    margin-block-end: var(--space-2);
    border-block-end: 2px solid var(--color-text-primary);
  }

  .stream__head :global(.meter) {
    inline-size: 12rem;
  }

  .stream__title {
    display: flex;
    flex-direction: column;
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
  }

  .stream__letter {
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
  }

  .questions {
    list-style: none;
  }

  .question {
    position: relative;
    display: grid;
    grid-template-columns: 2.5rem minmax(0, 1fr);
    gap: var(--space-4);
    padding-block: var(--space-6);
    border-block-end: 1px solid var(--color-border);
    scroll-margin-block: 96px;
  }

  .question::before {
    content: '';
    position: absolute;
    inset-block: var(--space-4);
    inset-inline-start: -16px;
    inline-size: 3px;
    border-radius: 2px;
    background-color: transparent;
    transition: background-color var(--duration-fast) var(--ease-standard);
  }

  .question--active::before {
    background-color: var(--color-brand);
  }

  .question--conflict::before {
    background-color: var(--color-attention);
  }

  .question__level {
    font-family: var(--font-serif);
    font-size: var(--text-3xl);
    line-height: 1;
    font-weight: var(--weight-regular);
    color: var(--color-text-muted);
    text-align: center;
    font-feature-settings: 'lnum' 1;
  }

  .question__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-inline-size: 0;
  }

  .question__activity {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
  }

  .question__activity-name {
    margin-inline-start: var(--space-2);
    font-weight: var(--weight-regular);
  }

  .question__text {
    max-inline-size: var(--measure);
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
    color: var(--color-text-primary);
  }

  .question__changed {
    font-size: var(--text-sm);
    color: var(--color-running);
  }

  .question__more {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-6);
  }

  .question__more > :global(*) {
    flex: 1 1 16rem;
  }

  .quality {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-inline-start: var(--space-4);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .conflict {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-attention);
    border-radius: var(--radius-md);
    background-color: var(--color-attention-subtle);
  }

  .conflict__text {
    font-size: var(--text-sm);
  }

  .conflict__acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .pager {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-3);
    margin-block-start: var(--space-10);
  }

  .status {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    align-items: center;
    gap: var(--space-3);
  }

  .status :global(.btn-with-reason) {
    max-inline-size: none;
    align-items: stretch;
  }

  .status :global(.btn) {
    inline-size: 100%;
  }

  .status :global(.btn__reason) {
    text-align: start;
  }

  .margin {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .margin__block {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3);
  }

  .margin__title {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  .margin__note {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }

  .margin__figure {
    font-family: var(--font-serif);
    font-size: var(--text-3xl);
    line-height: var(--line-height-3xl);
    font-weight: var(--weight-semibold);
    font-feature-settings: 'tnum' 1;
  }

  .margin__scale {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--weight-regular);
    color: var(--color-text-muted);
  }

  @media (max-width: 599px) {
    .question {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-2);
    }

    .question__level {
      display: none;
    }
  }
</style>
