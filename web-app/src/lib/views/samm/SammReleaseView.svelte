<script lang="ts">
  import { onDestroy } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Chip from '../../components/Chip.svelte';
  import Disclosure from '../../components/Disclosure.svelte';
  import Icon from '../../components/Icon.svelte';
  import Link from '../../components/Link.svelte';
  import MaturitySeal, { type SealFunction } from '../../components/MaturitySeal.svelte';
  import Notice from '../../components/Notice.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import MascotFigure from '../../brand/MascotFigure.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError } from '../../api/errors';
  import { stepUpMethodOf } from '../../access/access';
  import type {
    DocumentDiff,
    SammAssessment,
    SammComparison,
    SammModel,
    SammScope,
  } from '../../api/types';
  import { formatDateTime } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { assessmentScore, findPractice, formatScore } from '../../samm/scores';
  import { loadModel } from '../../samm/store';
  import { StepUpHandler } from '../../stepup/stepUp';
  import StepUpDialog from '../../stepup/StepUpDialog.svelte';
  import { session, status } from '../../stores/app';
  import { breadcrumb } from '../../stores/breadcrumb';
  import WizardPage from '../../templates/WizardPage.svelte';
  import SinceList from './SinceList.svelte';
  import { previousRelease, versionOf } from './workflow';

  /**
   * The release of a SAMM assessment (UC-SAMM-4, AUN-WEB-6, AUN-SAMM-4): what the approver releases — the maturity
   * seal, the change since the scope's previous release, and the record itself as the structured diff against the
   * last released state, grouped by practice — then the act, which names the domain act only: "Release". That the
   * person confirms their identity once more is said in the margin, whatever the method (AUN-WEB-6). Released, the seal is pressed into the sheet once, and the notary
   * stands beside it: a finished release is a calm surface (doc/concepts/brand.adoc).
   */
  interface Props {
    params: Record<string, string>;
  }

  let { params }: Props = $props();

  let scope = $state<SammScope | null>(null);
  let assessment = $state<SammAssessment | null>(null);
  let model = $state<SammModel | null>(null);
  let diff = $state<DocumentDiff | null>(null);
  let comparison = $state<SammComparison | null>(null);
  let failure = $state<string | null>(null);
  let notice = $state<{ tone: 'attention' | 'danger'; key: string } | null>(null);
  let released = $state<{ tag: string; at: string } | null>(null);

  // The step-up handler decides whether the release asks and how (UC-ACC-3); this view keeps the release's own outcomes.
  const stepUp = new StepUpHandler();
  const stepUpState = stepUp.state;

  let summary = $derived(
    scope?.assessments.find((entry) => entry.id === params.assessment) ?? null,
  );
  let previous = $derived(scope ? previousRelease(scope.assessments, params.assessment) : null);
  let base = $derived(`/samm/${params.scope}/${params.assessment}`);
  let confirms = $derived(stepUpMethodOf($status) !== 'off');
  let rights = $derived(
    $session?.rights.find((right) => right.repository === 'samm-assessments')?.actions ?? [],
  );

  async function load() {
    failure = null;
    try {
      scope = await apiClient.getSammScope(params.scope);
      const entry = scope.assessments.find((item) => item.id === params.assessment);
      if (!entry) throw new Error('unknown assessment');
      const [doc, loadedModel, loadedDiff] = await Promise.all([
        apiClient.getSammAssessment(entry.document),
        loadModel(entry.modelVersion),
        apiClient.getDiff('samm-assessments', entry.document),
      ]);
      assessment = doc;
      model = loadedModel;
      diff = loadedDiff;
      const before = previousRelease(scope.assessments, entry.id);
      comparison = before
        ? await apiClient.compareSamm(scope.id, before.id, entry.id).catch(() => null)
        : null;
    } catch (error) {
      failure = errorMessageKey(error);
    }
  }

  $effect(() => {
    void params.scope;
    void params.assessment;
    void load();
  });

  $effect(() => {
    breadcrumb.set(
      scope && summary
        ? [
            { label: scope.title, href: `/samm/${scope.id}` },
            { label: summary.title, href: base },
            { label: $t('lens.release'), href: `${base}/release` },
          ]
        : [],
    );
  });

  onDestroy(() => breadcrumb.set([]));

  let score = $derived(model && assessment ? assessmentScore(model, assessment.answers) : null);
  let complete = $derived(score ? score.answered === score.questions : false);
  let submitted = $derived(assessment?.history.find((line) => line.kind === 'submit') ?? null);

  let functions: SealFunction[] = $derived.by(() => {
    const targets = scope?.targets;
    if (!model || !score || !targets) return [];
    return model.functions.map((fn, fnIndex) => ({
      id: fn.id,
      name: fn.name,
      scoreText: formatScore(score.functions[fnIndex].score, $currentLocale),
      practices: fn.practices.map((practice, index) => {
        const own = score.functions[fnIndex].practices[index];
        const target = targets[practice.id]?.target ?? null;
        return {
          id: practice.id,
          shortName: practice.shortName,
          name: practice.name,
          streams: own.streams,
          score: own.score,
          target,
          href: null,
          label:
            target === null
              ? $t('samm.seal.practice', {
                  name: practice.name,
                  score: formatScore(own.score, $currentLocale),
                })
              : $t('samm.seal.practice-target', {
                  name: practice.name,
                  score: formatScore(own.score, $currentLocale),
                  target: formatScore(target, $currentLocale),
                }),
        };
      }),
    }));
  });

  let unavailable = $derived.by(() => {
    if (!rights.includes('approve')) return $t('release.no-right');
    if (assessment && assessment.state !== 'in-review') return $t('release.not-in-review');
    if (!complete) return $t('release.incomplete');
    return null;
  });

  async function release() {
    if (!assessment) return;
    const id = assessment.id;
    notice = null;
    const result = await stepUp.run((password) =>
      apiClient.release('samm-assessments', id, password),
    );
    if (result.status === 'done') {
      released = { tag: result.value.tag, at: result.value.at };
    } else if (result.status === 'refused') {
      const { error } = result;
      if (isApiError(error) && error.outcome === 'CHANGED_SINCE_REVIEW') {
        notice = { tone: 'attention', key: 'error.changed-since-review' };
        await load();
      } else {
        notice = { tone: 'danger', key: errorMessageKey(error) };
      }
    }
  }

  function questionOf(pointer: string) {
    const [, , part, id] = pointer.split('/');
    const practice = model ? findPractice(model, part)?.practice : null;
    return (
      practice?.streams
        .flatMap((stream) => stream.questions)
        .find((question) => question.id === id) ?? null
    );
  }

  function answerText(pointer: string, value: unknown): string {
    if (value === null || value === undefined) return $t('practice.unanswered');
    return (
      questionOf(pointer)?.answers.find((option) => option.value === value)?.text ?? String(value)
    );
  }
