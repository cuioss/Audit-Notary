<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Select, { type SelectOption } from '../../components/Select.svelte';
  import type { CatalogEntry, Membership } from '../../api/types';
  import { MAX_MEMBERSHIPS } from '../../directory/directory';
  import { t } from '../../i18n';

  /**
   * The memberships of a person entry: one to five rows, each a team and a role picked from the catalogs (UC-ACC-5,
   * UC-CAT-4). A retired entry is not offered, except where the row holds it already, so an entry that still names a
   * retired team can be read and changed. Adding past the limit is an act that says why it cannot be taken, and the last row has no
   * act to remove it, never a dead control. Nothing is sent from here: the holder of the list sends it.
   */
  interface Props {
    /** The memberships, bindable; a row picked halfway holds an empty team or role. */
    memberships: Membership[];
    /** The entries of the catalog `team`. */
    teams: CatalogEntry[];
    /** The entries of the catalog `role`. */
    roles: CatalogEntry[];
    /** The catalogue key of the error of a field of a row, or `null`. */
    errorFor?: (index: number, field: 'team' | 'role') => string | null;
    /** A test id prefix; the rows are `<testId>-<n>-team` and `-role`. */
    testId: string;
  }

  let { memberships = $bindable(), teams, roles, errorFor = () => null, testId }: Props = $props();

  /**
   * @param entries the entries of a catalog
   * @param catalog its id, the prefix of a reference
   * @param held the reference the row holds
   * @returns the options: every entry that is not retired, and the held one whatever it is
   */
  function optionsOf(entries: CatalogEntry[], catalog: string, held: string): SelectOption[] {
    return entries
      .filter((entry) => !entry.retired || `${catalog}:${entry.id}` === held)
      .map((entry) => ({
        value: `${catalog}:${entry.id}`,
        label: entry.retired ? `${entry.name} (${$t('form.mark.retired')})` : entry.name,
      }));
  }

  function add() {
    memberships = [...memberships, { team: '', role: '' }];
  }

  function remove(index: number) {
    memberships = memberships.filter((_, position) => position !== index);
  }

  function pick(index: number, field: 'team' | 'role', value: string) {
    memberships = memberships.map((membership, position) =>
      position === index ? { ...membership, [field]: value } : membership,
    );
  }
</script>

<div class="memberships" data-testid={testId}>
  {#each memberships as membership, index (index)}
    <fieldset class="membership" data-testid="{testId}-{index}">
      {#if memberships.length > 1}
        <legend class="membership__legend">{$t('directory.membership.n', { n: index + 1 })}</legend>
      {:else}
        <legend class="sr-only">{$t('directory.membership.n', { n: index + 1 })}</legend>
      {/if}
      <div class="membership__fields">
        <Select
          label={$t('directory.membership.team')}
          value={membership.team}
          options={optionsOf(teams, 'team', membership.team)}
          placeholder={$t('directory.choose')}
          required
          error={errorFor(index, 'team') ? $t(errorFor(index, 'team') ?? '') : null}
          onchange={(value) => pick(index, 'team', value)}
          testId="{testId}-{index}-team"
        />
        <Select
          label={$t('directory.membership.role')}
          value={membership.role}
          options={optionsOf(roles, 'role', membership.role)}
          placeholder={$t('directory.choose')}
          required
          error={errorFor(index, 'role') ? $t(errorFor(index, 'role') ?? '') : null}
          onchange={(value) => pick(index, 'role', value)}
          testId="{testId}-{index}-role"
        />
      </div>
      <!-- The last row has no act to remove it: a person needs one team and role, so the act is not offered at all. -->
      {#if memberships.length > 1}
        <div class="membership__act">
          <Button
            variant="ghost"
            icon="act.close"
            onclick={() => remove(index)}
            data-testid="{testId}-{index}-remove"
          >
            {$t('directory.membership.remove')}
          </Button>
        </div>
      {/if}
    </fieldset>
  {/each}
  <div class="memberships__add">
    <Button
      disabledReason={memberships.length >= MAX_MEMBERSHIPS
        ? $t('directory.membership.limit', { count: MAX_MEMBERSHIPS })
        : null}
      onclick={add}
      data-testid="{testId}-add"
    >
      {$t('directory.membership.add')}
    </Button>
  </div>
</div>

<style>
  .memberships {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .membership {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
    padding: 0;
    border: none;
  }

  .membership__legend {
    padding: 0;
    margin-block-end: var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
  }

  .membership__fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-4);
  }

  .membership__act,
  .memberships__add {
    display: flex;
    align-items: flex-start;
  }

  .membership__act :global(.btn-with-reason),
  .memberships__add :global(.btn-with-reason) {
    align-items: flex-start;
  }

  .membership__act :global(.btn__reason),
  .memberships__add :global(.btn__reason) {
    text-align: start;
  }
</style>
