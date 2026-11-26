<script lang="ts">
  import { onMount } from 'svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import KindMark, { type Kind } from '../components/KindMark.svelte';
  import Link from '../components/Link.svelte';
  import Notice from '../components/Notice.svelte';
  import ReasonBadge from '../components/ReasonBadge.svelte';
  import Sheet from '../components/Sheet.svelte';
  import MascotFigure from '../brand/MascotFigure.svelte';
  import { apiClient } from '../api/client';
  import { errorMessageKey } from '../api/errors';
  import type { DueItem } from '../api/types';
  import { dayParts, daysFrom, formatDate, formatRelativeDay } from '../format';
  import { currentLocale, t } from '../i18n';
  import { parseHref } from '../routes';
  import { session } from '../stores/app';
  import { now } from '../stores/clock';
  import DashboardPage from '../templates/DashboardPage.svelte';

  /**
   * The start page (lens *Due*, UC-DOC-9): the person's daybook. Deadlines, reviews and releases waiting for them,
   * grouped into overdue, today, this week and later, one day after the other with the day in the gutter, as a
   * register's daybook is kept. An overdue entry carries a box, because it needs the person; every other entry says
   * its day quietly. The grouping follows the clock, so "today" becomes "overdue" without a reload.
   *
   * A release request (UC-DOC-8) shows who asked and the comment on its entry, the requester's `release` item and the
   * approvers' `review` item alike, so the comment is read before the document is opened. The list is read again when
   * the event stream names a request or a document that moved along its workflow.
   */
  let items = $state<DueItem[] | null>(null);
  let failure = $state<string | null>(null);

  const KINDS: Record<DueItem['lens'], Kind> = {
    samm: 'samm',
    'threat-models': 'threat-model',
    incidents: 'incident',
    isms: 'isms',
    // The neutral document mark of the generic documents lens.
    categories: 'document',
  };

  const GROUPS = ['overdue', 'today', 'week', 'later'] as const;
  type Group = (typeof GROUPS)[number];

  /** The number of the latest reading; the answer of an older one is dropped. */
  let latest = 0;

  async function load() {
    const read = ++latest;
    failure = null;
    try {
      const list = await apiClient.getDue();
      if (read !== latest) return;
      // An address the app has no view for is not offered.
      items = list.items.filter((item) => parseHref(item.address) !== null);
    } catch (error) {
      if (read === latest) failure = errorMessageKey(error);
    }
  }

  function groupOf(days: number): Group {
    if (days < 0) return 'overdue';
    if (days === 0) return 'today';
    if (days < 7) return 'week';
    return 'later';
  }

  let grouped = $derived.by(() => {
    const result: { group: Group; days: { date: string; items: DueItem[] }[] }[] = [];
    if (!items) return result;
    const sorted = [...items].sort((a, b) => a.due.localeCompare(b.due));
    for (const group of GROUPS) {
      const inGroup = sorted.filter((item) => groupOf(daysFrom(item.due, $now)) === group);
      if (inGroup.length === 0) continue;
      const days: { date: string; items: DueItem[] }[] = [];
      for (const item of inGroup) {
        const day = days.at(-1);
        if (day && day.date === item.due) day.items.push(item);
        else days.push({ date: item.due, items: [item] });
      }
      result.push({ group, days });
    }
    return result;
  });

  let overdue = $derived(items?.filter((item) => daysFrom(item.due, $now) < 0).length ?? 0);
  let week = $derived(
    items?.filter((item) => {
      const days = daysFrom(item.due, $now);
      return days >= 0 && days < 7;
    }).length ?? 0,
  );

  /** Reads the list again after an event, without the loading state or a failure that would replace the list. */
  async function refresh() {
    const read = ++latest;
    try {
      const list = await apiClient.getDue();
      if (read !== latest) return;
      items = list.items.filter((item) => parseHref(item.address) !== null);
      failure = null;
    } catch (error) {
      // The list on the page stays: it was true when it was read. Only a page that has none says why.
      if (read === latest && items === null) failure = errorMessageKey(error);
    }
  }

  onMount(() => {
    void load();
    return apiClient.subscribeEvents((event) => {
      if (event === 'release-requested' || event === 'document-transitioned') void refresh();
    });
  });

  /** @returns who asked for the release, in the words of the person looking: "You" for their own request */
  function askedBy(item: DueItem): string {
    return item.requestedBy?.pseudonym && item.requestedBy.pseudonym === $session?.user.pseudonym
      ? $t('due.request.own')
      : $t('due.request.by', { name: item.requestedBy?.name ?? '' });
  }
</script>

