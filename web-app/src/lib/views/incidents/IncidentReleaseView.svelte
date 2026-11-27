<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import DeadlineClock from '../../components/DeadlineClock.svelte';
  import Link from '../../components/Link.svelte';
  import ReleaseSeal from '../../components/ReleaseSeal.svelte';
  import { apiClient } from '../../api/client';
  import type { ApiError } from '../../api/errors';
  import { errorMessageKey, isApiError } from '../../api/errors';
  import type { CategorySchema, DocumentDiff, IncidentRead } from '../../api/types';
  import { actionsOn, fieldLabel } from '../../documents/categories';
  import { versionOfTag } from '../../documents/history';
  import { createFormServices, provideFormServices } from '../../forms/services';
  import { formatDateTime } from '../../format';
  import { currentLocale, messagesStore, t } from '../../i18n';
  import {
    clockRow,
    DATA_PART,
    INCIDENT_CATEGORY,
    INCIDENT_KIND,
    incidentAddress,
    openStages,
    partKind,
    releaseAddress,
    splitPointer,
    stageNames,
    yearAddress,
  } from '../../incidents/model';
  import {
    groupIncidentDiff,
    openStagesOf,
    readSchemaOf,
    stageCounts,
    stillDue,
  } from '../../incidents/release';
  import { session } from '../../stores/app';
  import { breadcrumb } from '../../stores/breadcrumb';
  import { now } from '../../stores/clock';
  import DiffValue from '../documents/DiffValue.svelte';
  import ReleaseFlow, {
    type ReleaseChange,
    type ReleaseCheck,
    type ReleaseDone,
    type ReleaseGroup,
    type ReleaseRefusal,
    type ReleaseTexts,
  } from '../documents/ReleaseFlow.svelte';
  import NotFoundView from '../NotFoundView.svelte';

  /**
   * The review and release of an incident (UC-IR-3, AUN-WEB-6): the address `/incidents/{year}/{incident}/release`. It reads
   * the incident, its schema and the structured diff against the last release, hands them to the generic `ReleaseFlow`, and
   * draws what belongs to an incident: the facts of the incident as the stage, the changes by stage (the diff's parts), the
   * deadlines that are still open before the person confirms, the seal once the release is made, and the clock that stops.
   * The act reads "Release"; that the person confirms their identity once more is the flow's line in the margin.
   *
   * An incident is released once and is frozen afterwards, so a notice that is not recorded by then can no longer be
   * recorded in it: the page lists the open deadlines and says so. It does not refuse the release for them (the owner has
   * not decided that, rest-api.adoc, Decided Provisionally, point 46). A release the server refuses because a stage is not
   * completed names the stages as links to their tabs.
   */
  interface Props {
    /** The values of the address: `year` and `incident`. */
    params: Record<string, string>;
  }

  let { params }: Props = $props();

  // One reading of references for the whole record: the names of people and the titles of documents are asked once.
  provideFormServices(createFormServices());

  let incident = $state<IncidentRead | null>(null);
  let schemas = $state<CategorySchema | null>(null);
  let diff = $state<DocumentDiff | null>(null);
  let failure = $state<string | null>(null);
  let missing = $state(false);
  /** What the release made, once it is made: the clock stops there. */
  let done = $state<ReleaseDone | null>(null);

  let latest = 0;

  /** Reads the incident and its record: the second is what the approver reviews, so it is read after the first. */
  async function readRecord() {
    const read = ++latest;
    try {
      const loaded = await apiClient.getIncident(params.year, params.incident);
      const [loadedSchemas, loadedDiff] = await Promise.all([
        schemas ?? apiClient.getCategorySchema(INCIDENT_CATEGORY),
        // A released incident has nothing to release: its record is the release it was made from, unchanged.
        loaded.state === 'released'
          ? Promise.resolve<DocumentDiff>({
              repository: loaded.repository,
              id: loaded.id,
              from: loaded.release?.tag ?? null,
              to: 'working',
              sections: [],
            })
          : apiClient.getDiff(loaded.repository, loaded.id),
      ]);
      if (read !== latest) return;
      if (!loadedSchemas.kinds.some((entry) => entry.id === INCIDENT_KIND)) {
        missing = true;
        return;
      }
      incident = loaded;
      schemas = loadedSchemas;
      diff = loadedDiff;
      failure = null;
    } catch (error) {
      if (read !== latest) return;
      if (isApiError(error) && (error.outcome === 'NOT_FOUND' || error.outcome === 'VALIDATION')) {
        missing = true;
      } else {
        failure = errorMessageKey(error);
      }
    }
  }

  async function reload() {
    await readRecord();
  }

  $effect(() => {
    void params.year;
    void params.incident;
    untrack(() => {
      failure = null;
      void readRecord();
    });
  });

  onDestroy(() => {
    latest += 1;
    breadcrumb.set([]);
  });

  let incidentHref = $derived(incidentAddress(params.year, params.incident));
  let releaseHref = $derived(releaseAddress(params.year, params.incident));

  $effect(() => {
    breadcrumb.set(
      !missing && incident
        ? [
            {
              label: $t('incidents.year.title', { year: params.year }),
              href: yearAddress(params.year),
            },
            { label: incident.title, href: incidentHref },
            { label: $t('lens.release'), href: releaseHref },
          ]
        : [],
    );
  });

  let rights = $derived(incident ? actionsOn($session, incident.repository) : []);
  let kindSchema = $derived(
    schemas?.kinds.find((entry) => entry.id === INCIDENT_KIND)?.schema ?? null,
  );
  let submitted = $derived(incident?.history.find((line) => line.kind === 'submit') ?? null);
  let from = $derived(diff?.from ? versionOfTag(diff.from) : null);

  /** @returns the name of a stage */
  function stageName(id: string): string {
    return $t(`category.${INCIDENT_CATEGORY}.stage.${id}`);
  }

  let names = $derived(stageNames(incident?.stages ?? [], stageName));

  let unavailable = $derived.by(() => {
    if (!incident) return null;
    if (incident.state === 'released') return $t('documents.release.state.released');
    if (!rights.includes('approve')) return $t('release.no-right');
    if (!incident.transitions.some((transition) => transition.release)) {
      return incident.state === 'draft'
        ? $t('documents.release.state.draft')
        : $t('documents.release.state.not-offered');
    }
    return null;
  });

  let texts: ReleaseTexts = $derived({
    title: $t('release.title', { title: incident?.title ?? $t('common.loading') }),
    intro: $t('incidents.release.intro'),
    doneTitle: $t('release.done.title', { title: incident?.title ?? '' }),
    doneIntro: $t('incidents.release.done.intro'),
    recordLede:
      diff === null
        ? ''
        : from === null
          ? $t('documents.release.record.first')
          : diff.sections.length === 0
            ? $t('documents.release.record.none', { version: from })
            : $t('documents.release.record.since', { version: from }),
    back: $t('incidents.release.back'),
    open: $t('incidents.release.open'),
    passwordLede: $t('release.password.lede', { title: incident?.title ?? '' }),
    releasedMeanwhile: 'documents.release.released-meanwhile',
    count: (count) => $t('documents.release.record.count', { count }),
  });

  /** @returns the words of a field, by its part and its pointer into the value of the part */
  function labelOfPart(part: string, pointer: string): string {
    // The sign-off of a stage is no field of its form: the diff names it as the member `completion` of the part.
    if (pointer === '/completion') return $t('incidents.release.completion');
    return fieldLabel($messagesStore, INCIDENT_CATEGORY, partKind(part), pointer);
  }

  /** @returns the title of a group of the record: the name of the stage, or "Title" for the title of the incident */
  function titleOf(part: string): string {
    return part === DATA_PART ? $t('incidents.title.heading') : (names[part] ?? part);
  }

  let incidentGroups = $derived(diff ? groupIncidentDiff(diff, titleOf, labelOfPart) : []);
  let groups: ReleaseGroup[] = $derived(
    incidentGroups.map((group) => ({
      key: group.key,
      title: group.title,
      changes: group.changes.map((change): ReleaseChange => ({
        key: change.key,
        pointer: `/${change.part}${change.pointer}`,
        label: change.label,
        before: change.before,
        after: change.after,
      })),
    })),
  );

  /** The instant the clock stopped at: the release just made, or the release the incident was read with; `null` while it runs. */
  let stoppedAt = $derived(done?.at ?? (incident?.state === 'released' ? incident.asOf : null));
  /** The instant the clock is told against: the present while it runs, the release once it has stopped. */
  let clockAt = $derived(stoppedAt !== null ? new Date(stoppedAt) : $now);
  /** The deadlines that are still a duty, as the clock words them. */
  let dueRows = $derived(
    (incident?.deadlines ?? [])
      .filter(stillDue)
      .map((deadline) =>
        clockRow(deadline, clockAt, $t, (instant) => formatDateTime(instant, $currentLocale)),
      ),
  );
  let stagesWaiting = $derived(openStages(incident?.stages ?? []));
  let counts = $derived(stageCounts(incident?.stages ?? []));

  let checks: ReleaseCheck[] = $derived([
    stagesWaiting.length === 0
      ? { key: 'stages', text: $t('incidents.release.check.stages'), icon: 'state.done' }
      : {
          key: 'stages',
          text: $t('incidents.release.check.stages-open', {
            count: stagesWaiting.length,
            stages: stagesWaiting.map((entry) => names[entry.id] ?? entry.id).join(', '),
          }),
          icon: 'state.open',
          open: true,
        },
    ...(incident && incident.deadlines.length > 0
      ? [
          dueRows.length === 0
            ? {
                key: 'deadlines',
                text: $t('incidents.release.check.deadlines-none'),
                icon: 'state.done' as const,
              }
            : {
                key: 'deadlines',
                text: $t('incidents.release.check.deadlines-open', { count: dueRows.length }),
                icon: 'state.open' as const,
                open: true,
              },
        ]
      : []),
    ...(submitted
      ? [
          {
            key: 'submitted',
            text: $t('release.check.submitted', {
              name: submitted.by.name,
              time: formatDateTime(submitted.at, $currentLocale),
            }),
            icon: 'state.done' as const,
          },
        ]
      : []),
    ...(unavailable === null
      ? [{ key: 'tag', text: $t('documents.release.check.tag'), icon: 'state.seal' as const }]
      : []),
  ]);

  /** @returns the words of a field the server found empty, by its pointer into the document */
  function labelOf(pointer: string): string {
    const { part, pointer: inner } = splitPointer(pointer);
    return labelOfPart(part, inner);
  }

  /** The refusal `STAGES_OPEN`: the stages to complete, each a link to its tab. */
  function explain(error: ApiError): ReleaseRefusal | null {
    const open = openStagesOf(error);
    if (open === null) return null;
    return {
      tone: 'attention',
      key: 'incidents.release.stages-open.title',
      body: $t('incidents.release.stages-open.body'),
      links: open.map((entry) => ({
        key: entry.stage,
        label: $t('incidents.release.stages-open.go', {
          stage: names[entry.stage] ?? stageName(entry.stage),
        }),
        href: incidentAddress(params.year, params.incident, { stage: entry.stage }),
      })),
      reload: true,
    };
  }

  /** @returns the person who signed a stage off at the time the change names, when the incident knows them */
  function signedBy(part: string, at: string): string | null {
    const entry = incident?.stages.find((stage) => stage.part === part);
    return entry?.completion && entry.completion.at === at ? entry.completion.by.name : null;
  }
