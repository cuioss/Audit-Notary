<script lang="ts">
  import GridTable from '../../components/GridTable.svelte';
  import ReasonBadge from '../../components/ReasonBadge.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import type { IncidentDeadline, JsonObject } from '../../api/types';
  import { labelOf, optionOf } from '../../forms/texts';
  import { formatDateTime } from '../../format';
  import {
    deadlineOfNotification,
    INCIDENT_CATEGORY,
    notificationRows,
    partKind,
  } from '../../incidents/model';
  import { currentLocale, messagesStore, t } from '../../i18n';

  /**
   * The notices of an incident that were sent (UC-IR-2): one row for each named member of the part `notifications` and for
   * every entry of its lists, with the time, the recipient (an office or an organisation, never a person), the channel and
   * the reference the authority gave. A notice that meets a deadline says where that deadline stands, so the table
   * answers "was it in time" without the clock beside it.
   *
   * The table only reads; a notice is recorded in the form below it.
   */
  interface Props {
    /** The value of the part `notifications`, with the person's changes that are not saved. */
    value: JsonObject | undefined;
    /** The deadlines of the incident. */
    deadlines: IncidentDeadline[];
  }

  let { value, deadlines }: Props = $props();

  const kind = partKind('notifications');

  let rows = $derived(notificationRows(value));
</script>

{#if rows.length === 0}
  <p class="meta" data-testid="notifications-none">{$t('incidents.notifications.none')}</p>
{:else}
  <GridTable
    caption={$t('incidents.notifications.table')}
    heads={[
      $t('incidents.notifications.col.notice'),
      $t('incidents.notifications.col.sent'),
      $t('incidents.notifications.col.recipient'),
      $t('incidents.notifications.col.channel'),
      $t('incidents.notifications.col.deadline'),
    ]}
    testId="notifications-table"
  >
    {#each rows as row (row.key)}
      {@const deadline = deadlineOfNotification(row, deadlines)}
      <tr data-testid="notification-{row.key.replaceAll('/', '-')}">
        <th scope="row">
          {labelOf($messagesStore, INCIDENT_CATEGORY, kind, [row.member], row.member)}
          {#if row.element !== null}
            <span class="meta"
              >{$t('incidents.notifications.number', { number: row.element + 1 })}</span
            >
          {/if}
        </th>
        <td data-label={$t('incidents.notifications.col.sent')}>
          <span class="cell">
            <time datetime={row.sentAt}>{formatDateTime(row.sentAt, $currentLocale)}</time>
            {#if row.reference}
              <span class="meta">
                {$t('incidents.notifications.reference', { reference: row.reference })}
              </span>
            {/if}
          </span>
        </td>
        <td data-label={$t('incidents.notifications.col.recipient')}>
          <span class="cell">
            {row.recipient}
            {#if row.comment}<span class="meta">{row.comment}</span>{/if}
          </span>
        </td>
        <td data-label={$t('incidents.notifications.col.channel')}>
          {optionOf($messagesStore, INCIDENT_CATEGORY, kind, [row.member, 'channel'], row.channel)}
        </td>
        <td data-label={$t('incidents.notifications.col.deadline')}>
          {#if deadline === null}
            <span class="meta">{$t('incidents.notifications.no-deadline')}</span>
          {:else if deadline.status === 'MISSED' && deadline.sentAt === null}
            <ReasonBadge tone="danger" label={$t('incidents.clock.status.MISSED')} />
          {:else if deadline.status === 'MISSED'}
            <StatusLabel tone="danger" label={$t('incidents.notifications.late')} />
          {:else}
            <StatusLabel
              tone={deadline.status === 'MET' ? 'success' : 'running'}
              label={$t(`incidents.clock.status.${deadline.status}`)}
            />
          {/if}
        </td>
      </tr>
    {/each}
  </GridTable>
{/if}

<style>
  .meta {
    display: block;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .cell {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
</style>