<DashboardPage title={$t('due.title')} intro={$t('due.intro')} testId="due-view">
  {#if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {:else if items === null}
    <p class="due__loading">{$t('common.loading')}</p>
  {:else if items.length === 0}
    <div class="due__calm">
      <MascotFigure pose="at-work" />
      <EmptyState title={$t('due.empty')} body={$t('due.empty.body')} />
    </div>
  {:else}
    <p class="due__summary" data-testid="due-summary">
      {$t('due.summary', { overdue, week })}
    </p>
    <div class="due__sheet">
      <Sheet testId="due-list">
        <div class="daybook">
          {#each grouped as { group, days } (group)}
            <section class="daybook__group" aria-labelledby="due-{group}">
              <h2
                class="daybook__group-title"
                class:daybook__group-title--overdue={group === 'overdue'}
                id="due-{group}"
              >
                {$t(`due.group.${group}`)}
              </h2>
              {#each days as day (day.date)}
                {@const parts = dayParts(day.date, $currentLocale)}
                <div class="daybook__day">
                  <p class="daybook__date">
                    <span class="sr-only">{formatDate(day.date, $currentLocale, 'long')}</span>
                    <span class="daybook__numeral" aria-hidden="true">{parts.day}</span>
                    <span class="daybook__month" aria-hidden="true"
                      >{parts.month} {parts.weekday}</span
                    >
                  </p>
                  <ul class="daybook__entries">
                    {#each day.items as item (item.address + item.kind)}
                      {@const days = daysFrom(item.due, $now)}
                      <li class="entry" data-kind={item.kind} data-lens={item.lens}>
                        <span class="entry__mark">
                          <KindMark
                            kind={KINDS[item.lens]}
                            label={$t(`lens.${item.lens}`)}
                            iconOnly
                          />
                        </span>
                        <span class="entry__body">
                          <span class="entry__title">
                            <Link
                              href={item.address}
                              aria-label={$t('due.open', { title: item.title })}
                            >
                              {item.title}
                            </Link>
                          </span>
                          <span class="entry__meta">
                            {$t('due.kind-in', {
                              kind: $t(`due.kind.${item.kind}`),
                              lens: $t(`lens.${item.lens}`),
                            })}
                          </span>
                          {#if item.requestedBy && item.comment !== undefined}
                            <span class="entry__request" data-testid="due-request">
                              <span class="entry__asked">{askedBy(item)}</span>
                              <span class="entry__comment">{item.comment}</span>
                            </span>
                          {/if}
                        </span>
                        <span class="entry__when">
                          {#if days < 0}
                            <ReasonBadge
                              tone="danger"
                              label={$t('due.overdue', { count: -days })}
                              testId="due-overdue"
                            />
                          {:else}
                            <span class="entry__relative">
                              {$t('due.due-relative', {
                                when: formatRelativeDay(item.due, $currentLocale, $now),
                              })}
                            </span>
                          {/if}
                        </span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/each}
            </section>
          {/each}
        </div>
      </Sheet>
    </div>
  {/if}
</DashboardPage>

<style>
  .due__sheet {
    max-inline-size: 68rem;
  }

  .due__loading {
    color: var(--color-text-muted);
  }

  .due__summary {
    margin-block-start: calc(var(--space-2) * -1);
    color: var(--color-text-primary);
    font-weight: var(--weight-medium);
  }

  .due__calm {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-block: var(--space-8);
  }

  .due__calm :global(.mascot) {
    max-inline-size: 9rem;
  }

  .daybook {
    display: flex;
    flex-direction: column;
    gap: var(--space-10);
  }

  .daybook__group-title {
    padding-block-end: var(--space-2);
    margin-block-end: var(--space-1);
    border-block-end: 2px solid var(--color-text-primary);
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
  }

  .daybook__group-title--overdue {
    color: var(--color-danger);
    border-block-end-color: var(--color-danger);
  }

  .daybook__day {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    gap: var(--space-4);
    padding-block: var(--space-4);
    border-block-end: 1px solid var(--color-border);
  }

  .daybook__date {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .daybook__numeral {
    font-family: var(--font-serif);
    font-size: var(--text-3xl);
    line-height: 1;
    font-weight: var(--weight-semibold);
    font-feature-settings: 'lnum' 1;
  }

  .daybook__month {
    margin-block-start: var(--space-1);
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-muted);
  }

  .daybook__entries {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    list-style: none;
  }

  .entry {
    display: grid;
    grid-template-columns: 1.5rem minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-3);
  }

  .entry__mark {
    display: inline-flex;
    padding-block-start: 3px;
  }

  .entry__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .entry__title {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
    font-weight: var(--weight-semibold);
  }

  .entry__title :global(.link) {
    color: var(--color-text-primary);
    text-decoration-color: var(--color-border-strong);
  }

  .entry__title :global(.link:hover) {
    color: var(--color-brand);
    text-decoration-color: currentcolor;
  }

  .entry__meta,
  .entry__relative {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .entry__request {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-block-start: var(--space-1);
    max-inline-size: var(--measure);
  }

  .entry__asked {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-secondary);
  }

  .entry__comment {
    padding-inline-start: var(--space-3);
    border-inline-start: 3px solid var(--color-border-strong);
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .entry__when {
    padding-block-start: 4px;
    white-space: nowrap;
  }

  @media (max-width: 599px) {
    .daybook__day {
      grid-template-columns: 3.5rem minmax(0, 1fr);
      gap: var(--space-3);
    }

    .entry {
      grid-template-columns: 1.25rem minmax(0, 1fr);
    }

    .entry__when {
      grid-column: 2;
      padding-block-start: 0;
    }
  }
</style>