</script>

{#snippet stage(released: ReleaseDone | null)}
  {#if incident && released}
    <ReleaseSeal
      version={versionOfTag(released.tag)}
      caption={$t('release.sealed')}
      label={$t('documents.release.seal', {
        title: incident.title,
        version: versionOfTag(released.tag),
      })}
      pressing
      testId="release-seal"
    />
  {:else if incident}
    <dl class="facts" data-testid="release-facts">
      <div>
        <dt>{$t('incidents.release.fact.incident')}</dt>
        <dd class="facts__title">{incident.title}</dd>
      </div>
      <div>
        <dt>{$t('incidents.kind.year')}</dt>
        <dd>{incident.year}</dd>
      </div>
      {#if incident.parts.triage?.value?.['aware-at']}
        <div>
          <dt>{$t('incidents.fact.aware')}</dt>
          <dd>
            {formatDateTime(String(incident.parts.triage.value['aware-at']), $currentLocale)}
          </dd>
        </div>
      {/if}
      <div>
        <dt>{$t('incidents.stages.title')}</dt>
        <dd>{$t('incidents.release.fact.stages', { done: counts.done, total: counts.total })}</dd>
      </div>
      <div>
        <dt>{$t('incidents.clock.title')}</dt>
        <dd>
          {incident.deadlines.length === 0
            ? $t('incidents.row.no-deadlines')
            : $t('incidents.release.fact.deadlines', {
                open: incident.deadlines.filter((entry) => entry.status === 'OPEN').length,
                met: incident.deadlines.filter((entry) => entry.status === 'MET').length,
                missed: incident.deadlines.filter((entry) => entry.status === 'MISSED').length,
              })}
        </dd>
      </div>
    </dl>
  {/if}
{/snippet}

{#snippet clock()}
  {#if stoppedAt !== null}
    <p class="lede" data-testid="release-clock-stopped">
      {$t('incidents.clock.stopped', { when: formatDateTime(stoppedAt, $currentLocale) })}
    </p>
  {:else}
    <p class="lede">{$t('incidents.release.deadlines.lede')}</p>
  {/if}
  <DeadlineClock label={$t('incidents.clock.label')} rows={dueRows} testId="release-deadlines" />
  {#if stoppedAt === null}
    <p class="act">
      <Link
        href={incidentAddress(params.year, params.incident, { stage: 'notifications' })}
        look="secondary"
        data-testid="release-record-notice"
      >
        {$t('incidents.notifications.record')}
      </Link>
    </p>
  {/if}
{/snippet}

{#snippet value(change: ReleaseChange, side: 'before' | 'after')}
  {@const entry = side === 'before' ? change.before : change.after}
  {@const place = splitPointer(change.pointer)}
  {#if place.pointer === '/completion'}
    {@const completion = entry as { at?: unknown } | null}
    {@const at = typeof completion?.at === 'string' ? completion.at : null}
    {#if at}
      {@const name = signedBy(place.part, at)}
      <span data-testid="release-completion">
        {name
          ? $t('incidents.release.completion.value', {
              name,
              when: formatDateTime(at, $currentLocale),
            })
          : formatDateTime(at, $currentLocale)}
      </span>
    {/if}
  {:else if incident && kindSchema}
    <DiffValue
      schema={readSchemaOf(kindSchema, place.part)}
      category={INCIDENT_CATEGORY}
      kind={partKind(place.part)}
      pointer={place.pointer}
      value={entry}
    />
  {/if}
{/snippet}

{#if missing}
  <NotFoundView />
{:else}
  <ReleaseFlow
    repository={incident?.repository ?? ''}
    id={incident?.id ?? ''}
    {texts}
    ready={!!incident && !!kindSchema && !!diff}
    {failure}
    {groups}
    {unavailable}
    {checks}
    backHref={incidentHref}
    openHref={incidentHref}
    fieldLabel={labelOf}
    onreload={reload}
    {explain}
    onreleased={(result) => (done = result)}
    {stage}
    since={dueRows.length > 0 ? clock : undefined}
    sinceTitle={stoppedAt !== null
      ? $t('incidents.release.deadlines.stopped')
      : $t('incidents.release.deadlines.title')}
    {value}
    mascot={false}
    shortLabels
  />
{/if}

<style>
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4) var(--space-8);
  }

  .facts dt {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  .facts dd {
    font-size: var(--text-sm);
    line-height: var(--line-height-sm);
  }

  .facts__title {
    font-family: var(--font-serif);
    font-size: var(--text-lg);
    line-height: var(--line-height-lg);
    font-weight: var(--weight-semibold);
  }

  .lede {
    max-inline-size: var(--measure);
    margin-block-end: var(--space-4);
    color: var(--color-text-secondary);
  }

  .act {
    margin-block-start: var(--space-4);
  }
</style>
