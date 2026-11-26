<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { breadcrumb } from '../../stores/breadcrumb';
  import DashboardPage from '../../templates/DashboardPage.svelte';

  /**
   * The page of one report of the lens Reports: the launcher template with the title and the lede of the report, the
   * report's own name in the breadcrumb of the top bar, which is also the way back to the dashboard. A report only reads, so the page
   * holds no act of its own.
   */
  interface Props {
    /** The title of the report, the page's `h1`. */
    title: string;
    /** The sentence under the title. */
    intro?: string;
    /** The address of the report, for the breadcrumb. */
    address: string;
    /** A test id. */
    testId: string;
    /** The report. */
    children: Snippet;
  }

  let { title, intro, address, testId, children }: Props = $props();

  onMount(() => () => breadcrumb.set([]));

  $effect(() => {
    breadcrumb.set([{ label: title, href: address }]);
  });
</script>

<DashboardPage {title} {intro} {testId}>
  <div class="report">
    {@render children()}
  </div>
</DashboardPage>

<style>
  .report {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-inline-size: 64rem;
  }
</style>
