<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Chip from '../../components/Chip.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import GridTable from '../../components/GridTable.svelte';
  import Link from '../../components/Link.svelte';
  import Notice from '../../components/Notice.svelte';
  import ReasonBadge from '../../components/ReasonBadge.svelte';
  import Select from '../../components/Select.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import TextField from '../../components/TextField.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError } from '../../api/errors';
  import type { RiskRegister, RiskRegisterTag } from '../../api/types';
  import { formatDate, formatDateTime } from '../../format';
  import { currentLocale, t } from '../../i18n';
  import { daysBetween } from '../../reports/chart';
  import {
    asOfErrorKey,
    isAsOfText,
    isDateText,
    linkTarget,
    ratingTone,
    RISK_REGISTER_ADDRESS,
    riskRegisterAddress,
  } from '../../reports/reports';
  import ReportPage from './ReportPage.svelte';

  /**
   * The risk register as of a day or a tag (`/reports/risk-register?as-of=`, UC-ISMS-3): the released entries as they
   * were at the commit that the day or the tag selects, each opening as it was then. The control takes a day or the name
   * of a tag, with the tags of the register to choose from. What the server refuses is said beside the field, and the
   * value stays in it: a day that has not come, a name that is no tag, a value that is neither. A register that cannot be
   * built while the Git server is down is a notice with the way back to the register as it is now.
   */
  interface Props {
    /** The admitted query of the address: `as-of`. */
    query?: Record<string, string>;
    /** Opens an address inside the app. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
  }

  /** Days ahead within which a review counts as due soon (rest-api.adoc, Reports Requests). */
  const SOON_DAYS = 30;

  let { query = {}, onnavigate }: Props = $props();

  let asOf = $derived(query['as-of']);
  let register = $state<RiskRegister | null>(null);
  /** The tags of the register: the last answer that had them, so the picker survives a refusal. */
  let tags = $state<RiskRegisterTag[]>([]);
  let failure = $state<string | null>(null);
  let forbidden = $state(false);
  let unavailable = $state(false);
  /** The key of the server's refusal of the value, shown beside the field. */
  let refused = $state<string | null>(null);
  let typed = $state('');
  /** The key of the browser's own check of what was typed. */
  let typedError = $state<string | null>(null);

  $effect(() => {
    const value = asOf;
    typed = value ?? '';
    typedError = null;
    register = null;
    failure = null;
    forbidden = false;
    unavailable = false;
    refused = null;
    let current = true;
    apiClient.getRiskRegister(value).then(
      (loaded) => {
        if (!current) return;
        register = loaded;
        tags = loaded.tags;
      },
      (error: unknown) => {
        if (!current) return;
        if (isApiError(error) && error.outcome === 'FORBIDDEN') {
          forbidden = true;
        } else if (isApiError(error) && error.outcome === 'GIT_UNAVAILABLE') {
          unavailable = true;
        } else if (isApiError(error) && error.outcome === 'VALIDATION') {
          const code = error.errors.find((entry) => entry.pointer === '/as-of')?.code ?? 'PATTERN';
          refused = asOfErrorKey(code);
          // The tags are offered although the value was refused: the register as of now names them.
          if (tags.length === 0) {
            apiClient.getRiskRegister().then(
              (now) => {
                if (current) tags = now.tags;
              },
              () => {},
            );
          }
        } else {
          failure = errorMessageKey(error);
        }
      },
    );
    return () => {
      current = false;
    };
  });

  let tagValue = $derived(tags.some((entry) => entry.tag === typed.trim()) ? typed.trim() : '');
  let error = $derived(typedError ?? refused);

  function show() {
    const text = typed.trim();
    if (text !== '' && !isAsOfText(text)) {
      typedError = 'reports.risk.asof.pattern';
      return;
    }
    typedError = null;
    onnavigate(riskRegisterAddress(text === '' ? undefined : text));
  }

  /** What the page says it read: now, a day or a tag. */
  let reading = $derived.by(() => {
    if (!register) return '';
    const date = formatDate(register.asOf.date, $currentLocale);
    if (register.asOf.requested === null) return $t('reports.risk.read.now');
    return register.asOf.tag
      ? $t('reports.risk.read.tag', { tag: register.asOf.tag, date })
      : $t('reports.risk.read.date', { date });
  });
  /** A day without a commit of its own: the commit read is an earlier one. */
  let earlierCommit = $derived(
    register !== null &&
      register.asOf.tag === null &&
      register.asOf.requested !== null &&
      isDateText(register.asOf.requested) &&
      register.asOf.at !== null &&
      register.asOf.at.slice(0, 10) !== register.asOf.date,
  );

  /** The review of an entry of the register as it is now; the register of a past day is only read. */
  function reviewOf(due: string | null): { overdue: number } | { soon: number } | null {
    if (!register || register.asOf.requested !== null || due === null) return null;
    const days = daysBetween(register.asOf.date, due);
    if (days < 0) return { overdue: -days };
    return days <= SOON_DAYS ? { soon: days } : null;
  }
</script>

<ReportPage
  title={$t('reports.risk.title')}
  intro={$t('reports.risk.lede')}
  address={RISK_REGISTER_ADDRESS}
  testId="risk-register-view"
>
  <form
    class="control"
    onsubmit={(event) => {
      event.preventDefault();
      show();
    }}
    novalidate
    data-testid="risk-asof-form"
  >
    <TextField
      label={$t('reports.risk.asof')}
      bind:value={typed}
      hint={$t('reports.risk.asof.hint')}
      error={error ? $t(error) : null}
      testId="risk-asof"
    />
    {#if tags.length > 0}
      <Select
        label={$t('reports.risk.asof.tag')}
        options={tags.map((entry) => ({
          value: entry.tag,
          label: $t('reports.risk.asof.tag.option', {
            tag: entry.tag,
            date: formatDate(entry.at, $currentLocale),
          }),
        }))}
        value={tagValue}
        placeholder={$t('reports.risk.asof.tag.placeholder')}
        onchange={(value) => {
          typed = value;
          typedError = null;
        }}
        testId="risk-tag"
      />
    {/if}
    <div class="control__acts">
      <Button type="submit" variant="primary" data-testid="risk-show">
        {$t('reports.risk.asof.show')}
      </Button>
      {#if asOf !== undefined}
        <Link href={riskRegisterAddress()} data-testid="risk-now"
          >{$t('reports.risk.asof.now')}</Link
        >
      {/if}
    </div>
  </form>

  {#if forbidden}
    <div data-testid="risk-forbidden">
      <Notice
        tone="info"
        title={$t('reports.risk.forbidden.title')}
        body={$t('reports.risk.forbidden.body')}
      />
    </div>
  {:else if unavailable}
    <div data-testid="risk-git-unavailable">
      <Notice
        tone="attention"
        title={$t('reports.risk.git.title')}
        body={$t('reports.risk.git.body')}
        live
      />
    </div>
  {:else if refused}
    <div data-testid="risk-refused">
      <Notice
        tone="info"
        title={$t('reports.risk.invalid.title')}
        body={$t('reports.risk.invalid.body')}
        live
      />
    </div>
  {:else if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {:else if register === null}
    <p class="muted">{$t('common.loading')}</p>
  {:else}
    <section class="section" aria-labelledby="risk-reading" data-testid="risk-result">
      <h2 class="section__title" id="risk-reading">{reading}</h2>
      {#if register.asOf.commit}
        <dl class="facts">
          <div>
            <dt>{$t('reports.risk.fact.commit')}</dt>
            <dd><Chip value={register.asOf.commit} /></dd>
          </div>
          {#if register.asOf.at}
            <div>
              <dt>{$t('reports.risk.fact.at')}</dt>
              <dd>{formatDateTime(register.asOf.at, $currentLocale)}</dd>
            </div>
          {/if}
        </dl>
        {#if earlierCommit}
          <p class="note" data-testid="risk-earlier-commit">{$t('reports.risk.commit-day')}</p>
        {/if}
      {:else if register.asOf.requested !== null}
        <p class="note" data-testid="risk-before-first">{$t('reports.risk.before-first')}</p>
      {/if}
      {#if register.risks.length === 0}
        <EmptyState
          icon="state.na"
          title={$t('reports.risk.empty.title')}
          body={register.asOf.requested === null
            ? $t('reports.risk.empty.now')
            : $t('reports.risk.empty.date', {
                date: formatDate(register.asOf.date, $currentLocale),
              })}
        />
      {:else}
        <p class="count" data-testid="risk-count">
          {$t('reports.risk.count', { count: register.risks.length })}
        </p>
        <GridTable
          caption={$t('reports.risk.table')}
          heads={[
            $t('reports.risk.col.risk'),
            $t('reports.risk.col.rating'),
            $t('reports.risk.col.treatment'),
            $t('reports.risk.col.owner'),
            $t('reports.risk.col.version'),
            $t('reports.risk.col.review'),
            $t('reports.risk.col.origin'),
          ]}
          testId="risk-table"
        >
          {#each register.risks as risk (risk.id)}
            {@const review = reviewOf(risk.reviewDue)}
            <tr data-testid="risk-row-{risk.entry}">
              <th scope="row">
                <span class="name">
                  <Chip value={risk.id} />
                  {#if linkTarget(risk.address)}
                    <Link href={risk.address} data-testid="risk-link-{risk.entry}"
                      >{risk.title}</Link
                    >
                  {:else}
                    <span data-testid="risk-link-{risk.entry}">{risk.title}</span>
                  {/if}
                </span>
              </th>
              <td data-label={$t('reports.risk.col.rating')}>
                <StatusLabel
                  tone={ratingTone(risk.rating)}
                  label={$t(`reports.rating.${risk.rating}`)}
                />
              </td>
              <td data-label={$t('reports.risk.col.treatment')}>
                {$t(`reports.treatment.${risk.treatment}`)}
              </td>
              <td data-label={$t('reports.risk.col.owner')}>{risk.owner.name}</td>
              <td data-label={$t('reports.risk.col.version')}>
                {$t('reports.risk.version', {
                  version: risk.version,
                  date: formatDate(risk.releasedAt, $currentLocale),
                })}
              </td>
              <td data-label={$t('reports.risk.col.review')}>
                <span class="cell">
                  {#if risk.reviewDue === null}
                    {$t('reports.none')}
                  {:else}
                    {#if review && 'overdue' in review}
                      <ReasonBadge
                        tone="danger"
                        label={$t('reports.due.overdue', { count: review.overdue })}
                        testId="risk-review-{risk.entry}"
                      />
                    {:else if review}
                      <ReasonBadge
                        tone="attention"
                        label={$t('reports.due.soon', { count: review.soon })}
                        testId="risk-review-{risk.entry}"
                      />
                    {/if}
                    <span class="date">{formatDate(risk.reviewDue, $currentLocale)}</span>
                  {/if}
                </span>
              </td>
              <td data-label={$t('reports.risk.col.origin')}>
                {#if risk.reference && linkTarget(risk.reference.address)}
                  <Link href={risk.reference.address}>{risk.reference.title}</Link>
                {:else if risk.reference}
                  {risk.reference.title}
                {:else}
                  {$t('reports.none')}
                {/if}
              </td>
            </tr>
          {/each}
        </GridTable>
      {/if}
    </section>
  {/if}
</ReportPage>

<style>
  .muted {
    color: var(--color-text-muted);
  }

  .note {
    max-inline-size: var(--measure);
    color: var(--color-text-secondary);
  }

  /* The day and its hint need the wider column; the tags of the register are a choice beside it. */
  .control {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--space-4);
  }

  @media (min-width: 768px) {
    .control {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    }
  }

  .control__acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-5);
    grid-column: 1 / -1;
  }

  .control__acts :global(.link) {
    display: inline-block;
    padding-block: var(--space-3);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .section__title {
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
    font-weight: var(--weight-semibold);
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-8);
    margin: 0;
  }

  .facts dt {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .facts dd {
    margin: 0;
  }

  .count {
    font-weight: var(--weight-medium);
  }

  /* A cell of several lines is one item of the stacked row, so its lines stay in the column of the value. */
  .cell {
    display: block;
  }

  .date {
    display: block;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .name {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    font-family: var(--font-serif);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
  }
</style>
