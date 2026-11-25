<script lang="ts" module>
  /** The kinds of objects the app names; the category kinds carry their tint on the icon. */
  export type Kind =
    | 'samm'
    | 'scope'
    | 'assessment'
    | 'practice'
    | 'threat-model'
    | 'incident'
    | 'isms'
    | 'catalog'
    | 'report';

  /** The icon of every kind. */
  export const KIND_ICONS: Record<Kind, string> = {
    samm: 'lens.samm',
    scope: 'state.target',
    assessment: 'lens.samm',
    practice: 'kind.document',
    'threat-model': 'lens.threat-models',
    incident: 'lens.incidents',
    isms: 'lens.isms',
    catalog: 'lens.catalogs',
    report: 'lens.reports',
  };

  /** The category tint of a kind, or nothing for a neutral kind. */
  const TINTS: Partial<Record<Kind, string>> = {
    samm: 'samm',
    assessment: 'samm',
    practice: 'samm',
    scope: 'samm',
    'threat-model': 'threat-model',
    incident: 'incident',
    isms: 'isms',
  };
</script>

<script lang="ts">
  import Icon from './Icon.svelte';

  /**
   * What kind of object something is: its icon in the category's tint and its word. The tint is on the icon only;
   * the word stays in text colour.
   */
  interface Props {
    /** The kind. */
    kind: Kind;
    /** The word, from the catalogue. */
    label: string;
    /** Whether only the icon shows; the word becomes its accessible name. */
    iconOnly?: boolean;
  }

  let { kind, label, iconOnly = false }: Props = $props();
</script>

<span class="kind" data-kind={kind}>
  <span class="kind__icon kind__icon--{TINTS[kind] ?? 'neutral'}">
    <Icon name={KIND_ICONS[kind]} size={16} label={iconOnly ? label : undefined} />
  </span>
  {#if !iconOnly}
    <span class="kind__word">{label}</span>
  {/if}
</span>

<style>
  .kind {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    line-height: var(--line-height-sm);
    color: var(--color-text-secondary);
  }

  .kind__icon {
    display: inline-flex;
    color: var(--color-text-muted);
  }

  .kind__icon--samm {
    color: var(--color-kind-samm);
  }

  .kind__icon--threat-model {
    color: var(--color-kind-threat-model);
  }

  .kind__icon--incident {
    color: var(--color-kind-incident);
  }

  .kind__icon--isms {
    color: var(--color-kind-isms);
  }
</style>
