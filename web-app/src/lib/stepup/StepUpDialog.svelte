<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '../components/Button.svelte';
  import Dialog from '../components/Dialog.svelte';
  import Notice from '../components/Notice.svelte';
  import TextField from '../components/TextField.svelte';
  import { t } from '../i18n';
  import type { StepUpHandler } from './stepUp';

  /**
   * What the step-up handler shows (UC-ACC-3): the dialog that asks a local user for the password again, titled
   * "Confirm your identity", and the notice when no step-up can start because many people are logging in. The control
   * that asks names the domain act only; the method is never a label (AUN-WEB-6).
   *
   * Mount it once in every view that sends a request through the handler.
   */
  interface Props {
    /** The handler of the view. */
    handler: StepUpHandler;
    /** The sentence above the password field, naming what is confirmed ("Enter your password to release X."). */
    lede: string;
    /** The label of the dialog's act: the domain act, such as "Release". */
    actLabel: string;
    /** The act's icon. */
    icon?: string;
    /** The prefix of the test ids: `<prefix>-password`, `<prefix>-confirm`. */
    testId: string;
  }

  let { handler, lede, actLabel, icon = 'act.stamp', testId }: Props = $props();

  // The handler belongs to the view for its whole life.
  // svelte-ignore state_referenced_locally
  const view = handler.state;

  let open = $state(false);
  let password = $state('');
  let emptyError = $state<string | null>(null);

  // Only the transitions count, not every patch of the state: a derived boolean notifies when its value changes.
  const asking = $derived($view.asking);
  const refused = $derived($view.dialogError !== null);

  // Each question starts with an empty field and no error of its own.
  $effect(() => {
    const isAsking = asking;
    untrack(() => {
      if (isAsking) {
        password = '';
        emptyError = null;
      }
      open = isAsking;
    });
  });

  // A wrong password is cleared on purpose, as on the login page; nothing else clears the field while it is open.
  $effect(() => {
    if (refused) {
      untrack(() => {
        password = '';
      });
    }
  });

  function confirm(event: SubmitEvent) {
    event.preventDefault();
    if (password === '') {
      emptyError = $t('error.validation.REQUIRED');
      return;
    }
    emptyError = null;
    void handler.submit(password);
  }
</script>

{#if $view.notice}
  <Notice tone={$view.notice.tone} title={$t($view.notice.key)} live />
{/if}

<Dialog
  bind:open
  title={$t('stepup.title')}
  closeLabel={$t('common.cancel')}
  onclose={() => handler.cancel()}
>
  <form class="password" onsubmit={confirm} novalidate>
    <p class="password__lede">{lede}</p>
    <TextField
      label={$t('stepup.password')}
      type="password"
      autocomplete="current-password"
      bind:value={password}
      error={emptyError ?? ($view.dialogError ? $t($view.dialogError) : null)}
      required
      testId="{testId}-password"
    />
    <div class="password__acts">
      <Button variant="ghost" onclick={() => handler.cancel()}>{$t('common.cancel')}</Button>
      <Button
        type="submit"
        variant="primary"
        {icon}
        busy={$view.sending}
        data-testid="{testId}-confirm"
      >
        {actLabel}
      </Button>
    </div>
  </form>
</Dialog>

<style>
  .password {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .password__lede {
    color: var(--color-text-secondary);
  }

  .password__acts {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
