<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import AnswerScale from '../../components/AnswerScale.svelte';
  import Button from '../../components/Button.svelte';
  import Disclosure from '../../components/Disclosure.svelte';
  import HistoryList from '../../components/HistoryList.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import SaveState from '../../components/SaveState.svelte';
  import ScoreMeter from '../../components/ScoreMeter.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import TextArea from '../../components/TextArea.svelte';
  import Toggle from '../../components/Toggle.svelte';
  import type {
    ConflictField,
    SammAssessment,
    SammModel,
    SammQuestion,
    SammScope,
  } from '../../api/types';
  import { DocumentController, type DocumentSnapshot } from '../../documents/controller.svelte';
  import { saveLabel } from '../../documents/saveLabel';
  import { currentLocale, t } from '../../i18n';
  import { historyEntries } from '../../samm/history';
  import { SAMM_KEYS } from '../../samm/fieldKeys';
  import { findPractice, formatScore, practiceScore, practicesInOrder } from '../../samm/scores';
  import StepUpDialog from '../../stepup/StepUpDialog.svelte';
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
   *
   * What every document sheet shares (the draft, the save, the conflicts, the step-up, the refresh) is the document
   * controller's; this sheet keeps what is SAMM's: the questions, the scores and the keys.
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

  const HINTS_KEY = 'audit_notary_key_hints';

  let announcement = $state('');
  let changedBy: Record<string, string> = $state({});
  let hints = $state(readHints());
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

  // A save may ask for step-up (UC-ACC-3): the controller's handler decides whether and how. The identity provider keeps
  // nothing of this page, so the changes are kept as the draft before the app leaves, and no edit is accepted from then.
  const controller = new DocumentController({
    repository: 'samm-assessments',
    keys: SAMM_KEYS,
    // A SAMM assessment is released once: `DOCUMENT_RELEASED` means frozen for good.
    releasedOnce: true,
    onsaved: () => onsaved?.(),
    onremote: ({ by, edited }) => {
      // Another assessor saved the practice: the questions nobody changed here are marked, and the change is said.
      const marks: Record<string, string> = {};
      for (const question of questions) {
        if (!edited.has(`${question.id}/answer`) && !edited.has(`${question.id}/comment`)) {
          marks[question.id] = by.name;
        }
      }
      changedBy = marks;
      announcement = $t('practice.saved-by-other', {
        name: by.name,
        practice: practice?.name ?? practiceId,
      });
    },
  });

  /** Whether the controls refuse a change: the sheet is read-only, or the departure for the provider has begun. */
  let locked = $derived(readonly || controller.leaving);
  let target = $derived(scope?.targets[practiceId]?.target ?? null);
  let dirty = $derived(controller.dirty);

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
    return (
      (controller.fieldValue(`${id}/answer`, loaded[id]?.answer ?? null) as number | null) ?? null
    );
  }

  function commentOf(id: string): string {
    return (
      (controller.fieldValue(`${id}/comment`, loaded[id]?.comment) as string | null | undefined) ??
      ''
    );
  }

  let shown = $derived.by(() => {
    const answers: Record<string, { answer: number | null }> = {};
    for (const question of questions) answers[question.id] = { answer: answerOf(question.id) };
    return answers;
  });
  let score = $derived(practice ? practiceScore({ [practiceId]: shown }, practice) : null);

  // The work on the sheet belongs to one practice of one assessment: when either changes, the controller keeps unsaved
  // changes as the draft of the document they were made on and starts fresh. It runs before the sheet is drawn, so the
  // first draw already knows the rights and the loaded version.
  $effect.pre(() => {
    const part = assessment?.parts[practiceId];
    const next: DocumentSnapshot | null = assessment
      ? {
          document: assessment.id,
          part: practiceId,
          blob: part?.blob ?? '',
          savedBy: part?.savedBy ?? null,
          frozen: assessment.state === 'released',
          canEdit: rights.includes('edit'),
        }
      : null;
    untrack(() => controller.sync(next));
  });

  // Another practice: the marks and the question in focus start fresh too.
  let shownFor = '';
  $effect(() => {
    const owner = `${assessment?.id ?? ''}/${practiceId}`;
    if (owner === shownFor) return;
    shownFor = owner;
    changedBy = {};
    active = 0;
  });

  function setAnswer(id: string, value: number | null) {
    if (locked) return;
    controller.change(`${id}/answer`, value);
  }

  function setComment(id: string, text: string) {
    if (locked) return;
    controller.change(`${id}/comment`, text);
  }

  /** The conflicts of one question: its answer first, then its comment. */
  function conflictsOf(
    id: string,
  ): { key: string; testKey: string; field: 'answer' | 'comment'; conflict: ConflictField }[] {
    return [
      { key: `${id}/answer`, testKey: id, field: 'answer' as const },
      { key: `${id}/comment`, testKey: `${id}-comment`, field: 'comment' as const },
    ].flatMap((entry) => {
      const conflict = controller.conflicts[entry.key];
      return conflict ? [{ ...entry, conflict }] : [];
    });
  }

  let open = $derived(controller.open);

  function answerText(question: SammQuestion, value: unknown): string {
    return (
      question.answers.find((option) => option.value === value)?.text ?? $t('practice.unanswered')
    );
  }

  let label = $derived(
    saveLabel(
      controller,
      $t,
      $currentLocale,
      readonly
        ? assessment?.state === 'released'
          ? $t('save.read-only.released')
          : $t('save.read-only.right')
        : null,
    ),
  );

  function handleKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (!target || !questionElements[0]?.closest('[data-practice-sheet]')?.contains(target)) return;
    if (target.closest('textarea, input[type="text"], [contenteditable], dialog')) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const question = questions[active];
    if (/^[1-4]$/.test(event.key) && question && !locked) {
      const option = question.answers[Number(event.key) - 1];
      if (option) {
        event.preventDefault();
        setAnswer(question.id, option.value);
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
  onDestroy(() => controller.destroy());
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

      <StepUpDialog
        handler={controller.stepUp}
        lede={$t('stepup.lede.save', { title: assessment.title })}
        actLabel={$t('practice.save')}
        icon="act.save"
        testId="practice"
      />

      {#if controller.failure}
        <div class="notice"><Notice tone="danger" title={$t(controller.failure)} live /></div>
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
                    onchange={(value) => setAnswer(question.id, value)}
                    readonly={locked}
                    hints={hints && active === index}
                    testId="answer-{question.id}"
                  />
                  {#each questionConflicts as { key, testKey, field, conflict } (key)}
                    <div class="conflict" data-testid="conflict-{testKey}">
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
                        <Button onclick={() => controller.resolve(key, 'own')}>
                          {$t('practice.conflict.keep-own')}
                        </Button>
                        <Button onclick={() => controller.resolve(key, 'other')}>
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
                        readonly={locked}
                        oninput={(value) => setComment(question.id, value)}
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
          state={readonly ? 'read-only' : controller.saveState}
          {label}
          testId="save-state"
        />
        {#if !readonly}
          <Button
            variant="primary"
            icon="act.save"
            busy={controller.saveState === 'saving'}
            onclick={() => void controller.save()}
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
