<script lang="ts">
  import Chip from '../components/Chip.svelte';
  import { uniqueId } from '../components/uniqueId';
  import type { FieldError } from '../api/errors';
  import { t } from '../i18n';
  import { errorKey } from './fieldErrors';

  /**
   * The errors that name no field of the form or of the row editor (AUN-WEB-4, Validation): listed below the fields
   * with their pointer, so that no verdict of the server is lost.
   */
  interface Props {
    /** The errors. */
    errors: FieldError[];
    /** A test id. */
    testId?: string;
  }

  let { errors, testId }: Props = $props();

  const titleId = uniqueId('other-errors');
</script>

{#if errors.length > 0}
  <section class="other" aria-labelledby={titleId} data-testid={testId}>
    <p class="other__title" id={titleId}>{$t('form.errors.other')}</p>
    <ul class="other__list">
      {#each errors as error, index (index)}
        <li>
          {#if error.pointer !== ''}<Chip value={error.pointer} />{/if}
          {$t(errorKey(error.code))}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .other {
    margin-block-start: var(--space-6);
    padding-block-start: var(--space-4);
    border-block-start: 1px solid var(--color-danger);
    color: var(--color-danger);
  }

  .other__title {
    margin: 0 0 var(--space-2);
    font-weight: var(--weight-medium);
  }

  .other__list {
    margin: 0;
    padding-inline-start: var(--space-5);
    font-size: var(--text-sm);
  }
</style>
