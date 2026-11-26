<script lang="ts">
  import { onDestroy } from 'svelte';
  import MaturitySeal, { type SealFunction } from '../../components/MaturitySeal.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey } from '../../api/errors';
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
  import { session } from '../../stores/app';
  import { breadcrumb } from '../../stores/breadcrumb';
  import ReleaseFlow, {
    type ReleaseChange,
    type ReleaseCheck,
    type ReleaseGroup,
    type ReleaseTexts,
  } from '../documents/ReleaseFlow.svelte';
  import SinceList from './SinceList.svelte';
  import { previousRelease, versionOf } from './workflow';

  /**
   * The release of a SAMM assessment (UC-SAMM-4, AUN-WEB-6, AUN-SAMM-4): what the approver releases — the maturity
   * seal, the change since the scope's previous release, and the record itself as the structured diff against the
   * last released state, grouped by practice — then the act, which names the domain act only: "Release". The flow is
   * the generic `ReleaseFlow`, which every category shares; this view hands it what is the assessment's: the words, the
   * seal, the score, the answers drawn as the model's answer texts. Released, the seal is pressed into the sheet once.
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

  let summary = $derived(
    scope?.assessments.find((entry) => entry.id === params.assessment) ?? null,
  );
  let previous = $derived(scope ? previousRelease(scope.assessments, params.assessment) : null);
  let base = $derived(`/samm/${params.scope}/${params.assessment}`);
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

  let texts: ReleaseTexts = $derived({
    title: $t('release.title', { title: summary?.title ?? $t('common.loading') }),
    intro: $t('release.intro'),
    doneTitle: $t('release.done.title', { title: assessment?.title ?? '' }),
    doneIntro: $t('release.done.intro'),
    recordLede:
      diff && score
        ? diff.from === null
          ? $t('release.record.first', { count: score.answered })
          : $t('release.record.since', { tag: diff.from })
        : '',
    back: $t('release.back'),
    open: $t('release.open'),
    passwordLede: $t('release.password.lede', { title: assessment?.title ?? '' }),
    releasedMeanwhile: 'error.document-released',
    count: (count) => $t('release.record.count', { count }),
  });

  /** The record, practice by practice, the questions in the model's words. */
  let groups: ReleaseGroup[] = $derived(
    (diff?.sections ?? []).map((section) => ({
      key: section.part,
      title: (model ? findPractice(model, section.part)?.practice.name : null) ?? section.part,
      changes: section.changes.map((change) => ({
        key: change.pointer,
        pointer: change.pointer,
        label: questionOf(change.pointer)?.text ?? change.pointer,
        before: change.before,
        after: change.after,
      })),
    })),
  );

  let checks: ReleaseCheck[] = $derived(
    score
      ? [
          {
            key: 'answered',
            text: $t('release.check.answered', { count: score.answered, total: score.questions }),
            icon: complete ? 'state.done' : 'state.open',
            open: !complete,
          },
          ...(submitted
            ? [
                {
                  key: 'submitted',
                  text: $t('release.check.submitted', {
                    name: submitted.by.name,
                    time: formatDateTime(submitted.at, $currentLocale),
                  }),
                  icon: 'state.done' as const,
                },
              ]
            : []),
          { key: 'freeze', text: $t('release.check.freeze'), icon: 'state.seal' },
        ]
      : [],
  );
</script>

{#snippet stage(released: { tag: string; at: string } | null)}
  {#if assessment && model && score}
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
  {/if}
{/snippet}

{#snippet since()}
  {#if model && comparison}
    <SinceList {comparison} {model} />
  {/if}
{/snippet}

{#snippet value(change: ReleaseChange, side: 'before' | 'after')}
  {answerText(change.pointer, side === 'before' ? change.before : change.after)}
{/snippet}

<ReleaseFlow
  repository="samm-assessments"
  id={assessment?.id ?? ''}
  {texts}
  ready={!!assessment && !!model && !!score && !!diff}
  {failure}
  {groups}
  folded
  {unavailable}
  {checks}
  backHref={base}
  openHref={base}
  onreload={load}
  {stage}
  since={comparison && previous ? since : undefined}
  sinceTitle={previous ? $t('samm.since', { title: previous.title }) : ''}
  {value}
/>
