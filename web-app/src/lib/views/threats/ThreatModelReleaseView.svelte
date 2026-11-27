<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import ReleaseSeal from '../../components/ReleaseSeal.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError } from '../../api/errors';
  import type { CategorySchema, DocumentDiff, JsonSchema, ThreatModelRead } from '../../api/types';
  import { actionsOn, fieldLabel } from '../../documents/categories';
  import { versionOfTag } from '../../documents/history';
  import { createFormServices, provideFormServices } from '../../forms/services';
  import { missingRequired } from '../../forms/validate';
  import { formatDate, formatDateTime } from '../../format';
  import { currentLocale, messagesStore, t } from '../../i18n';
  import { session } from '../../stores/app';
  import { breadcrumb } from '../../stores/breadcrumb';
  import {
    DATA_PART,
    groupModelDiff,
    MODEL_PART,
    modelAddress,
    modelSchemaOf,
    pickProperties,
    releaseAddress,
    serviceAddress,
    splitPointer,
    THREAT_CATEGORY,
    THREAT_KIND,
    THREAT_REPOSITORY,
  } from '../../threats/model';
  import DiffValue from '../documents/DiffValue.svelte';
  import ReleaseFlow, {
    type ReleaseChange,
    type ReleaseCheck,
    type ReleaseDone,
    type ReleaseGroup,
    type ReleaseTexts,
  } from '../documents/ReleaseFlow.svelte';
  import NotFoundView from '../NotFoundView.svelte';
  import ThreatDiffValue from './ThreatDiffValue.svelte';

  /**
   * The review and release of a threat model (UC-TM-2, AUN-WEB-6): the address
   * `/threat-models/{service}/{model}/release`. It reads the model, its schema and the structured diff against the last
   * release, hands them to the generic `ReleaseFlow`, and draws what belongs to a threat model: the facts of the model as
   * the stage, the seal once the release is made, and the changes as the approver reads them, a threat or a
   * countermeasure at a time. The act reads "Release"; that the person confirms their identity once more is the flow's
   * line in the margin.
   */
  interface Props {
    /** The values of the address: `service` and `model`. */
    params: Record<string, string>;
  }

  let { params }: Props = $props();

  // One reading of references for the whole record: the names of people and the titles of documents are asked once.
  provideFormServices(createFormServices());

  let doc = $state<ThreatModelRead | null>(null);
  let schemas = $state<CategorySchema | null>(null);
  let diff = $state<DocumentDiff | null>(null);
  let failure = $state<string | null>(null);
  let missing = $state(false);

  let latest = 0;

  /** Reads the model and its record: the second is what the approver reviews, so it is read after the first. */
  async function readRecord() {
    const read = ++latest;
    try {
      const loaded = await apiClient.getThreatModel(params.service, params.model);
      const [loadedSchemas, loadedDiff] = await Promise.all([
        schemas ?? apiClient.getCategorySchema(THREAT_CATEGORY),
        // A released model has nothing to release: its record is the release it was made from, unchanged.
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
      if (!loadedSchemas.kinds.some((entry) => entry.id === THREAT_KIND)) {
        missing = true;
        return;
      }
      doc = loaded;
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
    void params.service;
    void params.model;
    untrack(() => {
      failure = null;
      void readRecord();
    });
  });

  onDestroy(() => {
    latest += 1;
    breadcrumb.set([]);
  });

  let modelHref = $derived(modelAddress(params.service, params.model));
  let releaseHref = $derived(releaseAddress(params.service, params.model));

  $effect(() => {
    breadcrumb.set(
      !missing && doc
        ? [
            { label: doc.service.name, href: serviceAddress(params.service) },
            { label: doc.title, href: modelHref },
            { label: $t('lens.release'), href: releaseHref },
          ]
        : [],
    );
  });

  let rights = $derived(actionsOn($session, THREAT_REPOSITORY));
  let kindSchema = $derived(
    schemas?.kinds.find((entry) => entry.id === THREAT_KIND)?.schema ?? null,
  );
  /** The schema of each part's value: the data of the document and the file of the model. */
  let partSchemas = $derived.by((): Record<string, JsonSchema> | null => {
    if (!kindSchema) return null;
    const model = modelSchemaOf(kindSchema);
    return model
      ? { [DATA_PART]: pickProperties(kindSchema, ['owner', 'last-review']), [MODEL_PART]: model }
      : null;
  });
  let modelPart = $derived(doc?.parts[MODEL_PART]);
  let dataPart = $derived(doc?.parts[DATA_PART]);
  let submitted = $derived(doc?.history.find((line) => line.kind === 'submit') ?? null);
  let from = $derived(diff?.from ? versionOfTag(diff.from) : null);

  let unavailable = $derived.by(() => {
    if (!doc) return null;
    if (doc.state === 'released') return $t('documents.release.state.released');
    if (!rights.includes('approve')) return $t('release.no-right');
    if (!doc.transitions.some((transition) => transition.release)) {
      return doc.state === 'draft'
        ? $t('documents.release.state.draft')
        : $t('documents.release.state.not-offered');
    }
    return null;
  });

  let texts: ReleaseTexts = $derived({
    title: $t('release.title', { title: doc?.title ?? $t('common.loading') }),
    intro: $t('threats.release.intro'),
    doneTitle: $t('release.done.title', { title: doc?.title ?? '' }),
    doneIntro: $t('threats.release.done.intro'),
    recordLede:
      diff === null
        ? ''
        : from === null
          ? $t('documents.release.record.first')
          : diff.sections.length === 0
            ? $t('documents.release.record.none', { version: from })
            : $t('documents.release.record.since', { version: from }),
    back: $t('threats.release.back'),
    open: $t('threats.release.open'),
    passwordLede: $t('release.password.lede', { title: doc?.title ?? '' }),
    releasedMeanwhile: 'documents.release.released-meanwhile',
    count: (count) => $t('documents.release.record.count', { count }),
  });

  /** @returns the words of a field, by its pointer into the value of its part (the keys of the texts are relative to it) */
  function labelOfPart(_part: string, pointer: string): string {
    return fieldLabel($messagesStore, THREAT_CATEGORY, THREAT_KIND, pointer);
  }

  let modelGroups = $derived(diff ? groupModelDiff(diff, labelOfPart) : []);
  /** The part of each change, to choose the schema that reads its value. */
  let partOfKey = $derived(
    new Map(
      modelGroups.flatMap((group) =>
        group.changes.map((change): [string, string] => [change.key, change.part]),
      ),
    ),
  );
  let groups: ReleaseGroup[] = $derived(
    modelGroups.map((group) => ({
      key: group.key,
      title: group.title,
      changes: group.changes.map((change): ReleaseChange => ({
        key: change.key,
        pointer: change.pointer,
        label: change.label,
        before: change.before,
        after: change.after,
      })),
    })),
  );

  let emptyFields = $derived(
    partSchemas && modelPart && dataPart
      ? missingRequired(partSchemas[MODEL_PART], modelPart.value).length +
          missingRequired(partSchemas[DATA_PART], dataPart.value).length
      : 0,
  );
  /** Whether this version carries a review: its review date is not the one of the last release. */
  let reviewed = $derived(
    !!doc && !!dataPart && dataPart.value['last-review'] !== doc.review.lastReview,
  );
  let checks: ReleaseCheck[] = $derived([
    emptyFields === 0
      ? { key: 'fields', text: $t('documents.release.check.fields'), icon: 'state.done' }
      : {
          key: 'fields',
          text: $t('documents.release.check.fields-open', { count: emptyFields }),
          icon: 'state.open',
          open: true,
        },
    reviewed
      ? {
          key: 'review',
          text: $t('threats.release.check.reviewed', {
            date: formatDate(String(dataPart?.value['last-review'] ?? ''), $currentLocale),
          }),
          icon: 'state.done',
        }
      : {
          key: 'review',
          text: $t('threats.release.check.not-reviewed'),
          icon: 'state.open',
          open: true,
        },
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
</script>

{#snippet stage(released: ReleaseDone | null)}
  {#if doc && released}
    <ReleaseSeal
      version={versionOfTag(released.tag)}
      caption={$t('release.sealed')}
      label={$t('documents.release.seal', {
        title: doc.title,
        version: versionOfTag(released.tag),
      })}
      pressing
      testId="release-seal"
    />
  {:else if doc}
    <div class="facts-stage">
      <dl class="facts" data-testid="release-facts">
        <div>
          <dt>{$t('documents.release.fact.document')}</dt>
          <dd class="facts__title">{doc.title}</dd>
        </div>
        <div>
          <dt>{$t('threats.fact.service')}</dt>
          <dd>{doc.service.name}</dd>
        </div>
        <div>
          <dt>{$t('documents.fact.version')}</dt>
          <dd>{doc.version}</dd>
        </div>
        {#if modelPart}
          <div>
            <dt>{$t('documents.fact.saved')}</dt>
            <dd>
              {$t('documents.fact.saved.value', {
                name: modelPart.savedBy.name,
                when: formatDateTime(modelPart.savedAt, $currentLocale),
              })}
            </dd>
          </div>
        {/if}
        <div>
          <dt>{$t('threats.counts.label')}</dt>
          <dd>
            {$t('threats.counts.short', {
              open: doc.threats.open,
              untreated: doc.threats.untreated,
            })}
          </dd>
        </div>
      </dl>
      {#if doc.releaseRequest}
        <section class="request" data-testid="release-request">
          <h3 class="request__title">{$t('documents.margin.request')}</h3>
          <p class="request__by">
            {$t('documents.request.by', {
              name: doc.releaseRequest.by.name,
              date: formatDate(doc.releaseRequest.at, $currentLocale),
            })}
          </p>
          <p class="request__comment">{doc.releaseRequest.comment}</p>
        </section>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet value(change: ReleaseChange, side: 'before' | 'after')}
  {@const entry = side === 'before' ? change.before : change.after}
  {#if change.pointer.startsWith('/threats/')}
    <ThreatDiffValue list="threats" {entry} />
  {:else if change.pointer.startsWith('/mitigations/')}
    <ThreatDiffValue list="mitigations" {entry} />
  {:else if doc && partSchemas}
    {@const part = partOfKey.get(change.key) ?? MODEL_PART}
    <DiffValue
      schema={partSchemas[part] ?? partSchemas[MODEL_PART]}
      category={THREAT_CATEGORY}
      kind={THREAT_KIND}
      pointer={change.pointer}
      value={entry}
    />
  {/if}
{/snippet}

{#if missing}
  <NotFoundView />
{:else}
  <ReleaseFlow
    repository={doc?.repository ?? ''}
    id={doc?.id ?? ''}
    {texts}
    ready={!!doc && !!partSchemas && !!diff}
    {failure}
    {groups}
    {unavailable}
    {checks}
    backHref={modelHref}
    openHref={modelHref}
    fieldLabel={labelOf}
    onreload={reload}
    {stage}
    {value}
  />
{/if}

<style>
  .facts-stage {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    inline-size: 100%;
  }

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

  .request {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-inline-size: var(--measure);
  }

  .request__title {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  .request__by {
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    color: var(--color-text-secondary);
  }

  .request__comment {
    padding-inline-start: var(--space-3);
    border-inline-start: 3px solid var(--color-border-strong);
    font-family: var(--font-serif);
    font-size: var(--text-md);
    overflow-wrap: anywhere;
  }
</style>
