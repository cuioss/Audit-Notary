<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '../../components/Button.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import TextField from '../../components/TextField.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError, type FieldError } from '../../api/errors';
  import type { CatalogEntry, Membership, OwnEntry } from '../../api/types';
  import { guardLeaving } from '../../documents/leave';
  import {
    errorKeysByPointer,
    loadTeamsAndRoles,
    membershipsComplete,
    PROFILE_ADDRESS,
    sameMemberships,
  } from '../../directory/directory';
  import { formatDate } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { refreshSession } from '../../stores/app';
  import { breadcrumb } from '../../stores/breadcrumb';
  import WizardPage from '../../templates/WizardPage.svelte';
  import Dialog from '../../components/Dialog.svelte';
  import MembershipsEditor from './MembershipsEditor.svelte';

  /**
   * The own directory entry (UC-ACC-5, `/settings/profile`): the name and the memberships of the person, changed here,
   * and the question "Is this still right?" once the server's interval has passed. A saved change is a confirmation,
   * and so is the act "Yes, this is right"; neither needs a step-up, and the notice of the shell goes once the session
   * is read again. The page asks nothing of the person who leaves it with unsaved changes except to confirm leaving.
   */
  let entry = $state<OwnEntry | null>(null);
  let informationText = $state('');
  let teams = $state<CatalogEntry[]>([]);
  let roles = $state<CatalogEntry[]>([]);
  let loaded = $state(false);
  let failure = $state<string | null>(null);

  let name = $state('');
  let memberships = $state<Membership[]>([]);
  let errors = $state<FieldError[] | null>(null);
  /** The person tried to save with a field left empty: the empty ones say so. */
  let showMissing = $state(false);
  let saving = $state(false);
  let confirming = $state(false);
  let announcement = $state('');
  let asking = $state(false);
  let proceed: (() => void) | null = null;

  let byPointer = $derived(errorKeysByPointer(errors ?? []));
  let dirty = $derived(
    entry !== null &&
      (name.trim() !== entry.name || !sameMemberships(memberships, entry.memberships)),
  );
  let due = $derived(entry?.confirmationDue === true);
  /** While the entry waits for its confirmation and nothing was changed, the confirmation is the one act. */
  let confirmIsPrimary = $derived(due && !dirty);

  onMount(() => {
    breadcrumb.set([{ label: $t('profile.title'), href: PROFILE_ADDRESS }]);
    void (async () => {
      try {
        const [me, lists] = await Promise.all([apiClient.getDirectoryMe(), loadTeamsAndRoles()]);
        teams = lists.teams;
        roles = lists.roles;
        informationText = me.informationText;
        if (me.entry) adopt(me.entry);
      } catch (error) {
        failure = errorMessageKey(error);
      } finally {
        loaded = true;
      }
    })();
    return () => breadcrumb.set([]);
  });

  /**
   * Takes the entry as the server holds it: the form shows it and nothing is changed.
   *
   * @param read the entry
   */
  function adopt(read: OwnEntry) {
    entry = read;
    name = read.name;
    memberships = read.memberships.map((membership) => ({ ...membership }));
    errors = null;
    showMissing = false;
  }

  guardLeaving(
    () => dirty,
    (go) => {
      proceed = go;
      asking = true;
    },
  );

  function leave() {
    asking = false;
    proceed?.();
    proceed = null;
  }

  /**
   * @param index the position of a membership
   * @param field its field
   * @returns the catalogue key of the error of the field: the server's, or that the field is empty after a save was tried
   */
  function membershipError(index: number, field: 'team' | 'role'): string | null {
    const server = byPointer[`/memberships/${index}/${field}`];
    if (server) return server;
    return showMissing && memberships[index]?.[field] === '' ? 'form.error.required' : null;
  }

  let nameError = $derived(
    byPointer['/name'] ?? (showMissing && name.trim() === '' ? 'form.error.required' : null),
  );

  /** Refreshes what the shell shows once the entry is confirmed: the session says the confirmation is no longer due. */
  async function confirmed(day: string, key: string) {
    if (entry) entry = { ...entry, confirmedAt: day, confirmationDue: false };
    announcement = $t(key, { date: formatDate(day, $currentLocale) });
    await refreshSession();
  }

  async function save() {
    if (saving || confirming || !dirty) return;
    if (name.trim() === '' || !membershipsComplete(memberships)) {
      showMissing = true;
      return;
    }
    saving = true;
    failure = null;
    errors = null;
    announcement = '';
    try {
      // What is sent is kept apart: the baseline of the saved entry is this, whatever is typed while the request waits.
      const sent = { name: name.trim(), memberships: memberships.map((m) => ({ ...m })) };
      const answer = await apiClient.putDirectoryMe(sent);
      const day = answer.confirmedAt ?? new Date().toISOString().slice(0, 10);
      if (entry) {
        const saved = { ...entry, ...sent };
        if (name.trim() === sent.name && sameMemberships(memberships, sent.memberships)) {
          adopt(saved);
        } else {
          // Changed while the request waited: those changes are not saved, the form stays unsaved with them.
          entry = saved;
          errors = null;
        }
      }
      await confirmed(day, 'profile.saved');
    } catch (error) {
      if (isApiError(error) && error.outcome === 'VALIDATION') errors = error.errors;
      failure = errorMessageKey(error);
    } finally {
      saving = false;
    }
  }

  async function confirm() {
    if (saving || confirming || dirty) return;
    confirming = true;
    failure = null;
    announcement = '';
    try {
      const answer = await apiClient.confirmDirectoryMe();
      await confirmed(answer.confirmedAt, 'profile.confirmed');
    } catch (error) {
      failure = errorMessageKey(error);
    } finally {
      confirming = false;
    }
  }
