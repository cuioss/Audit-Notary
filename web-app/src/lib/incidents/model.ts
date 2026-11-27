/**
 * What the lens Incidents knows of an incident (rest-api.adoc, Incident Report Requests): its addresses, the way a part
 * of the document is named for the texts of the form, the tab a stage is drawn as, the rows of the deadline clock and of
 * the notifications table, and the time left or overdue in words.
 *
 * Nothing here touches the network or a component.
 */
import type {
  CreateRequest,
  IncidentDeadline,
  JsonSchema,
  IncidentStage,
  JsonObject,
  StageStatus,
} from '../api/types';
import type { ClockRow } from '../components/DeadlineClock.svelte';
import type { StageTab } from '../components/StageTabs.svelte';
import type { StatusTone } from '../components/StatusLabel.svelte';
import { formatAddress } from '../routes';
import type { Translate } from '../documents/saveLabel';

/** The category and the document type of the incident reports, for the texts of the form. */
export const INCIDENT_CATEGORY = 'incident-reports';
export const INCIDENT_KIND = 'incident';

/** The part of the document that holds its title; every other part is the data of one stage. */
export const DATA_PART = 'data';

/** The transition that submits an incident for review, and the one that releases it. */
export const SUBMIT_TRANSITION = 'incident.submit';

/** The address of the years, the first column of the lens. */
export const INCIDENTS_ADDRESS = '/incidents';

/**
 * @param year the year, four digits
 * @returns the repository of the year's incident reports
 */
export function repositoryOf(year: string | number): string {
  return `isms-incidents-${year}`;
}

/**
 * @param year the year, four digits
 * @returns the address of the year's incidents
 */
export function yearAddress(year: string | number): string {
  return formatAddress({ route: 'incidents.year', params: { year: String(year) } });
}

/**
 * @param year the year, four digits
 * @returns the address of the form of a new incident of the year (part B of the lens)
 */
export function newAddress(year: string | number): string {
  return formatAddress({ route: 'incidents.new', params: { year: String(year) } });
}

/**
 * @param year the year, four digits
 * @param incident the incident's document id
 * @param options the stage to show, and the revision to read
 * @returns the address of the incident
 */
export function incidentAddress(
  year: string | number,
  incident: string,
  options: { stage?: string; at?: string } = {},
): string {
  const query: Record<string, string> = {};
  if (options.at) query.at = options.at;
  if (options.stage) query.stage = options.stage;
  return formatAddress({
    route: 'incidents.incident',
    params: { year: String(year), incident },
    ...(Object.keys(query).length > 0 ? { query } : {}),
  });
}

/**
 * @param year the year, four digits
 * @param incident the incident's document id
 * @returns the address of the review and release of the incident (part B of the lens)
 */
export function releaseAddress(year: string | number, incident: string): string {
  return formatAddress({ route: 'incidents.release', params: { year: String(year), incident } });
}

/**
 * The kind a part's form is read under: the texts of its fields are `category.incident-reports.incident.<part>.field.…`,
 * so that two stages that name a field alike (`data-subjects` of the assessment and of the notices) keep their own words.
 *
 * @param part the part
 * @returns the kind for the texts of the form
 */
export function partKind(part: string): string {
  return `${INCIDENT_KIND}.${part}`;
}

/**
 * @param pointer a pointer into the document's value, `/triage/severity`
 * @returns the part and the pointer into its value
 */
export function splitPointer(pointer: string): { part: string; pointer: string } {
  const rest = pointer.startsWith('/') ? pointer.slice(1) : pointer;
  const cut = rest.indexOf('/');
  return cut < 0
    ? { part: rest, pointer: '' }
    : { part: rest.slice(0, cut), pointer: rest.slice(cut) };
}

/**
 * The name of every stage by the id of the stage and by the part that holds its data, so a line of the history that names
 * a stage by its part (a save) is worded as the stage even where the part is not called as the stage is.
 *
 * @param stages the stages of the incident
 * @param nameOf the name of a stage, by its id
 * @returns the names, by id and by part
 */
