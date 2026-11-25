<script lang="ts">
  import { lensOf, parseAddress, routeTitleKey } from '../routes';
  import DueView from './DueView.svelte';
  import LensPlaceholderView from './LensPlaceholderView.svelte';
  import NotFoundView from './NotFoundView.svelte';
  import SettingsView from './SettingsView.svelte';
  import WelcomeView from './WelcomeView.svelte';
  import SammReleaseView from './samm/SammReleaseView.svelte';
  import SammView from './samm/SammView.svelte';

  /**
   * Chooses the view of an address (AUN-WEB-3). The route files are stubs that render this component.
   */
  interface Props {
    /** The path of the current location. */
    pathname: string;
    /** Opens an address inside the app. */
    onnavigate: (href: string) => void;
  }

  let { pathname, onnavigate }: Props = $props();

  let address = $derived(parseAddress(pathname));
  let route = $derived(address?.route ?? null);
</script>

{#if route === null}
  <NotFoundView />
{:else if route === 'due'}
  <DueView />
{:else if route === 'welcome'}
  <WelcomeView {onnavigate} />
{:else if lensOf(route) === 'settings'}
  <SettingsView />
{:else if route === 'samm.release' && address}
  {#key `${address.params.scope}/${address.params.assessment}`}
    <SammReleaseView params={address.params} />
  {/key}
{:else if lensOf(route) === 'samm' && address}
  <SammView params={address.params} />
{:else}
  {#key route}
    <LensPlaceholderView titleKey={routeTitleKey(route)} {route} />
  {/key}
{/if}
