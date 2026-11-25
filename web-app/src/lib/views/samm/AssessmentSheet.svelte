<script lang="ts">
  import Avatar from '../../components/Avatar.svelte';
  import Button from '../../components/Button.svelte';
  import Chip from '../../components/Chip.svelte';
  import HistoryList from '../../components/HistoryList.svelte';
  import Link from '../../components/Link.svelte';
  import MaturitySeal, { type SealFunction } from '../../components/MaturitySeal.svelte';
  import Notice from '../../components/Notice.svelte';
  import ScoreMeter from '../../components/ScoreMeter.svelte';
  import SegmentedControl from '../../components/SegmentedControl.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey } from '../../api/errors';
  import type { SammAssessment, SammComparison, SammModel, SammScope } from '../../api/types';
  import { formatDate } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { historyEntries } from '../../samm/history';
  import { assessmentScore, formatDelta, formatScore, gapsOf } from '../../samm/scores';
  import { StepUpHandler } from '../../stepup/stepUp';
  import StepUpDialog from '../../stepup/StepUpDialog.svelte';
  import { now } from '../../stores/clock';
  import { session } from '../../stores/app';
  import SinceList from './SinceList.svelte';
  import { previousRelease, stateTone, versionOf } from './workflow';

  /**
   * An assessment as a sheet (UC-SAMM-3, UC-SAMM-4, UC-SAMM-6): its maturity seal — or the same figures as a table —
   * the changes since the scope's previous release, the gaps against the targets, and the act its state calls for:
   * submit a finished draft for review, open the release of an assessment in review, or show the release it carries.
   * The margin keeps the assessors and the signed history.
   */
  interface Props {
    scope: SammScope | null;
    assessment: SammAssessment | null;
    model: SammModel | null;
    /** Called after an act changed the assessment, so the view reads it again. */
    onchanged?: () => void;
  }

  let { scope, assessment, model, onchanged }: Props = $props();

  let view: 'seal' | 'table' = $state('seal');
  let comparison = $state<SammComparison | null>(null);
  let submitting = $state(false);
  let failure = $state<string | null>(null);
  let missing: string[] = $state([]);
  // A transition may ask for step-up (UC-ACC-3): the handler decides whether and how.
  const stepUp = new StepUpHandler();

  let score = $derived(model && assessment ? assessmentScore(model, assessment.answers) : null);
  let previous = $derived(
    scope && assessment ? previousRelease(scope.assessments, assessment.slug) : null,
  );
  let rights = $derived(
    $session?.rights.find((right) => right.repository === 'samm-assessments')?.actions ?? [],
  );
  let base = $derived(scope && assessment ? `/samm/${scope.id}/${assessment.slug}` : '');

  // A comparison says what changed between two complete assessments; against a draft that is half answered it would
  // report every open question as a loss.
  $effect(() => {
    if (!scope || !assessment || !previous || assessment.state === 'draft') {
      comparison = null;
      return;
    }
    let current = true;
    apiClient
      .compareSamm(scope.id, previous.id, assessment.slug)
      .then((answer) => {
        if (current) comparison = answer;
      })
      .catch(() => {
        if (current) comparison = null;
      });
    return () => {
      current = false;
    };
  });

  let functions: SealFunction[] = $derived.by(() => {
    if (!model || !score || !scope) return [];
    return model.functions.map((fn, fnIndex) => ({
      id: fn.id,
      name: fn.name,
      scoreText: formatScore(score.functions[fnIndex].score, $currentLocale),
      practices: fn.practices.map((practice, index) => {
        const own = score.functions[fnIndex].practices[index];
        const target = scope.targets[practice.id]?.target ?? null;
        return {
          id: practice.id,
          shortName: practice.shortName,
          name: practice.name,
          streams: own.streams,
          score: own.score,
          target,
          href: `${base}/${practice.id}`,
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

  let gaps = $derived(
    score && scope && assessment && assessment.state !== 'draft'
      ? gapsOf(score, scope.targets)
      : [],
  );
  let complete = $derived(score ? score.answered === score.questions : false);
  let practiceName = (id: string) =>
    model?.functions.flatMap((fn) => fn.practices).find((practice) => practice.id === id)?.name ??
    id;

  /**
   * @param pointers the JSON Pointers of `MANDATORY_FIELDS_MISSING`, `/answers/<practice>/<question>/answer`
   * @returns the practices they lie in, each once, in their order
   */
  function missingPractices(pointers: string[]): string[] {
    return [...new Set(pointers.map((pointer) => pointer.split('/')[2] ?? pointer))];
  }

  async function submit() {
    if (!assessment) return;
    submitting = true;
    failure = null;
    missing = [];
    try {
      const id = assessment.id;
      const result = await stepUp.run((password) =>
        apiClient.transition('samm-assessments', id, 'samm.submit', password),
      );
      if (result.status === 'refused') throw result.error;
      if (result.status === 'done') onchanged?.();
    } catch (error) {
      failure = errorMessageKey(error);
      const details = (error as { details?: { missing?: string[] } }).details;
      missing = details?.missing ?? [];
    } finally {
      submitting = false;
    }
  }
</script>

{#if !assessment || !model || !score || !scope}
  <Sheet><p class="muted">{$t('common.loading')}</p></Sheet>
{:else}
  <Sheet testId="assessment-sheet" marginLabel={$t('sheet.margin')}>
    <SheetHead
      kind="assessment"
      kindLabel={$t('kind.assessment')}
      title={assessment.title}
      lede={$t('samm.assessment.lede', {
        model: `${$t('samm.model.name')} ${assessment.modelVersion}`,
        scope: scope.title,
      })}
      facts={[
        { term: $t('samm.fact.date'), value: formatDate(assessment.date, $currentLocale, 'long') },
        {
          term: $t('samm.fact.answered'),
          value: $t('samm.answered', { count: score.answered, total: score.questions }),
        },
        {
          term: $t('samm.fact.overall'),
          value: `${formatScore(score.overall, $currentLocale)} / 3`,
        },
      ]}
    >
      {#snippet state()}
        <StatusLabel
          tone={stateTone(assessment.state)}
          label={assessment.release
            ? $t('workflow.released-as', { version: versionOf(assessment.release.tag) })
            : $t(`workflow.${assessment.state}`)}
          testId="assessment-state"
        />
      {/snippet}
      {#snippet actions()}
        {#if assessment.state === 'draft'}
          <Button
            variant="primary"
            icon="act.next"
            busy={submitting}
            onclick={submit}
            disabledReason={!rights.includes('edit')
              ? $t('samm.submit.no-right')
              : complete
                ? null
                : $t('samm.submit.incomplete', { count: score.questions - score.answered })}
            data-testid="assessment-submit"
          >
            {$t('samm.submit')}
          </Button>
        {:else if assessment.state === 'in-review'}
          <Link href="{base}/release" look="primary" data-testid="assessment-review">
            {$t('samm.review-and-release')}
          </Link>
        {/if}
      {/snippet}
    </SheetHead>

    <StepUpDialog
      handler={stepUp}
      lede={$t('stepup.lede.submit', { title: assessment.title })}
      actLabel={$t('samm.submit')}
      icon="act.next"
      testId="assessment"
    />

    {#if failure}
      <div class="notice">
        <Notice
          tone="danger"
          title={$t(failure)}
          body={missing.length > 0
            ? missingPractices(missing).map(practiceName).join(', ')
            : undefined}
          live
        />
      </div>
    {/if}

    <section class="section" aria-labelledby="maturity-title">
      <div class="section__head">
        <h2 class="section__title" id="maturity-title">{$t('samm.maturity')}</h2>
        <SegmentedControl
          label={$t('samm.maturity.view')}
          value={view}
          onchange={(value) => (view = value === 'table' ? 'table' : 'seal')}
          testId="maturity-view"
          options={[
            { value: 'seal', label: $t('samm.maturity.seal'), icon: 'act.chart' },
            { value: 'table', label: $t('samm.maturity.table'), icon: 'act.table' },
          ]}
        />
      </div>
      {#if view === 'seal'}
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
          sealed={assessment.release ? versionOf(assessment.release.tag) : null}
          format={(value) => formatScore(value, $currentLocale)}
          testId="maturity-seal"
        />
        <p class="section__note">{$t('samm.seal.how-to-read')}</p>
      {:else}
        <table class="scores" data-testid="maturity-table">
          <caption class="sr-only"
            >{$t('samm.maturity.caption', { title: assessment.title })}</caption
          >
          <thead>
            <tr>
              <th scope="col">{$t('kind.practice')}</th>
              <th scope="col" class="num">{$t('samm.stream.a')}</th>
              <th scope="col" class="num">{$t('samm.stream.b')}</th>
              <th scope="col" class="num">{$t('samm.score')}</th>
              <th scope="col" class="num">{$t('samm.target')}</th>
              {#if comparison}<th scope="col" class="num">{$t('samm.change')}</th>{/if}
            </tr>
          </thead>
          {#each model.functions as fn, fnIndex (fn.id)}
            <tbody>
              <tr class="scores__function">
                <th scope="rowgroup">{fn.name}</th>
                <td></td>
                <td></td>
                <td class="num">{formatScore(score.functions[fnIndex].score, $currentLocale)}</td>
                <td></td>
                {#if comparison}
                  <td class="num"
                    >{formatDelta(comparison.functions[fnIndex].delta, $currentLocale)}</td
                  >
                {/if}
              </tr>
              {#each fn.practices as practice, index (practice.id)}
                {@const own = score.functions[fnIndex].practices[index]}
                {@const target = scope.targets[practice.id]?.target}
                <tr>
                  <th scope="row"><Link href="{base}/{practice.id}">{practice.name}</Link></th>
                  <td class="num">{formatScore(own.streams[0], $currentLocale)}</td>
                  <td class="num">{formatScore(own.streams[1], $currentLocale)}</td>
                  <td class="num num--strong">{formatScore(own.score, $currentLocale)}</td>
                  <td class="num"
                    >{target === undefined ? '–' : formatScore(target, $currentLocale)}</td
                  >
                  {#if comparison}
                    <td class="num">
                      {formatDelta(
                        comparison.functions[fnIndex].practices[index].delta,
                        $currentLocale,
                      )}
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          {/each}
        </table>
      {/if}
    </section>

    {#if comparison && previous}
      <section class="section" aria-labelledby="since-title">
        <h2 class="section__title" id="since-title">
          {$t('samm.since', { title: previous.title })}
        </h2>
        <p class="section__lede">
          {$t('samm.since.lede', {
            from: formatScore(comparison.overall.from, $currentLocale),
            to: formatScore(comparison.overall.to, $currentLocale),
          })}
        </p>
        <SinceList {comparison} {model} />
      </section>
    {/if}

    {#if gaps.length > 0}
      <section class="section" aria-labelledby="gaps-title">
        <h2 class="section__title" id="gaps-title">{$t('samm.gaps')}</h2>
        <p class="section__lede">{$t('samm.gaps.lede', { count: gaps.length })}</p>
        <ul class="gaps" data-testid="gap-list">
          {#each gaps as gap (gap.practice)}
            <li class="gap">
              <span class="gap__name"
                ><Link href="{base}/{gap.practice}">{practiceName(gap.practice)}</Link></span
              >
              <ScoreMeter
                value={gap.score}
                target={gap.target}
                tone="attention"
                text={formatScore(gap.score, $currentLocale)}
                label={$t('samm.score.of-target', {
                  score: formatScore(gap.score, $currentLocale),
                  target: formatScore(gap.target, $currentLocale),
                })}
              />
              <span class="gap__meta">
                {gap.due
                  ? $t('samm.gap.missing-due', {
                      missing: formatScore(gap.missing, $currentLocale),
                      due: formatDate(gap.due, $currentLocale),
                    })
                  : $t('samm.gap.missing', { missing: formatScore(gap.missing, $currentLocale) })}
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#snippet margin()}
      <div class="margin">
        {#if assessment.release}
          <section class="margin__block">
            <h2 class="margin__title">{$t('sheet.release')}</h2>
            <p class="margin__text">
              {$t('sheet.released-by', {
                name: assessment.release.by.name,
                date: formatDate(assessment.release.at, $currentLocale, 'long'),
              })}
            </p>
            <Chip value={assessment.release.tag} label={$t('sheet.tag')} testId="release-tag" />
          </section>
        {/if}
        <section class="margin__block">
          <h2 class="margin__title">{$t('samm.assessors')}</h2>
          <ul class="people">
            {#each assessment.assessors as person (person.pseudonym)}
              <li class="person">
                <Avatar name={person.name} size="sm" />
                <span class="person__text">
                  <span class="person__name">{person.name}</span>
                  {#if person.role}<span class="person__role">{person.role}</span>{/if}
                </span>
              </li>
            {/each}
          </ul>
        </section>
        <section class="margin__block">
          <h2 class="margin__title">{$t('sheet.history')}</h2>
          <HistoryList
            entries={historyEntries(assessment.history, model, $t, $currentLocale, $now)}
            label={$t('sheet.history')}
            testId="assessment-history"
          />
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

  .section + .section {
    margin-block-start: var(--space-12);
  }

  .section__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-block-end: var(--space-4);
  }

  .section__title {
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
  }

  .section > .section__title {
    margin-block-end: var(--space-2);
  }

  .section__lede,
  .section__note {
    max-inline-size: var(--measure);
    color: var(--color-text-secondary);
  }

  .section__lede {
    margin-block-end: var(--space-4);
  }

  .section__note {
    margin-block-start: var(--space-4);
    font-size: var(--text-sm);
    text-align: center;
    margin-inline: auto;
  }

  .scores {
    inline-size: 100%;
    border-collapse: collapse;
  }

  .scores th,
  .scores td {
    padding: var(--space-2) var(--space-3) var(--space-2) 0;
    text-align: start;
    font-weight: var(--weight-regular);
    border-block-end: 1px solid var(--color-border);
  }

  .scores thead th {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
    border-block-end-color: var(--color-border-strong);
  }

  .scores__function th,
  .scores__function td {
    padding-block-start: var(--space-5);
    font-family: var(--font-serif);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  .num {
    text-align: end;
    font-feature-settings: 'tnum' 1;
    inline-size: 5rem;
  }

  .scores th.num,
  .scores td.num {
    text-align: end;
  }

  .num--strong {
    font-weight: var(--weight-semibold);
  }

  .gaps {
    display: flex;
    flex-direction: column;
    list-style: none;
  }

  .gap {
    display: grid;
    grid-template-columns: minmax(10rem, 1fr) minmax(8rem, 14rem) minmax(8rem, 1fr);
    align-items: center;
    gap: var(--space-4);
    padding-block: var(--space-3);
    border-block-end: 1px solid var(--color-border);
  }

  .gap__name {
    font-family: var(--font-serif);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }

  .gap__meta {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
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

  .margin__title {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  .margin__text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .people {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    list-style: none;
  }

  .person {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .person__text {
    display: flex;
    flex-direction: column;
    font-size: var(--text-sm);
    line-height: var(--line-height-sm);
  }

  .person__name {
    font-weight: var(--weight-medium);
  }

  .person__role {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  @media (max-width: 767px) {
    .gap {
      grid-template-columns: 1fr;
      gap: var(--space-1);
    }
  }
</style>