export function stageNames(
  stages: readonly { id: string; part: string }[],
  nameOf: (id: string) => string,
): Record<string, string> {
  const names: Record<string, string> = {};
  for (const entry of stages) names[entry.part] = nameOf(entry.id);
  for (const entry of stages) names[entry.id] = nameOf(entry.id);
  return names;
}

/**
 * @param stage a stage id from an address
 * @param stages the stages of the incident
 * @returns the stage when the incident declares it
 */
export function knownStage(
  stage: string | undefined,
  stages: readonly { id: string }[],
): string | null {
  return stage !== undefined && stages.some((entry) => entry.id === stage) ? stage : null;
}

/**
 * The tab shown when the address names none: the first stage that is open and not waiting for another, else the first
 * that is open, else the first stage that applies, else the first.
 *
 * @param stages the stages of the incident, in the order of the tabs
 * @returns the stage id; `null` for an incident without a stage
 */
export function defaultStage(stages: readonly IncidentStage[]): string | null {
  const ready = stages.find((stage) => stage.status === 'open' && stage.blockedBy.length === 0);
  return (
    ready?.id ??
    stages.find((stage) => stage.status === 'open')?.id ??
    stages.find((stage) => stage.status !== 'not-applicable')?.id ??
    stages[0]?.id ??
    null
  );
}

/** @returns whether a status needs no act of the person */
function isSettled(status: StageStatus): boolean {
  return status !== 'open';
}

/**
 * @param stages the stages of the incident
 * @returns the applicable stages that are not completed
 */
export function openStages(stages: readonly IncidentStage[]): IncidentStage[] {
  return stages.filter((stage) => stage.status === 'open');
}

/**
 * @param stages the stages of the incident
 * @returns whether every applicable stage is completed: the incident may be submitted
 */
export function allStagesDone(stages: readonly IncidentStage[]): boolean {
  return stages.every((stage) => isSettled(stage.status));
}

/** The tone of the word of a stage's status. */
export function stageTone(status: StageStatus): StatusTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'open':
      return 'running';
    default:
      return 'neutral';
  }
}

/**
 * @param stages the stages of the incident
 * @param t the translation function
 * @param flags the stages that carry a mark that needs the person, by stage id, with its words
 * @returns the tabs, in the order of the stages
 */
export function stageTabs(
  stages: readonly IncidentStage[],
  t: Translate,
  flags: Readonly<Record<string, string>> = {},
): StageTab[] {
  return stages.map((stage) => ({
    id: stage.id,
    label: t(`category.${INCIDENT_CATEGORY}.stage.${stage.id}`),
    status: stage.status,
    statusLabel: t(`incidents.stage.status.${stage.status}`),
    note:
      stage.status !== 'not-applicable'
        ? null
        : t(stage.unanswered ? 'incidents.stage.applies-when' : 'incidents.stage.tab-condition', {
            condition: t(`category.${INCIDENT_CATEGORY}.stage.${stage.id}.when`),
          }),
    marker: stage.predecessorReopened ? t('incidents.stage.predecessor-reopened') : null,
    flag: flags[stage.id] ?? null,
  }));
}

/** The words of the units of a span of time, from the largest that fits. */
export type SpanUnit = 'minutes' | 'hours' | 'days';

/**
 * @param milliseconds a length of time, negative or positive
 * @returns the length as a whole count of the largest unit that fits: minutes below an hour, hours below two days, else
 *   days; at least one minute
 */
export function spanOf(milliseconds: number): { unit: SpanUnit; count: number } {
  const minutes = Math.max(1, Math.round(Math.abs(milliseconds) / 60_000));
  if (minutes < 60) return { unit: 'minutes', count: minutes };
  const hours = Math.round(minutes / 60);
  if (hours < 48) return { unit: 'hours', count: hours };
  return { unit: 'days', count: Math.round(hours / 24) };
}

