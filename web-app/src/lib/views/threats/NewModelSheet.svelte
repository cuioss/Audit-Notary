<script lang="ts">
  import EmptyState from '../../components/EmptyState.svelte';
  import Link from '../../components/Link.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetHead from '../../components/SheetHead.svelte';
  import type { ThreatModelService } from '../../api/types';
  import { t } from '../../i18n';
  import { serviceAddress } from '../../threats/model';

  /**
   * The address of a new threat model of a service (`/threat-models/{service}/new`). The recipe wizard that fills it step
   * by step is the next part of the lens; until it is built the address is routed here and says so, so that the act
   * *New threat model* breaks nothing.
   */
  interface Props {
    /** The service page, or `null` while it is read. */
    service: ThreatModelService | null;
  }

  let { service }: Props = $props();
</script>

<Sheet testId="new-threat-model-sheet" marginLabel={$t('sheet.margin')}>
  <SheetHead
    kind="threat-model"
    kindLabel={$t('threats.kind.model')}
    title={$t('threats.new.title')}
    size="title"
    lede={service ? $t('threats.new.lede', { service: service.service.name }) : undefined}
  />
  <EmptyState
    icon="state.na"
    title={$t('lens.placeholder.title')}
    body={$t('lens.placeholder.body')}
  >
    {#snippet actions()}
      {#if service}
        <Link href={serviceAddress(service.service.id)}>{service.service.name}</Link>
      {/if}
    {/snippet}
  </EmptyState>
</Sheet>
