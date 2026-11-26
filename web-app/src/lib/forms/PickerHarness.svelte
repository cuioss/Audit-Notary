<script lang="ts">
  import PersonPicker from './PersonPicker.svelte';
  import { provideFormServices, type FormServices } from './services';

  /**
   * A person picker on its own, for the tests of the form kit: no form, only the services it asks.
   */
  interface Props {
    services: FormServices;
    label: string;
    onchange: (next: string | undefined) => void;
  }

  let { services, label, onchange }: Props = $props();

  // The services of a harness never change: read once, as the form does.
  // svelte-ignore state_referenced_locally
  provideFormServices(services);
</script>

<PersonPicker {label} {onchange} />
