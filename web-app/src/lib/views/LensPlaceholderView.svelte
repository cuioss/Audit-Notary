<script lang="ts">
  import EmptyState from '../components/EmptyState.svelte';
  import MascotFigure from '../brand/MascotFigure.svelte';
  import { t } from '../i18n';
  import DashboardPage from '../templates/DashboardPage.svelte';

  /**
   * The view of a lens whose screens belong to a later stage: its address already resolves, so the
   * navigation and a reload are tested before the lens exists.
   */
  interface Props {
    /** The catalogue key of the lens title. */
    titleKey: string;
    /** The route id, for tests. */
    route: string;
  }

  let { titleKey, route }: Props = $props();
</script>

<DashboardPage title={$t(titleKey)} testId="lens-view">
  <div data-route={route} data-testid="lens-route">
    <MascotFigure pose="at-work" />
    <EmptyState
      icon="state.clock"
      title={$t('lens.placeholder.title')}
      body={$t('lens.placeholder.body')}
    />
  </div>
</DashboardPage>
