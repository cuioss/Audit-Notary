<script lang="ts">
  import Button from '../components/Button.svelte';
  import Dialog from '../components/Dialog.svelte';
  import { t } from '../i18n';
  import { guardLeaving } from './leave';

  /**
   * The question before a page is left while it holds what is stored nowhere (rest-api.adoc, Decided Provisionally, point
   * 11): a new scope or a new assessment, the targets of a scope not yet saved. It guards the moves inside the app and the
   * departure from it, and asks in a dialog of its own. Mount it once in the sheet that holds the content.
   */
  interface Props {
    /** Whether the page holds content that would be lost. */
    dirty: () => boolean;
  }

  let { dirty }: Props = $props();

  let asking = $state(false);
  let proceed: (() => void) | null = null;

  guardLeaving(
    () => dirty(),
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
</script>

<Dialog
  bind:open={asking}
  title={$t('documents.new.leave.title')}
  closeLabel={$t('common.close')}
  onclose={() => (proceed = null)}
>
  <p>{$t('documents.new.leave.body')}</p>
  <div class="leave">
    <Button onclick={() => (asking = false)} data-testid="leave-stay">
      {$t('documents.new.leave.stay')}
    </Button>
    <Button variant="danger" onclick={leave} data-testid="leave-confirm">
      {$t('documents.new.leave.confirm')}
    </Button>
  </div>
</Dialog>

<style>
  .leave {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-block-start: var(--space-5);
  }
</style>
