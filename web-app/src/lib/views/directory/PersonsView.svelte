<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Dialog from '../../components/Dialog.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import GridTable from '../../components/GridTable.svelte';
  import Notice from '../../components/Notice.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import TextField from '../../components/TextField.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError, type FieldError } from '../../api/errors';
  import type {
    CatalogEntry,
    Membership,
    PersonDraft,
    PersonList,
    PersonSummary,
  } from '../../api/types';
  import { canAdminister } from '../../catalogs/catalogs';
  import {
    errorKeysByPointer,
    hasName,
    loadTeamsAndRoles,
    MAX_PERSONS_PER_REQUEST,
    membershipsComplete,
    membershipText,
    nameKey,
    namesOf,
    narrowPersons,
    PERSONS_ADDRESS,
    personStateKey,
  } from '../../directory/directory';
  import { t } from '../../i18n';
  import { session } from '../../stores/app';
  import { breadcrumb } from '../../stores/breadcrumb';
  import DashboardPage from '../../templates/DashboardPage.svelte';
  import MembershipsEditor from './MembershipsEditor.svelte';

  /**
   * The person directory (UC-CAT-4, UC-CAT-5, `/directory/persons`): the table of the persons with their team, their
   * role and their state, a search by name, the entry of several persons at once before they ever log in, and the
   * erasure behind a confirmation that says it cannot be undone. Every user with a right reads the table; adding and
   * erasing need `administer-catalogs` (the page says so once and offers no act). Neither needs a step-up.
   *
   * A person directory of the organisation's own source answers `MANAGED_BY_SOURCE`; the page then says that persons are
   * kept there and that nothing was changed here.
   */

  /** The pause after the last typed letter before the server is asked. */
  const SEARCH_DELAY_MS = 300;

  /** One person being entered. */
  interface Row {
    key: number;
    name: string;
    memberships: Membership[];
  }

  let nextKey = 0;
  const blank = (): Row => ({ key: nextKey++, name: '', memberships: [{ team: '', role: '' }] });

  let administer = $derived(canAdminister($session));
  let list = $state<PersonList | null>(null);
  let teams = $state<CatalogEntry[]>([]);
  let roles = $state<CatalogEntry[]>([]);
  let failure = $state<string | null>(null);
  /** The teams and roles could not be read: the entry of persons cannot be completed. Kept apart from `failure`, which every read clears. */
  let catalogFailure = $state<string | null>(null);
  let typed = $state('');
  let query = $state('');
  /** The directory is kept in the organisation's own source: nothing was changed here. */
  let managed = $state(false);
  let announcement = $state('');

  let rows = $state<Row[]>([blank()]);
  /** The server's field errors of the last entry, by the position of the row and the pointer inside it. */
  let rowErrors = $state<Record<string, string>>({});
  let showMissing = $state(false);
  let adding = $state(false);

  let target = $state<(PersonSummary & { name: string }) | null>(null);
  let confirming = $state(false);
  let erasing = $state(false);

  let teamNames = $derived(namesOf(teams));
  let roleNames = $derived(namesOf(roles));
  let shown = $derived(list ? narrowPersons(list.persons, typed) : []);
  let known = $derived(new Set((list?.persons ?? []).filter(hasName).map((p) => nameKey(p.name))));
  /** A row counts when something was typed or picked in it. */
  const filled = (row: Row): boolean =>
    row.name.trim() !== '' || row.memberships.some((m) => m.team !== '' || m.role !== '');
  let entered = $derived(rows.filter(filled));
  /** Whether the table is the last word: no search, nothing listed. */
  let empty = $derived(list !== null && list.persons.length === 0 && query === '' && typed === '');

  onMount(() => {
    breadcrumb.set([{ label: $t('directory.persons.title'), href: PERSONS_ADDRESS }]);
    void loadTeamsAndRoles().then(
      (lists) => {
        teams = lists.teams;
        roles = lists.roles;
      },
      (error: unknown) => (catalogFailure = errorMessageKey(error)),
    );
    return () => breadcrumb.set([]);
  });

  // The search asks the server once the typing pauses; the table narrows by the typed text at once meanwhile.
  $effect(() => {
    const text = typed.trim();
    const timer = setTimeout(() => (query = text), text === '' ? 0 : SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  });

  /** The number of the latest read; the answer of an older one is dropped. */
  let latest = 0;

  async function read(text: string) {
    const number = ++latest;
    try {
      const answer = await apiClient.listPersons(text === '' ? undefined : text);
      if (number !== latest) return;
      list = answer;
      failure = null;
    } catch (error) {
      if (number === latest) failure = errorMessageKey(error);
    }
  }

  $effect(() => {
    const text = query;
    untrack(() => void read(text));
  });

  /**
   * @param person a person of the table
   * @returns the lines of their memberships, `Payments, Developer`
   */
  function places(person: PersonSummary): string[] {
    return person.memberships.map((membership) =>
      membershipText(membership, teamNames, roleNames, (team, role) =>
        $t('directory.membership.text', { team, role }),
      ),
    );
  }

  function ask(person: PersonSummary) {
    if (!hasName(person)) return;
    target = person;
    confirming = true;
  }

  async function erase() {
    const person = target;
    confirming = false;
    if (!person || erasing) return;
    erasing = true;
    failure = null;
    managed = false;
    announcement = '';
    try {
      await apiClient.erasePerson(person.pseudonym);
      announcement = $t('directory.persons.erased', { name: person.name });
      await read(query);
    } catch (error) {
      if (isApiError(error) && error.outcome === 'MANAGED_BY_SOURCE') {
        managed = true;
      } else if (isApiError(error) && error.outcome === 'NOT_FOUND') {
        // Erased by someone else meanwhile: the table is read again and no longer shows the person. The read clears
        // the failure of its own, so the notice is set after it.
        await read(query);
        failure = 'directory.persons.gone';
      } else {
        failure = errorMessageKey(error);
      }
    } finally {
      erasing = false;
      target = null;
    }
  }

  /**
   * Splits the errors of the server into the rows they belong to.
   *
   * @param errors the field errors of the entry
   * @param sent the row each person of the request came from, by position
   * @returns the catalogue key of the text of each error, by the row and the place in it (`1/name`)
   */
  function placeErrors(errors: FieldError[], sent: number[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [pointer, key] of Object.entries(errorKeysByPointer(errors))) {
      const match = /^\/persons\/(\d+)(\/.+)$/.exec(pointer);
      if (match) result[`${sent[Number(match[1])]}${match[2]}`] = key;
    }
    return result;
  }

  async function add() {
    if (adding || !administer || entered.length === 0) return;
    if (entered.some((row) => row.name.trim() === '' || !membershipsComplete(row.memberships))) {
      showMissing = true;
      return;
    }
    adding = true;
    failure = null;
    managed = false;
    announcement = '';
    rowErrors = {};
    const sent = rows.flatMap((row, index) => (filled(row) ? [index] : []));
    const persons: PersonDraft[] = entered.map((row) => ({
      name: row.name.trim(),
      memberships: row.memberships,
    }));
    try {
      const answer = await apiClient.createPersons(persons);
      announcement = $t('directory.persons.added', { count: answer.persons.length });
      rows = [blank()];
      showMissing = false;
      await read(query);
    } catch (error) {
      if (isApiError(error) && error.outcome === 'VALIDATION') {
        rowErrors = placeErrors(error.errors, sent);
      }
      if (isApiError(error) && error.outcome === 'MANAGED_BY_SOURCE') managed = true;
      else failure = errorMessageKey(error);
    } finally {
      adding = false;
    }
  }

  function addRow() {
    rows = [...rows, blank()];
  }

  function removeRow(key: number) {
    rows = rows.length === 1 ? [blank()] : rows.filter((row) => row.key !== key);
  }

  /**
   * @param row a row being entered
   * @param index its position
   * @returns the catalogue key of the error of its name: the server's, or that it is empty after the entry was tried
   */
  function nameError(row: Row, index: number): string | null {
    const server = rowErrors[`${index}/name`];
    if (server) return server;
    return showMissing && filled(row) && row.name.trim() === '' ? 'form.error.required' : null;
  }

  /**
   * @param row a row being entered
   * @param index its position
   * @param at the position of the membership
   * @param field its field
   * @returns the catalogue key of the error of the field: the server's, or that it is empty after the entry was tried
   */
  function membershipError(
    row: Row,
    index: number,
    at: number,
    field: 'team' | 'role',
  ): string | null {
    const server = rowErrors[`${index}/memberships/${at}/${field}`];
    if (server) return server;
    return showMissing && filled(row) && row.memberships[at]?.[field] === ''
      ? 'form.error.required'
      : null;
  }
</script>

<DashboardPage
  title={$t('directory.persons.title')}
  intro={$t('directory.persons.intro')}
  testId="persons-view"
>
  {#if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {/if}
  {#if catalogFailure}
    <Notice tone="danger" title={$t(catalogFailure)} live />
  {/if}
  {#if managed}
    <div data-testid="managed-notice">
      <Notice
        tone="attention"
        title={$t('directory.managed.title')}
        body={$t('directory.managed.body')}
        live
      />
    </div>
  {/if}
  {#if !administer}
    <div data-testid="persons-read-only">
      <Notice tone="info" title={$t('directory.persons.read-only')} />
    </div>
  {/if}
  {#if announcement}
    <p class="persons__done" role="status" aria-live="polite" data-testid="persons-done">
      {announcement}
    </p>
  {/if}

  <section class="persons__section" aria-labelledby="persons-table-title">
    <h2 id="persons-table-title" class="persons__heading">{$t('directory.persons.table')}</h2>
    {#if list === null}
      {#if !failure}<p class="persons__muted">{$t('common.loading')}</p>{/if}
    {:else}
      {#if !empty}
        <div class="persons__search">
          <TextField
            label={$t('directory.persons.search')}
            bind:value={typed}
            testId="persons-search"
          />
        </div>
      {/if}
      {#if list.truncated}
        <div data-testid="persons-truncated">
          <Notice
            tone="info"
            title={$t('directory.persons.truncated', { count: list.persons.length })}
          />
        </div>
      {/if}
      {#if empty}
        <EmptyState
          icon="state.person"
          title={$t('directory.persons.empty.title')}
          body={administer
            ? $t('directory.persons.empty.admin')
            : $t('directory.persons.empty.read')}
        />
      {:else if shown.length === 0}
        <EmptyState
          icon="state.na"
          title={$t('directory.persons.none-match.title')}
          body={$t('directory.persons.none-match.body')}
        />
      {:else}
        <GridTable
          caption={$t('directory.persons.table')}
          heads={[
            $t('directory.persons.col.name'),
            $t('directory.persons.col.places'),
            $t('directory.persons.col.state'),
            ...(administer ? [$t('directory.persons.col.act')] : []),
          ]}
          testId="persons-table"
        >
          {#each shown as person (person.pseudonym)}
            <tr data-testid="person-{person.pseudonym}">
              <th scope="row">{person.name ?? $t('form.mark.former')}</th>
              <td data-label={$t('directory.persons.col.places')}>
                <ul class="persons__places">
                  {#each places(person) as place, position (position)}
                    <li>{place}</li>
                  {/each}
                </ul>
              </td>
              <td data-label={$t('directory.persons.col.state')}>
                <StatusLabel tone="neutral" label={$t(personStateKey(person.state))} />
              </td>
              {#if administer}
                <td data-label={$t('directory.persons.col.act')}>
                  <Button
                    icon="act.close"
                    disabledReason={hasName(person) ? null : $t('directory.persons.erase.former')}
                    aria-label={$t('directory.persons.erase.named', { name: person.name ?? '' })}
                    onclick={() => ask(person)}
                    data-testid="erase-{person.pseudonym}"
                  >
                    {$t('directory.persons.erase')}
                  </Button>
                </td>
              {/if}
            </tr>
          {/each}
        </GridTable>
      {/if}
    {/if}
  </section>

  {#if administer}
    <section class="persons__section" aria-labelledby="persons-add-title" data-testid="persons-add">
      <h2 id="persons-add-title" class="persons__heading">{$t('directory.persons.add.title')}</h2>
      <p class="persons__muted">{$t('directory.persons.add.lede')}</p>
      <form
        class="persons__form"
        onsubmit={(event) => {
          event.preventDefault();
          void add();
        }}
        novalidate
      >
        {#each rows as row, index (row.key)}
          {@const nameFailure = nameError(row, index)}
          <fieldset class="person" data-testid="person-row-{index}">
            <legend class={rows.length > 1 ? 'person__legend' : 'sr-only'}>
              {$t('directory.persons.add.person', { n: index + 1 })}
            </legend>
            <TextField
              label={$t('directory.persons.add.name')}
              bind:value={row.name}
              required
              error={nameFailure ? $t(nameFailure) : null}
              testId="person-row-{index}-name"
            >
              {#snippet after()}
                {#if row.name.trim() !== '' && known.has(nameKey(row.name))}
                  <StatusLabel
                    tone="neutral"
                    label={$t('directory.persons.add.same-name')}
                    wrap
                    testId="person-row-{index}-same-name"
                  />
                {/if}
              {/snippet}
            </TextField>
            <MembershipsEditor
              bind:memberships={row.memberships}
              {teams}
              {roles}
              errorFor={(at, field) => membershipError(row, index, at, field)}
              testId="person-row-{index}-membership"
            />
            <!-- The only row, while nothing is typed in it, has nothing to remove: the act is not offered then. -->
            {#if rows.length > 1 || filled(row)}
              <div class="person__act">
                <Button
                  variant="ghost"
                  icon="act.close"
                  onclick={() => removeRow(row.key)}
                  data-testid="person-row-{index}-remove"
                >
                  {$t('directory.persons.add.remove')}
                </Button>
              </div>
            {/if}
          </fieldset>
        {/each}
        <div class="persons__acts">
          <Button
            disabledReason={rows.length >= MAX_PERSONS_PER_REQUEST
              ? $t('directory.persons.add.limit', { count: MAX_PERSONS_PER_REQUEST })
              : null}
            onclick={addRow}
            data-testid="persons-add-row"
          >
            {$t('directory.persons.add.another')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={adding}
            disabledReason={entered.length === 0 ? $t('directory.persons.add.nothing') : null}
            data-testid="persons-submit"
          >
            {$t('directory.persons.add.submit', { count: entered.length })}
          </Button>
        </div>
      </form>
    </section>
  {/if}
</DashboardPage>

{#if administer}
  <Dialog
    bind:open={confirming}
    title={$t('directory.persons.erase.title', { name: target?.name ?? '' })}
    closeLabel={$t('common.close')}
    onclose={() => {
      if (!erasing) target = null;
    }}
  >
    <p>{$t('directory.persons.erase.body')}</p>
    <div class="dialog__acts">
      <Button onclick={() => (confirming = false)} data-testid="erase-cancel">
        {$t('common.cancel')}
      </Button>
      <Button variant="danger" onclick={() => void erase()} data-testid="erase-confirm">
        {$t('directory.persons.erase')}
      </Button>
    </div>
  </Dialog>
{/if}

<style>
  .persons__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-inline-size: 64rem;
  }

  .persons__heading {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
    font-weight: var(--weight-semibold);
  }

  .persons__muted {
    max-inline-size: var(--measure);
    color: var(--color-text-muted);
  }

  .persons__done {
    color: var(--color-text-secondary);
  }

  .persons__search {
    max-inline-size: 24rem;
  }

  .persons__places {
    list-style: none;
    padding: 0;
  }

  .persons__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .person {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-inline-size: 0;
    padding: 0 0 var(--space-6);
    border: none;
    border-block-end: 1px solid var(--color-border);
  }

  .person__legend {
    padding: 0;
    margin-block-end: var(--space-3);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
  }

  .person__act {
    display: flex;
    align-items: flex-start;
  }

  .person__act :global(.btn-with-reason),
  .persons__acts :global(.btn-with-reason) {
    align-items: flex-start;
  }

  .person__act :global(.btn__reason),
  .persons__acts :global(.btn__reason) {
    text-align: start;
  }

  .persons__acts {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .dialog__acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-block-start: var(--space-5);
  }
</style>
