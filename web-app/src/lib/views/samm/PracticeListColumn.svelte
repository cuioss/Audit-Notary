<script lang="ts">
  import ColumnHead from '../../components/ColumnHead.svelte';
  import RowLink from '../../components/RowLink.svelte';
  import ScoreMeter from '../../components/ScoreMeter.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import type { SammAssessment, SammModel, SammScope } from '../../api/types';
  import { currentLocale, t } from '../../i18n';
  import { assessmentScore, formatScore } from '../../samm/scores';
  import { stateTone } from './workflow';

  /**
   * The practices of an assessment as a list column, grouped by business function: how far each is answered, its
   * score and its target, so the workshop sees what is left.
   */
  interface Props {
    scope: SammScope | null;
    assessment: SammAssessment | null;
    model: SammModel | null;
    /** The selected practice. */
    selected: string | null;
  }

  let { scope, assessment, model, selected }: Props = $props();

  let score = $derived(model && assessment ? assessmentScore(model, assessment.answers) : null);
</script>

{#if !scope || !assessment || !model || !score}
  <p class="column__loading">{$t('common.loading')}</p>
{:else}
  <ColumnHead
    kind="assessment"
    kindLabel={$t('kind.assessment')}
    title={assessment.title}
    href="/samm/{scope.id}/{assessment.slug}"
  >
    {#snippet meta()}
      <StatusLabel tone={stateTone(assessment.state)} label={$t(`workflow.${assessment.state}`)} />
    {/snippet}
  </ColumnHead>
  <div class="column__groups" data-testid="practice-list">
    {#each model.functions as fn, fnIndex (fn.id)}
      <section class="group">
        <h3 class="group__title">
          <span class="group__swatch group__swatch--{fnIndex}" aria-hidden="true"></span>
          {fn.name}
        </h3>
        <ul class="column__list">
          {#each fn.practices as practice, index (practice.id)}
            {@const own = score.functions[fnIndex].practices[index]}
            {@const target = scope.targets[practice.id]?.target ?? null}
            <li>
              <RowLink
                href="/samm/{scope.id}/{assessment.slug}/{practice.id}"
                selected={practice.id === selected}
                testId="practice-{practice.id}"
              >
                <span class="row__title">{practice.name}</span>
                <span class="row__line">
                  <span class="row__meta">
                    {own.answered === own.questions
                      ? $t('samm.practice.complete')
                      : $t('samm.answered', { count: own.answered, total: own.questions })}
                  </span>
                </span>
                <ScoreMeter
                  value={own.score}
                  {target}
                  text={formatScore(own.score, $currentLocale)}
                  label={target === null
                    ? $t('samm.score.of', { score: formatScore(own.score, $currentLocale) })
                    : $t('samm.score.of-target', {
                        score: formatScore(own.score, $currentLocale),
                        target: formatScore(target, $currentLocale),
                      })}
                  tone={own.answered < own.questions
                    ? 'muted'
                    : target !== null && own.score < target
                      ? 'attention'
                      : 'ink'}
                />
              </RowLink>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}

<style>
  .column__groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .column__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
  }

  .column__loading {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }

  .group__title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-4) var(--space-1);
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  .group__swatch {
    inline-size: 8px;
    block-size: 8px;
    border-radius: 2px;
  }

  .group__swatch--0 {
    background-color: var(--color-series-1);
  }

  .group__swatch--1 {
    background-color: var(--color-series-2);
  }

  .group__swatch--2 {
    background-color: var(--color-series-3);
  }

  .group__swatch--3 {
    background-color: var(--color-series-4);
  }

  .group__swatch--4 {
    background-color: var(--color-series-5);
  }

  .row__title {
    font-weight: var(--weight-medium);
  }

  .row__line {
    display: flex;
    gap: var(--space-3);
  }

  .row__meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
</style>
