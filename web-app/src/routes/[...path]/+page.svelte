<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import AppRouter from '../../lib/views/AppRouter.svelte';

  // The one route stub (AUN-WEB-3): every address renders the router, which reads it.
</script>

<AppRouter pathname={page.url.pathname} onnavigate={(href: string) => void goto(href)} />