/**
 * @param deadline a deadline of the read
 * @param at the instant the time is told against: the present for a working state, the time of the release for a frozen one
 * @param t the translation function
 * @param when formats an instant for the sentence that tells when a notice was sent
 * @returns the row of the clock
 */
export function clockRow(
  deadline: IncidentDeadline,
  at: Date,
  t: Translate,
  when: (instant: string) => string,
): ClockRow {
  const base = t(`category.${INCIDENT_CATEGORY}.deadline.${deadline.rule}`);
  const name =
    deadline.element === null
      ? base
      : t('incidents.clock.element', { name: base, number: deadline.element + 1 });
  const due = deadline.due === null ? null : new Date(deadline.due);
  const span = (milliseconds: number): string => {
    const { unit, count } = spanOf(milliseconds);
    return t(`incidents.span.${unit}`, { count });
  };
  let detail: string;
  let needsYou = false;
  if (due === null) {
    detail = t('incidents.clock.not-started');
  } else if (deadline.sentAt !== null) {
    const late = new Date(deadline.sentAt).getTime() - due.getTime();
    detail =
      late > 0
        ? t('incidents.clock.sent-late', {
            when: when(deadline.sentAt),
            span: span(late),
          })
        : t('incidents.clock.sent', { when: when(deadline.sentAt) });
  } else if (due.getTime() < at.getTime()) {
    needsYou = true;
    detail = t('incidents.clock.over', { span: span(at.getTime() - due.getTime()) });
  } else {
    detail = t('incidents.clock.left', { span: span(due.getTime() - at.getTime()) });
  }
  // A deadline never sent that the clock of the page has overtaken before the server says so is already a duty; one with a
  // notice keeps the status the server gave it.
  const overtaken =
    deadline.status === 'OPEN' &&
    deadline.sentAt === null &&
    due !== null &&
    due.getTime() < at.getTime();
  return {
    key: `${deadline.rule}/${deadline.element ?? ''}`,
    name,
    basis: t(`category.${INCIDENT_CATEGORY}.deadline.${deadline.rule}.basis`),
    status: overtaken ? 'MISSED' : deadline.status,
    statusLabel: t(`incidents.clock.status.${overtaken ? 'MISSED' : deadline.status}`),
    needsYou: needsYou || overtaken,
    due: deadline.due,
    dueText: deadline.due === null ? null : when(deadline.due),
    detail,
  };
}

/** One row of the notifications table. */
export interface NotificationRow {
  key: string;
  /** The member of the part, `supervisory-authority`. */
  member: string;
  /** The index in a list member, else `null`. */
  element: number | null;
  /** The pointer into the document's value of the record, as the deadline's `metBy` names it. */
  pointer: string;
  sentAt: string;
  recipient: string;
  channel: string;
  reference: string | null;
  comment: string | null;
}

/**
 * The members and their order are those of the schema of the part (rest-api.adoc, The Data Shape), so a notice the schema
 * adds is a row without a change here; a member of type `array` is a list, one row for each entry.
 *
 * @param value the value of the part `notifications`
 * @param schema the schema of the part `notifications` (the `completion` is no notice and is skipped)
 * @returns one row for every notice recorded, in the order of the table: the single notices, and every entry of a list
 */
export function notificationRows(
  value: JsonObject | undefined,
  schema: JsonSchema | undefined,
): NotificationRow[] {
  const rows: NotificationRow[] = [];
  if (!value) return rows;
  const text = (record: JsonObject, name: string): string | null =>
    typeof record[name] === 'string' ? (record[name] as string) : null;
  const rowOf = (member: string, element: number | null, record: unknown): void => {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) return;
    const fields = record as JsonObject;
    const sentAt = text(fields, 'sent-at');
    if (sentAt === null) return;
    rows.push({
      key: element === null ? member : `${member}/${element}`,
      member,
      element,
      pointer: `/notifications/${member}${element === null ? '' : `/${element}`}`,
      sentAt,
      recipient: text(fields, 'recipient') ?? '',
      channel: text(fields, 'channel') ?? '',
      reference: text(fields, 'reference'),
      comment: text(fields, 'comment'),
    });
  };
  for (const [member, memberSchema] of Object.entries(propertiesOf(schema))) {
    if (member === 'completion') continue;
    const entry = value[member];
    if (memberSchema.type === 'array') {
      if (Array.isArray(entry)) entry.forEach((item, index) => rowOf(member, index, item));
    } else {
      rowOf(member, null, entry);
    }
  }
  return rows;
}

