<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '../components/Button.svelte';
  import Notice from '../components/Notice.svelte';
  import Select from '../components/Select.svelte';
  import TextField from '../components/TextField.svelte';
  import MascotFigure from '../brand/MascotFigure.svelte';
  import { apiClient } from '../api/client';
  import { errorMessageKey, isApiError } from '../api/errors';
  import type { CatalogEntry } from '../api/types';
  import { t } from '../i18n';
  import { completeFirstLogin } from '../stores/app';
  import WizardPage from '../templates/WizardPage.svelte';

  /**
   * The first login (AUN-DIR-2): the own entry of the person directory, prefilled with the name from the
   * token and the team from the groups; team and role are picked from the catalogs; the information text
   * stands before the save button.
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
    saving = true;
    failure = null;
    fieldErrors = {};
    try {
      const saved = await apiClient.putDirectoryMe({ name: name.trim(), team, role });
      completeFirstLogin(saved.pseudonym);
      onnavigate('/');
    } catch (error) {
      fieldErrors = fieldErrorsOf(error);
      if (Object.keys(fieldErrors).length === 0) {
        failure = errorMessageKey(error);
      }
    } finally {
      saving = false;
    }
  }

  const options = (entries: CatalogEntry[]) =>
    entries.map((entry) => ({ value: entry.id, label: entry.name }));
</script>

<WizardPage title={$t('welcome.title')} intro={$t('welcome.intro')} testId="welcome-view">
  <MascotFigure pose="welcome" />
  {#if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {/if}
  {#if loaded}
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

  .welcome__actions {
    display: flex;
    justify-content: flex-end;
  }

  .welcome__loading {
    color: var(--color-text-muted);
  }
</style>
