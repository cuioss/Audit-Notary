<script lang="ts">
  import EmptyState from '../../components/EmptyState.svelte';
  import { t } from '../../i18n';
  import DashboardPage from '../../templates/DashboardPage.svelte';

  /**
   * The empty state in place of every view that acts on a repository, for a session without a right
   * (rest-api.adoc, A Session Without Rights). The shell keeps its notice and its navigation; the view makes no request
   * the server would refuse, and no mascot stands here: a refusal is no calm surface.
   */
  interface Props {
    /** The catalogue key of the view's title. */
    titleKey: string;
  }

  let { titleKey }: Props = $props();
</script>

<DashboardPage title={$t(titleKey)} testId="no-rights-view">
  <EmptyState
    icon="state.lock"
    title={$t('access.no-rights.empty.title')}
    body={$t('access.no-rights.empty.body')}
  />
</DashboardPage>
