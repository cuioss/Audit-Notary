<script lang="ts">
  import EmptyState from '../../components/EmptyState.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey } from '../../api/errors';
  import type { ThreatModelService, ThreatRecipeSummary } from '../../api/types';
  import { currentLocale, t } from '../../i18n';
  import { newAddress, serviceAddress } from '../../threats/model';

  /**
   * The first page of a new threat model (UC-TM-1): the recipes that ship with the application, each with what it covers
   * and the number of its steps, and for a recipe the person has started, where they stopped. Choosing one opens the wizard
   * at `/threat-models/{service}/new?recipe=`; a recipe that was started is continued, never started again.
   *
   * The texts of a recipe are its own data in the language of the interface, not catalogue messages.
   */
  interface Props {
    /** The service the model is for. */
    service: ThreatModelService;
  }

  let { service }: Props = $props();

  let recipes = $state<ThreatRecipeSummary[] | null>(null);
  let failure = $state<string | null>(null);

  // The list is read again when the language changes, so that the titles and descriptions follow the interface.
  $effect(() => {
    const lang = $currentLocale;
    let current = true;
    apiClient
      .getThreatRecipes(lang)
      .then((answer) => {
        if (!current) return;
        recipes = answer.recipes;
        failure = null;
      })
      .catch((error) => {
        if (current) failure = errorMessageKey(error);
      });
    return () => {
      current = false;
    };
  });

  /** @param id a recipe's id @returns the draft of the person for it, if any */
  function draftOf(id: string) {
    return service.drafts.find((draft) => draft.recipe === id);
  }
</script>

<Sheet testId="new-threat-model-sheet" marginLabel={$t('sheet.margin')}>
  <SheetHead
    kind="threat-model"
    kindLabel={$t('threats.kind.model')}
    title={$t('threats.new.title')}
    size="title"
    lede={$t('threats.new.lede', { service: service.service.name })}
  />

  {#if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {:else if recipes === null}
    <p class="muted">{$t('common.loading')}</p>
  {:else if recipes.length === 0}
    <EmptyState
      icon="state.na"
      title={$t('threats.new.recipes.none.title')}
      body={$t('threats.new.recipes.none.body')}
    >
      {#snippet actions()}
        <Link href={serviceAddress(service.service.id)}>{$t('threats.new.back')}</Link>
      {/snippet}
    </EmptyState>
  {:else}
    <section class="recipes" aria-labelledby="recipes-title" data-testid="recipe-choice">
      <h2 class="recipes__title" id="recipes-title">{$t('threats.new.recipes.title')}</h2>
      <p class="recipes__lede">{$t('threats.new.recipes.lede')}</p>
      <ul class="recipes__list">
        {#each recipes as recipe (recipe.id)}
          {@const draft = draftOf(recipe.id)}
          <li class="recipe" data-testid="recipe-{recipe.id}">
            <div class="recipe__text">
              <h3 class="recipe__title">{recipe.title}</h3>
              <p class="recipe__description">{recipe.description}</p>
              <p class="recipe__meta">
                <span>{$t('threats.new.recipes.steps', { count: recipe.steps })}</span>
                {#if draft}
                  <StatusLabel
                    tone="running"
                    label={draft.step < recipe.steps
                      ? $t('threats.new.recipes.started', {
                          step: draft.step + 1,
                          count: recipe.steps,
                        })
                      : $t('threats.new.recipes.review')}
                    testId="recipe-started-{recipe.id}"
                  />
                {/if}
              </p>
            </div>
            <Link
              look="secondary"
              href={newAddress(service.service.id, recipe.id)}
              aria-label={draft
                ? $t('threats.new.recipes.continue.named', { title: recipe.title })
                : $t('threats.new.recipes.start.named', { title: recipe.title })}
              data-testid="recipe-open-{recipe.id}"
            >
              {draft ? $t('threats.new.recipes.continue') : $t('threats.new.recipes.start')}
            </Link>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</Sheet>

<style>
  .muted {
    color: var(--color-text-muted);
  }

  .recipes__title {
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
  }

  .recipes__lede {
    max-inline-size: var(--measure);
    margin-block: var(--space-2) var(--space-4);
    color: var(--color-text-secondary);
  }

  .recipes__list {
    list-style: none;
  }

  .recipe {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3) var(--space-6);
    padding-block: var(--space-4);
    border-block-start: 1px solid var(--color-border);
  }

  .recipe__text {
    flex: 1 1 18rem;
    max-inline-size: var(--measure);
  }

  .recipe__title {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
  }

  .recipe__description {
    color: var(--color-text-secondary);
  }

  .recipe__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-4);
    margin-block-start: var(--space-1);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
</style>
