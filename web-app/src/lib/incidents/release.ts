/**
 * What the release of an incident knows beyond the shared release flow (rest-api.adoc, Submitting and Releasing): the
 * changes of the diff grouped by stage, the deadlines that are still a duty before the person confirms, and the refusal
 * `STAGES_OPEN` as the stages to go to.
 *
 * Nothing here touches the network or a component.
 */
import type { ApiError } from '../api/errors';
import type {
  DocumentDiff,
  IncidentDeadline,
  IncidentStage,
  JsonObject,
  JsonSchema,
} from '../api/types';
import { DATA_PART, partSchema, titleSchema } from './model';

/** One change of the incident, as the release reads it. */
export interface IncidentChange {
  /** A key that is unique in the record. */
  key: string;
  /** The part, which is the stage (or the title). */
  part: string;
  /** The JSON Pointer into the value of the part, `/severity`. */
  pointer: string;
  /** The words of the field. */
  label: string;
  before: unknown;
  after: unknown;
}

/** The changes of one stage (or of the title). */
export interface IncidentGroup {
  /** A key that is unique in the record: the part. */
  key: string;
  /** The part. */
  part: string;
  /** The title of the group: the name of the stage. */
  title: string;
  changes: IncidentChange[];
}

/**
 * The diff of a staged document is by part, the parts are the stages (rest-api.adoc, Decided Provisionally, point 30); a
 * stage's changes are read in the order of the form, one change for every field the diff names. A stage with no change is
 * not drawn.
 *
 * @param diff the diff the server answered
 * @param titleOf the name of a part: the stage, or the title
 * @param label the words of a field, by its part and its pointer into the value of the part
 * @returns one group for each part that changed, in the order the server listed the parts
 */
export function groupIncidentDiff(
  diff: DocumentDiff,
  titleOf: (part: string) => string,
  label: (part: string, pointer: string) => string,
): IncidentGroup[] {
  return diff.sections
    .map((section) => ({
      key: section.part,
      part: section.part,
      title: titleOf(section.part),
      changes: section.changes.map((change): IncidentChange => ({
        key: `${section.part}${change.pointer}`,
        part: section.part,
        pointer: change.pointer,
        label: label(section.part, change.pointer),
        before: change.before,
        after: change.after,
      })),
    }))
    .filter((group) => group.changes.length > 0);
}

/**
 * @param schema the schema of the document type (`kinds[n].schema`)
 * @param part a part of the incident
 * @returns the schema the value of the part is read under: the form of the stage, the title for `data`
 */
export function readSchemaOf(schema: JsonSchema, part: string): JsonSchema {
  return part === DATA_PART ? titleSchema(schema) : partSchema(schema, part);
}

/**
 * @param deadline a deadline of the read
 * @returns whether it is still a duty of the person before the incident is frozen: it is open, or it is missed and was
 *   never sent. A deadline sent late is a fact, and a met one is done.
 */
export function stillDue(deadline: IncidentDeadline): boolean {
  return deadline.status === 'OPEN' || (deadline.status === 'MISSED' && deadline.sentAt === null);
}

/**
 * @param stages the stages of the incident
 * @returns the number of stages that apply, and how many of them are completed
 */
export function stageCounts(stages: readonly IncidentStage[]): { done: number; total: number } {
  const applicable = stages.filter((stage) => stage.status !== 'not-applicable');
  return {
    done: applicable.filter((stage) => stage.status === 'completed').length,
    total: applicable.length,
  };
}

/** A stage the refusal `STAGES_OPEN` names, with its missing fields. */
export interface OpenStage {
  /** The stage id. */
  stage: string;
  /** The JSON Pointers of the mandatory fields still empty; empty for a stage that only needs its sign-off. */
  missing: string[];
}

/**
 * @param error a refusal of the release
 * @returns the stages of a `STAGES_OPEN` refusal, in the order the server listed them; `null` for another refusal
 */
export function openStagesOf(error: ApiError): OpenStage[] | null {
  if (error.outcome !== 'STAGES_OPEN') return null;
  const listed = error.details.stages;
  if (!Array.isArray(listed)) return [];
  return listed.flatMap((entry): OpenStage[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const row = entry as JsonObject;
    if (typeof row.stage !== 'string') return [];
    const missing = Array.isArray(row.missing)
      ? row.missing.filter((pointer): pointer is string => typeof pointer === 'string')
      : [];
    return [{ stage: row.stage, missing }];
  });
}
