<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '../components/Button.svelte';
  import ChoiceGroup from '../components/ChoiceGroup.svelte';
  import Notice from '../components/Notice.svelte';
  import Select from '../components/Select.svelte';
  import TextField from '../components/TextField.svelte';
  import MascotFigure from '../brand/MascotFigure.svelte';
  import { apiClient } from '../api/client';
  import { errorMessageKey, isApiError } from '../api/errors';
  import type { BindingCandidate, CatalogEntry } from '../api/types';
  import { membershipText, namesOf } from '../directory/directory';
  import { t } from '../i18n';
  import { completeFirstLogin } from '../stores/app';
  import WizardPage from '../templates/WizardPage.svelte';

  /**
   * The first login (AUN-DIR-2): the own entry of the person directory, prefilled with the name from the
   * token and the team from the groups; team and role are picked from the catalogs; the information text
   * stands before the save button.
   *
   * When an administrator prepared entries with the person's team and role, the save is refused with the candidates
   * (`BINDING_CANDIDATES`, rest-api.adoc, The Own Entry, the Confirmation and the Binding): the person takes one over or
   * creates a new entry, and the save is sent again with that choice. A choice the server refuses (`NOT_BINDABLE`) leaves
   * the candidates on the page, with a notice.
   */
  interface Props {
    /** Opens an address inside the app once the entry is saved. */
    onnavigate: (href: string) => void;
  }

  let { onnavigate }: Props = $props();

  let name = $state('');
  let team = $state('');
  let role = $state('');
  let teams: CatalogEntry[] = $state([]);
  let roles: CatalogEntry[] = $state([]);
  let informationText = $state('');
  let loaded = $state(false);
  let saving = $state(false);
  let failure: string | null = $state(null);
  let fieldErrors: Record<string, string> = $state({});
  /** The prefilled entries the person may take over; `null` while the save found none. */
  let candidates: BindingCandidate[] | null = $state(null);
  /** The pseudonym of the candidate taken over, or `new`; empty while nothing is chosen. */
  let choice = $state('');
  /** The last choice was refused (`NOT_BINDABLE`). */
  let refused = $state(false);

  /** The word for one candidate: the name and where the entry is a member. */
  function candidateLabel(candidate: BindingCandidate): string {
    const teamNames = namesOf(teams);
    const roleNames = namesOf(roles);
    const places = candidate.memberships
      .map((membership) =>
        membershipText(membership, teamNames, roleNames, (team, role) =>
          $t('directory.membership.text', { team, role }),
        ),
      )
      .join('; ');
    return places === ''
      ? candidate.name
      : $t('welcome.candidate', { name: candidate.name, places });
  }

  onMount(async () => {
    try {
      const [prefill, teamList, roleList] = await Promise.all([
        apiClient.getDirectoryMe(),
        apiClient.getCatalog('team'),
        apiClient.getCatalog('role'),
      ]);
      name = prefill.name;
      team = prefill.teams.length === 1 ? prefill.teams[0] : '';
      informationText = prefill.informationText;
      teams = teamList.entries;
      roles = roleList.entries;
      loaded = true;
    } catch (error) {
      failure = errorMessageKey(error);
    }
  });

  function fieldErrorsOf(error: unknown): Record<string, string> {
    if (!isApiError(error) || error.outcome !== 'VALIDATION') return {};
    const result: Record<string, string> = {};
    for (const entry of error.errors) {
      result[entry.pointer.replace(/^\//, '')] = `error.validation.${entry.code}`;
    }
    return result;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    // The candidates ask for a choice first: Enter in the group must not send an empty one.
    if (saving || (candidates !== null && choice === '')) return;
    saving = true;
    failure = null;
    fieldErrors = {};
    refused = false;
    try {
      const entry = { name: name.trim(), team, role };
      const saved = await apiClient.putDirectoryMe(
        candidates === null ? entry : { ...entry, binding: choice },
      );
      completeFirstLogin(saved.pseudonym);
      onnavigate('/');
    } catch (error) {
      if (isApiError(error) && error.outcome === 'BINDING_CANDIDATES') {
        candidates = (error.details.candidates as BindingCandidate[] | undefined) ?? [];
        choice = '';
      } else if (isApiError(error) && error.outcome === 'NOT_BINDABLE') {
        // The candidates stay: the person chooses again. Without candidates there is nothing to choose from.
        if (candidates === null) failure = errorMessageKey(error);
        refused = true;
        choice = '';
      } else {
        fieldErrors = fieldErrorsOf(error);
        if (Object.keys(fieldErrors).length === 0) {
          failure = errorMessageKey(error);
        } else if (candidates !== null) {
          // The candidates have no fields to mark: the person goes back to the entry, where the errors are shown.
          edit();
        }
      }
    } finally {
      saving = false;
    }
  }

  /** Goes back to the entry the person typed; what the server found is dropped, and the save asks again. */
  function edit() {
    candidates = null;
    choice = '';
    refused = false;
  }

  const options = (entries: CatalogEntry[]) =>
    entries.map((entry) => ({ value: entry.id, label: entry.name }));
</script>

<WizardPage title={$t('welcome.title')} intro={$t('welcome.intro')} testId="welcome-view">
  <!-- The mascot stays on calm surfaces: not beside a refusal or an error. -->
  {#if !failure && !refused}
    <MascotFigure pose="welcome" />
  {/if}
  {#if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {/if}
  {#if loaded && candidates !== null}
    <form class="welcome__form" onsubmit={save} novalidate data-testid="welcome-candidates">
      <section class="welcome__candidates">
        <h2 class="welcome__information-title">{$t('welcome.candidates.title')}</h2>
        <p>{$t('welcome.candidates.body')}</p>
      </section>
      {#if refused}
        <Notice
          tone="attention"
          title={$t('welcome.not-bindable.title')}
          body={$t('welcome.not-bindable.body')}
          live
        />
      {/if}
      <ChoiceGroup
        legend={$t('welcome.candidates.legend')}
        value={choice}
        onchange={(value) => (choice = value)}
        testId="welcome-choice"
        choices={[
          ...candidates.map((candidate) => ({
            value: candidate.pseudonym,
            label: candidateLabel(candidate),
          })),
          { value: 'new', label: $t('welcome.candidates.new') },
        ]}
      />
      <div class="welcome__actions">
        <Button variant="ghost" onclick={edit} data-testid="welcome-edit">
          {$t('welcome.candidates.edit')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          busy={saving}
          disabledReason={choice === '' ? $t('welcome.candidates.choose') : null}
          data-testid="welcome-continue"
        >
          {$t('welcome.candidates.continue')}
        </Button>
      </div>
    </form>
  {:else if loaded}
    <form class="welcome__form" onsubmit={save} novalidate>
      <TextField
        label={$t('welcome.name')}
        bind:value={name}
        required
        autocomplete="name"
        error={fieldErrors.name ? $t(fieldErrors.name) : null}
        testId="welcome-name"
      />
      <Select
        label={$t('welcome.team')}
        bind:value={team}
        options={options(teams)}
        placeholder={$t('welcome.choose')}
        required
        error={fieldErrors.team ? $t(fieldErrors.team) : null}
        testId="welcome-team"
      />
      <Select
        label={$t('welcome.role')}
        bind:value={role}
        options={options(roles)}
        placeholder={$t('welcome.choose')}
        required
        error={fieldErrors.role ? $t(fieldErrors.role) : null}
        testId="welcome-role"
      />
      <section class="welcome__information" data-testid="welcome-information">
        <h2 class="welcome__information-title">{$t('welcome.information')}</h2>
        <p>{informationText}</p>
      </section>
      <div class="welcome__actions">
        <Button type="submit" variant="primary" busy={saving} data-testid="welcome-save">
          {$t('welcome.save')}
        </Button>
      </div>
    </form>
  {:else if !failure}
    <p class="welcome__loading">{$t('common.loading')}</p>
  {/if}
</WizardPage>

<style>
  .welcome__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .welcome__information {
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background-color: var(--color-bg-subtle);
    color: var(--color-text-secondary);
  }

  .welcome__information-title {
    font-size: var(--text-base);
    color: var(--color-text-primary);
    margin-block-end: var(--space-2);
  }

  .welcome__candidates {
    max-inline-size: var(--measure);
    color: var(--color-text-secondary);
  }

  .welcome__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .welcome__loading {
    color: var(--color-text-muted);
  }
</style>