/**
 * @param row a notification
 * @param deadlines the deadlines of the incident
 * @returns the deadline this notice meets (or, sent late, failed to meet), `null` for a notice no rule asks for
 */
export function deadlineOfNotification(
  row: NotificationRow,
  deadlines: readonly IncidentDeadline[],
): IncidentDeadline | null {
  return deadlines.find((deadline) => deadline.metBy === row.pointer) ?? null;
}

/**
 * @param row a notification, as it stands in the form (with the changes not yet saved)
 * @param deadline the deadline it meets
 * @returns whether the deadline was computed from this very notice: the saved time of the notice is the one the row shows,
 *   so a notice that was added or whose time was changed since the last save is not judged by the status of the last read
 */
export function deadlineJudges(row: NotificationRow, deadline: IncidentDeadline): boolean {
  if (deadline.sentAt === null) return false;
  return new Date(deadline.sentAt).getTime() === new Date(row.sentAt).getTime();
}

/** @returns the properties of a schema, `{}` when it has none */
function propertiesOf(schema: JsonSchema | undefined): Record<string, JsonSchema> {
  const properties = schema?.properties;
  return typeof properties === 'object' && properties !== null && !Array.isArray(properties)
    ? (properties as Record<string, JsonSchema>)
    : {};
}

/**
 * The schema of the form of one stage: the schema of its part without the `completion`, which only *complete* and *reopen*
 * write (rest-api.adoc, Creating and Saving), so the form never offers it.
 *
 * @param schema the schema of the document type (`kinds[n].schema`)
 * @param part the part
 * @returns the schema of the part's form; an empty object schema for a part the schema does not know
 */
export function partSchema(schema: JsonSchema, part: string): JsonSchema {
  const own = propertiesOf(schema)[part];
  if (!own) return { type: 'object', properties: {} };
  const properties = { ...propertiesOf(own) };
  delete properties.completion;
  return { ...own, properties };
}

/**
 * @param schema the schema of the document type
 * @returns the schema of the form of the part `data`: the title
 */
export function titleSchema(schema: JsonSchema): JsonSchema {
  const title = propertiesOf(schema).title;
  return {
    type: 'object',
    required: ['title'],
    properties: title ? { title } : {},
  };
}

/** The part of the document that holds the triage, the first stage: the awareness of a new incident is written there. */
export const TRIAGE_PART = 'triage';

/**
 * @param schema the schema of the document type
 * @returns the schema of the form of the awareness of a new incident: the one field of the triage the first save takes
 *   besides the title, never required (the other fields are asked for by the stage)
 */
export function awareSchema(schema: JsonSchema): JsonSchema {
  const aware = propertiesOf(partSchema(schema, TRIAGE_PART))['aware-at'];
  return { type: 'object', properties: aware ? { 'aware-at': aware } : {} };
}

/**
 * @param title the title, as typed
 * @param awareAt the time the organisation became aware, `null` for none yet
 * @returns the first save of a new incident (rest-api.adoc, Creating and Saving): the title, and the awareness when it is
 *   known; the year of the repository is the year of the awareness
 */
export function newIncidentRequest(title: string, awareAt: string | null): CreateRequest {
  return {
    kind: INCIDENT_KIND,
    parts: {
      [DATA_PART]: { fields: { '/title': title.trim() } },
      ...(awareAt ? { [TRIAGE_PART]: { fields: { '/aware-at': awareAt } } } : {}),
    },
  };
}
