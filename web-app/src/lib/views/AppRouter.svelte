<script lang="ts">
  import { hasNoRights } from '../access/access';
  import { lensOf, parseAddress, routesUnder, routeTitleKey } from '../routes';
  import { session } from '../stores/app';
  import LoginProblemView from './access/LoginProblemView.svelte';
  import LoginView from './access/LoginView.svelte';
  import NoRightsView from './access/NoRightsView.svelte';
  import SignedOutView from './access/SignedOutView.svelte';
  import DueView from './DueView.svelte';
  import LensPlaceholderView from './LensPlaceholderView.svelte';
  import NotFoundView from './NotFoundView.svelte';
  import SettingsView from './SettingsView.svelte';
  import WelcomeView from './WelcomeView.svelte';
  import DocumentReleaseView from './documents/DocumentReleaseView.svelte';
  import CatalogsView from './catalogs/CatalogsView.svelte';
  import ImportView from './directory/ImportView.svelte';
  import PersonsView from './directory/PersonsView.svelte';
  import ProfileView from './directory/ProfileView.svelte';
  import DocumentsView from './documents/DocumentsView.svelte';
  import SammReleaseView from './samm/SammReleaseView.svelte';
  import SammView from './samm/SammView.svelte';

  /**
   * Chooses the view of an address (AUN-WEB-3). The route files are stubs that render this component.
   */
  interface Props {
    /** The path of the current location. */
    pathname: string;
    /** The query of the current location, with its `?`; the pages outside the shell read `return` and `reason`. */
    search?: string;
    /** Opens an address inside the app; `replace` takes the place of the current one in the history. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
  }

  let { pathname, search = '', onnavigate }: Props = $props();

  /**
   * The routes of the catalogs lens this view draws as a chain of columns: the addresses under `/catalogs`, read from the
   * canonical addresses. The pages of the directory (`/directory/...`) belong to the lens too and have views of their own.
   */
  const CATALOG_ROUTES = routesUnder('catalogs');

  let address = $derived(parseAddress(pathname, search));
  let route = $derived(address?.route ?? null);
  // A session without a right sees the empty state in place of every view on a repository; the first-login form and
  // the settings need none.
  let withoutRights = $derived(hasNoRights($session));
</script>

{#if route === null}
  <NotFoundView />
{:else if route === 'login'}
  <LoginView {search} />
{:else if route === 'signed-out'}
  <SignedOutView />
{:else if route === 'login-problem'}
  <LoginProblemView {search} />
{:else if withoutRights && route !== 'welcome' && lensOf(route) !== 'settings'}
  <NoRightsView titleKey={routeTitleKey(route)} />
{:else if route === 'due'}
  <DueView />
{:else if route === 'welcome'}
  <WelcomeView {onnavigate} />
{:else if route === 'settings.profile'}
  <ProfileView />
{:else if lensOf(route) === 'settings'}
  <SettingsView />
{:else if route === 'samm.release' && address}
  {#key `${address.params.scope}/${address.params.assessment}`}
    <SammReleaseView params={address.params} />
  {/key}
{:else if lensOf(route) === 'samm' && address}
  <SammView params={address.params} />
{:else if route === 'categories.release' && address}
  {#key `${address.params.category}/${address.params.document}`}
    <DocumentReleaseView params={address.params} />
  {/key}
{:else if lensOf(route) === 'categories' && address}
  <DocumentsView {route} params={address.params} query={address.query} {onnavigate} />
{:else if route === 'catalogs.import'}
  <ImportView />
{:else if route === 'catalogs.persons'}
  <PersonsView />
{:else if CATALOG_ROUTES.includes(route) && address}
  <CatalogsView {route} params={address.params} {onnavigate} />
{:else}
  {#key route}
    <LensPlaceholderView titleKey={routeTitleKey(route)} {route} />
  {/key}
{/if}