</script>

<WizardPage title={$t('profile.title')} intro={$t('profile.intro')} testId="profile-view">
  {#if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {/if}
  {#if !loaded}
    <p class="profile__loading">{$t('common.loading')}</p>
  {:else if entry === null}
    {#if !failure}
      <EmptyState
        icon="state.person"
        title={$t('profile.missing.title')}
        body={$t('profile.missing.body')}
      >
        {#snippet actions()}
          <Link href="/welcome">{$t('profile.missing.act')}</Link>
        {/snippet}
      </EmptyState>
    {/if}
  {:else}
    {#if due}
      <div data-testid="profile-confirm">
        <Notice
          tone="info"
          title={$t('profile.confirm.title')}
          body={$t('profile.confirm.body', {
            date: formatDate(entry.confirmedAt, $currentLocale),
          })}
        >
          {#snippet actions()}
            <Button
              variant={confirmIsPrimary ? 'primary' : 'secondary'}
              busy={confirming}
              disabledReason={dirty ? $t('profile.confirm.unsaved') : null}
              onclick={() => void confirm()}
              data-testid="profile-confirm-act"
            >
              {$t('profile.confirm')}
            </Button>
          {/snippet}
        </Notice>
      </div>
    {/if}
    <form
      class="profile__form"
      onsubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      novalidate
    >
      <TextField
        label={$t('profile.name')}
        bind:value={name}
        required
        autocomplete="name"
        error={nameError ? $t(nameError) : null}
        testId="profile-name"
      />
      <section class="profile__memberships">
        <h2 class="profile__heading">{$t('profile.memberships')}</h2>
        <MembershipsEditor
          bind:memberships
          {teams}
          {roles}
          errorFor={membershipError}
          testId="profile-membership"
        />
      </section>
      <section class="profile__information" data-testid="profile-information">
        <h2 class="profile__information-title">{$t('welcome.information')}</h2>
        <p>{informationText}</p>
      </section>
      {#if !due}
        <p class="profile__last" data-testid="profile-last-confirmed">
          {$t('profile.last-confirmed', { date: formatDate(entry.confirmedAt, $currentLocale) })}
        </p>
      {/if}
      <div class="profile__actions">
        <Button
          type="submit"
          variant={confirmIsPrimary ? 'secondary' : 'primary'}
          icon="act.save"
          busy={saving}
          disabledReason={dirty ? null : $t('profile.save.nothing')}
          data-testid="profile-save"
        >
          {$t('profile.save')}
        </Button>
      </div>
    </form>
    <p class="profile__done" role="status" aria-live="polite" data-testid="profile-done">
      {announcement}
    </p>
  {/if}
</WizardPage>

<Dialog
  bind:open={asking}
  title={$t('documents.new.leave.title')}
  closeLabel={$t('common.close')}
  onclose={() => (proceed = null)}
>
  <p>{$t('documents.new.leave.body')}</p>
  <div class="dialog__acts">
    <Button onclick={() => (asking = false)} data-testid="leave-stay">
      {$t('documents.new.leave.stay')}
    </Button>
    <Button variant="danger" onclick={leave} data-testid="leave-confirm">
      {$t('documents.new.leave.confirm')}
    </Button>
  </div>
</Dialog>

<style>
  .profile__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .profile__memberships {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .profile__heading {
    font-size: var(--text-lg);
  }

  .profile__information {
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background-color: var(--color-bg-subtle);
    color: var(--color-text-secondary);
  }

  .profile__information-title {
    font-size: var(--text-base);
    color: var(--color-text-primary);
    margin-block-end: var(--space-2);
  }

  .profile__last,
  .profile__loading {
    color: var(--color-text-muted);
  }

  .profile__done {
    color: var(--color-text-secondary);
  }

  .profile__done:empty {
    display: none;
  }

  .profile__actions {
    display: flex;
    justify-content: flex-end;
  }

  .dialog__acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-block-start: var(--space-5);
  }
</style>