</script>

<WizardPage
  wide
  title={released
    ? $t('release.done.title', { title: assessment?.title ?? '' })
    : $t('release.title', { title: summary?.title ?? $t('common.loading') })}
  intro={released ? $t('release.done.intro') : $t('release.intro')}
  testId="release-view"
>
  <StepUpDialog
    handler={stepUp}
    lede={$t('release.password.lede', { title: assessment?.title ?? '' })}
    actLabel={$t('release.act')}
    testId="release"
  />
  {#if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {:else if !assessment || !model || !score || !diff}
    <p class="muted">{$t('common.loading')}</p>
  {:else}
    {#if notice}
      <Notice tone={notice.tone} title={$t(notice.key)} live />
    {/if}
    {#if released}
      <div class="done" data-testid="release-done">
        <Notice
          tone="success"
          title={$t('release.done.notice', { version: versionOf(released.tag) })}
          body={$t('release.done.body', { time: formatDateTime(released.at, $currentLocale) })}
          live
        />
      </div>
    {/if}
    <Sheet marginLabel={$t('release.margin')}>
      <section class="section" aria-labelledby="release-what">
        <h2 class="section__title" id="release-what">
          {released ? $t('release.sealed') : $t('release.what')}
        </h2>
        <div class="seal-stage" class:seal-stage--done={!!released}>
          <MaturitySeal
            {functions}
            overallText={formatScore(score.overall, $currentLocale)}
            overallLabel={$t('samm.seal.overall')}
            scaleLabel={$t('samm.seal.scale')}
            label={$t('samm.seal.label', {
              title: assessment.title,
              score: formatScore(score.overall, $currentLocale),
            })}
            legendLabel={$t('samm.seal.legend')}
            sealed={released ? versionOf(released.tag) : null}
            pressing={!!released}
            format={(value) => formatScore(value, $currentLocale)}
            testId="release-seal"
          />
          {#if released}
            <div class="seal-stage__mascot"><MascotFigure pose="done" /></div>
          {/if}
        </div>
      </section>

      {#if comparison && previous}
        <section class="section" aria-labelledby="release-since">
          <h2 class="section__title" id="release-since">
            {$t('samm.since', { title: previous.title })}
          </h2>
          <SinceList {comparison} {model} />
        </section>
      {/if}

      <section class="section" aria-labelledby="release-record">
        <h2 class="section__title" id="release-record">{$t('release.record')}</h2>
        <p class="section__lede">
          {diff.from === null
            ? $t('release.record.first', { count: score.answered })
            : $t('release.record.since', { tag: diff.from })}
        </p>
        <div class="record" data-testid="release-record">
          {#each diff.sections as section (section.part)}
            {@const practice = findPractice(model, section.part)?.practice}
            <Disclosure testId="record-{section.part}">
              {#snippet summary()}
                <span class="record__summary">
                  <span class="record__name">{practice?.name ?? section.part}</span>
                  <span class="record__count"
                    >{$t('release.record.count', { count: section.changes.length })}</span
                  >
                </span>
              {/snippet}
              <ul class="changes">
                {#each section.changes as change (change.pointer)}
                  <li class="change">
                    <span class="change__question"
                      >{questionOf(change.pointer)?.text ?? change.pointer}</span
                    >
                    <span class="change__values">
                      {#if change.before !== null && change.before !== undefined}
                        <del class="change__before">{answerText(change.pointer, change.before)}</del
                        >
                      {/if}
                      <ins class="change__after">{answerText(change.pointer, change.after)}</ins>
                    </span>
                  </li>
                {/each}
              </ul>
            </Disclosure>
          {/each}
        </div>
      </section>

      {#snippet status()}
        <div class="margin__block margin__block--acts">
          {#if released}
            <Link href={base} look="primary" data-testid="release-open">{$t('release.open')}</Link>
          {:else}
            <Button
              variant="primary"
              icon="act.stamp"
              busy={$stepUpState.working}
              onclick={release}
              disabledReason={unavailable}
              data-testid="release-act"
            >
              {$t('release.act')}
            </Button>
            <Link href={base} look="secondary">{$t('release.back')}</Link>
          {/if}
        </div>
      {/snippet}

      {#snippet margin()}
        <div class="margin">
          {#if released}
            <section class="margin__block">
              <h2 class="margin__title">{$t('sheet.release')}</h2>
              <p class="check">
                <Icon name="state.seal" size={16} />
                <span>
                  {$t('sheet.released-by', {
                    name: $session?.user.name ?? '',
                    date: formatDateTime(released.at, $currentLocale),
                  })}
                </span>
              </p>
            </section>
          {:else}
            <section class="margin__block">
              <h2 class="margin__title">{$t('release.check')}</h2>
              <ul class="checks">
                <li class="check" class:check--open={!complete}>
                  <Icon name={complete ? 'state.done' : 'state.open'} size={16} />
                  <span
                    >{$t('release.check.answered', {
                      count: score.answered,
                      total: score.questions,
                    })}</span
                  >
                </li>
                {#if submitted}
                  <li class="check">
                    <Icon name="state.done" size={16} />
                    <span>
                      {$t('release.check.submitted', {
                        name: submitted.by.name,
                        time: formatDateTime(submitted.at, $currentLocale),
                      })}
                    </span>
                  </li>
                {/if}
                <li class="check">
                  <Icon name="state.seal" size={16} />
                  <span>{$t('release.check.freeze')}</span>
                </li>
                {#if confirms}
                  <li class="check">
                    <Icon name="state.lock" size={16} />
                    <span>{$t('release.check.step-up')}</span>
                  </li>
                {/if}
              </ul>
            </section>
          {/if}
          {#if released}
            <section class="margin__block">
              <h2 class="margin__title">{$t('sheet.tag')}</h2>
              <Chip value={released.tag} label={$t('sheet.tag')} testId="release-tag" />
            </section>
          {/if}
        </div>
      {/snippet}
    </Sheet>
  {/if}
</WizardPage>

<style>
  .muted {
    color: var(--color-text-muted);
  }

  .done {
    margin-block-end: var(--space-2);
  }

  .section + .section {
    margin-block-start: var(--space-12);
  }

  .section__title {
    margin-block-end: var(--space-4);
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
  }

  .section__lede {
    max-inline-size: var(--measure);
    margin-block-end: var(--space-4);
    color: var(--color-text-secondary);
  }

  .seal-stage {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-8);
  }

  .seal-stage__mascot {
    flex: 0 0 auto;
    animation: rise var(--duration-seal) var(--ease-standard) both;
    animation-delay: calc(var(--duration-seal) * 0.6);
  }

  .seal-stage__mascot :global(.mascot) {
    max-inline-size: 9rem;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }

    to {
      opacity: 1;
      transform: none;
    }
  }

  .record {
    display: flex;
    flex-direction: column;
    border-block-start: 1px solid var(--color-border);
  }

  .record > :global(*) {
    border-block-end: 1px solid var(--color-border);
    padding-block: var(--space-1);
  }

  .record__summary {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .record__name {
    font-family: var(--font-serif);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
  }

  .record__count {
    flex: 0 0 auto;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .changes {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    list-style: none;
    padding-block-end: var(--space-3);
  }

  .change {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: var(--space-4);
    font-size: var(--text-sm);
  }

  .change__question {
    color: var(--color-text-secondary);
  }

  .change__values {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .change__before {
    color: var(--color-text-muted);
    background-color: var(--color-diff-removed);
    text-decoration-color: var(--color-danger);
    padding-inline: var(--space-1);
  }

  .change__after {
    align-self: flex-start;
    padding-inline: var(--space-1);
    background-color: var(--color-diff-added);
    color: var(--color-text-primary);
    text-decoration: none;
  }

  .margin {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .margin__block {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .margin__block--acts :global(.btn),
  .margin__block--acts :global(.link--button),
  .margin__block--acts :global(.btn-with-reason) {
    inline-size: 100%;
    max-inline-size: none;
    align-items: stretch;
  }

  .margin__block--acts :global(.btn__reason) {
    text-align: start;
  }

  .margin__title {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  .checks {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    list-style: none;
  }

  .check {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font-size: var(--text-sm);
    line-height: var(--line-height-sm);
    color: var(--color-text-primary);
  }

  .check :global(.ui-icon) {
    margin-block-start: 1px;
    color: var(--color-success);
  }

  .check--open :global(.ui-icon) {
    color: var(--color-attention);
  }

  @media (max-width: 767px) {
    .seal-stage {
      flex-direction: column;
    }

    .change {
      grid-template-columns: 1fr;
      gap: var(--space-1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .seal-stage__mascot {
      animation: none;
    }
  }
</style>
