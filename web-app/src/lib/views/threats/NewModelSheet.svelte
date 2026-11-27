<script lang="ts">
  import EmptyState from '../../components/EmptyState.svelte';
  import Link from '../../components/Link.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import type { JsonSchema, ThreatModelService } from '../../api/types';
  import { t } from '../../i18n';
  import { serviceAddress } from '../../threats/model';
  import RecipeChoice from './RecipeChoice.svelte';
  import RecipeWizardSheet from './RecipeWizardSheet.svelte';

  /**
   * The address of a new threat model of a service (`/threat-models/{service}/new`, UC-TM-1). Without `recipe` the page
   * offers the recipes; with one it is the wizard of that recipe. A person without the right to edit and a service that is
   * retired get no wizard and are told why, with the way back to the service.
   */
  interface Props {
    /** The service page, or `null` while it is read. */
    service: ThreatModelService | null;
    /** The recipe named by the address, if any. */
    recipe?: string;
    /** Whether the user holds the right `edit` on the threat models. */
    canCreate: boolean;
    /** The schema of the document type, or `null` while it is read. */
    schema: JsonSchema | null;
    /** Opens an address inside the app; `replace` takes the new model's place in the history. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
    /** Called after the model was created, so the lens reads its evaluation and the service again. */
    oncreated?: () => void;
    /** Called after the draft of the recipe was kept, so the service page lists it. */
    onkept?: () => void;
    /** The catalogue key of the failure of the read of the schema, `null` while it did not fail. */
    schemaFailure?: string | null;
    /** Reads the schema again. */
    onretryschema?: () => void;
  }

  let {
    service,
    recipe,
    canCreate,
    schema,
    onnavigate,
    oncreated,
    onkept,
    schemaFailure = null,
    onretryschema,
  }: Props = $props();
</script>

{#if service === null}
  <Sheet testId="new-threat-model-loading"><p class="muted">{$t('common.loading')}</p></Sheet>
{:else if !canCreate}
  <Sheet testId="new-threat-model-no-right">
    <EmptyState icon="state.lock" title={$t('threats.new.no-right')}>
      {#snippet actions()}
        <Link href={serviceAddress(service.service.id)}>{$t('threats.new.back')}</Link>
      {/snippet}
    </EmptyState>
  </Sheet>
{:else if service.service.retired}
  <Sheet testId="new-threat-model-retired">
    <EmptyState
      icon="state.lock"
      title={$t('threats.service.retired.title')}
      body={$t('threats.service.retired.body')}
    >
      {#snippet actions()}
        <Link href={serviceAddress(service.service.id)}>{$t('threats.new.back')}</Link>
      {/snippet}
    </EmptyState>
  </Sheet>
{:else if recipe}
  {#key `${service.service.id}/${recipe}`}
    <RecipeWizardSheet
      {service}
      recipeId={recipe}
      {schema}
      {onnavigate}
      {oncreated}
      {onkept}
      {schemaFailure}
      {onretryschema}
    />
  {/key}
{:else}
  <RecipeChoice {service} />
{/if}

<style>
  .muted {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }
</style>
