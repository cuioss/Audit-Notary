/**
 * What the recipe wizard of the lens Threat models knows (rest-api.adoc, The Recipes, The Recipe Draft, A New Model): which
 * part of the model a step fills, how the step's form is cut from the schema, what a draft holds, which step a refused
 * field belongs to, and the bodies of the requests the wizard sends.
 *
 * Nothing here touches the network or a component.
 */
import type { FieldError } from '../api/errors';
import type {
  JsonObject,
  JsonSchema,
  JsonValue,
  PartFields,
  RecipeDraftBody,
  RecipeDraftRequest,
  RecipeParts,
  ThreatModelCreate,
  ThreatRecipeStep,
} from '../api/types';
import { isObject } from '../forms/schema';
import { MODEL_PART, pickProperties } from './model';

/** The fields a person filled in, by the JSON Pointer of the step that fills them (`/project`, `/trustZones`, …). */
export type ModelValues = Record<string, JsonValue>;

/** What a step shows: the table of the threats, the table of the countermeasures, or a form cut from the schema. */
export type StepKind = 'threats' | 'mitigations' | 'form';

/** The pointers of the two lists that have an editor of their own. */
const THREATS_POINTER = '/threats';
const MITIGATIONS_POINTER = '/mitigations';

/** The two fields of the part `data` the last page asks for, and their pointers. */
export const OWNER_POINTER = '/owner';
export const REVIEW_POINTER = '/last-review';

/**
 * @param fills the pointer a step fills
 * @returns how the step is shown
 */
export function stepKind(fills: string): StepKind {
  if (fills === THREATS_POINTER) return 'threats';
  if (fills === MITIGATIONS_POINTER) return 'mitigations';
  return 'form';
}

/**
 * @param fills the pointer a step fills
 * @returns the name of the member of the model file it names, `null` for a pointer that is not one top-level member
 */
export function memberOf(fills: string): string | null {
  const match = /^\/([^/]+)$/.exec(fills);
  return match ? match[1].replaceAll('~1', '/').replaceAll('~0', '~') : null;
}

/**
 * @param schema a schema
 * @returns the same schema without the properties that are `readOnly`, at every depth: what the server writes (the address
 *   segment of the project) is not asked for, because the model does not exist yet
 */
export function dropReadOnly(schema: JsonSchema): JsonSchema {
  const properties = schema.properties as Record<string, JsonSchema> | undefined;
  const items = schema.items as JsonSchema | undefined;
  const cut: JsonSchema = { ...schema };
  if (properties) {
    const kept = Object.entries(properties).filter(([, member]) => member.readOnly !== true);
    cut.properties = Object.fromEntries(kept.map(([name, member]) => [name, dropReadOnly(member)]));
    if (Array.isArray(schema.required)) {
      const names = new Set(kept.map(([name]) => name));
      cut.required = (schema.required as string[]).filter((name) => names.has(name));
    }
  }
  if (items && typeof items === 'object') cut.items = dropReadOnly(items);
  return cut;
}

/**
 * The schema of the form of a step: the member of the model file that the step fills, as a schema of an object of that
 * member alone, so that the form kit draws it with the labels and the tables of the sheet of a model.
 *
 * @param model the schema of the model file (`properties.model` of the document type)
 * @param fills the pointer the step fills
 * @returns the schema, or `null` when the pointer names nothing the form can show
 */
export function stepSchema(model: JsonSchema, fills: string): JsonSchema | null {
  const member = memberOf(fills);
  const properties = model.properties as Record<string, JsonSchema> | undefined;
  if (member === null || !properties || !(member in properties)) return null;
  return dropReadOnly(pickProperties(model, [member]));
}

/**
 * @param values the fields filled in so far
 * @param fills the pointer the step fills
 * @returns the value of the step's form: an object with the member alone
 */
export function stepValue(values: ModelValues, fills: string): JsonObject {
  const member = memberOf(fills);
  if (member === null || values[fills] === undefined) return {};
  return { [member]: values[fills] };
}

/**
 * @param value what the form of a step reported
 * @param fills the pointer the step fills
 * @returns the value of the member of the step, `undefined` when the form holds none
 */
export function memberValue(value: JsonObject, fills: string): JsonValue | undefined {
  const member = memberOf(fills);
  return member === null ? undefined : value[member];
}

/**
 * @param values the fields filled in so far
 * @param fills the pointer of a list of the file (`/threats`, `/mitigations`)
 * @returns the list as it stands, empty while nothing was filled in
 */
export function listAt<T>(values: ModelValues, fills: string): T[] {
  const list = values[fills];
  return Array.isArray(list) ? (list as unknown as T[]) : [];
}

/**
 * @param values the fields filled in so far
 * @returns the name of the project, `''` while there is none
 */
export function projectName(values: ModelValues): string {
  const project = values['/project'];
  const name = isObject(project) ? project.name : undefined;
  return typeof name === 'string' ? name.trim() : '';
}

/**
 * @param count the steps of the recipe
 * @param draft the draft that was read, if any
 * @returns the step to open on: the step of the draft, kept within the steps and the final page (`count`); the first
 *   step without a draft
 */
export function startStep(count: number, draft: RecipeDraftBody | null): number {
  if (draft === null || !Number.isInteger(draft.step)) return 0;
  return Math.min(Math.max(draft.step, 0), count);
}

/**
 * @param draft the draft that was read, if any
 * @returns the fields of its part `model`, as a copy the wizard may change
 */
export function valuesOfDraft(draft: RecipeDraftBody | null): ModelValues {
  const fields = draft?.parts.model?.fields;
  return isObject(fields) ? ({ ...fields } as ModelValues) : {};
}

/** The part `data` as the last page edits it: the member names of the document, not pointers. */
export interface DataValues {
  owner?: string;
  'last-review'?: string;
}

/**
 * @param draft the draft that was read, if any
 * @param today the day the review date is prefilled with
 * @returns what the last page starts with: the draft's values, the review date of today where there is none
 */
export function dataOfDraft(draft: RecipeDraftBody | null, today: string): DataValues {
  const fields = draft?.parts.data?.fields ?? {};
  const owner = fields[OWNER_POINTER];
  const review = fields[REVIEW_POINTER];
  return {
    ...(typeof owner === 'string' && owner !== '' ? { owner } : {}),
    'last-review': typeof review === 'string' && review !== '' ? review : today,
  };
}

/**
 * @param data what the last page holds
 * @returns the fields of the part `data` by pointer; a member that is empty is left out
 */
export function dataFields(data: DataValues): PartFields['fields'] {
  const fields: PartFields['fields'] = {};
  if (data.owner) fields[OWNER_POINTER] = data.owner;
  if (data['last-review']) fields[REVIEW_POINTER] = data['last-review'];
  return fields;
}

/**
 * @param step the step the person goes on to (the number of steps for the last page)
 * @param values the fields filled in so far
 * @param data what the last page holds, once the person was there
 * @returns the body of the request that keeps the draft: the whole draft, as it is replaced as a whole
 */
export function draftRequest(
  step: number,
  values: ModelValues,
  data: DataValues | null,
): RecipeDraftRequest {
  const fields = data === null ? {} : dataFields(data);
  const parts: Partial<RecipeParts> = { model: { fields: { ...values } } };
  if (Object.keys(fields).length > 0) parts.data = { fields };
  return { step, parts };
}

/**
 * @param recipe the recipe the model is created by
 * @param values the fields filled in
 * @param data what the last page holds
 * @returns the body of the create
 */
export function createRequest(
  recipe: string,
  values: ModelValues,
  data: DataValues,
): ThreatModelCreate {
  return {
    recipe,
    parts: { data: { fields: dataFields(data) }, model: { fields: { ...values } } },
  };
}

/**
 * @param steps the steps of the recipe
 * @param pointer a pointer a refusal names, into the model file
 * @returns the position of the step that fills the place, `-1` when no step does
 */
export function stepOfPointer(steps: readonly ThreatRecipeStep[], pointer: string): number {
  return steps.findIndex((step) => pointer === step.fills || pointer.startsWith(`${step.fills}/`));
}

/**
 * @param errors the field errors of a refused draft or create
 * @returns those that belong to the file of the model, with the pointer as the file knows it
 */
export function modelErrors(errors: FieldError[] | null): FieldError[] {
  return (errors ?? []).filter((error) => (error.part ?? MODEL_PART) === MODEL_PART);
}

/**
 * @param errors the field errors of a refused draft or create
 * @returns those that belong to the part `data` (the owner, the review date)
 */
export function dataErrors(errors: FieldError[] | null): FieldError[] {
  return (errors ?? []).filter((error) => error.part === 'data');
}

/**
 * @param errors the field errors of the part `model`
 * @param fills the pointer a step fills
 * @returns the ones within the step's place
 */
export function errorsOfStep(errors: FieldError[], fills: string): FieldError[] {
  return errors.filter((error) => error.pointer === fills || error.pointer.startsWith(`${fills}/`));
}

/**
 * @param steps the steps of the recipe
 * @param errors the field errors of a refused draft or create
 * @returns the position of the step the first refused field of the file belongs to, `-1` when none does
 */
export function firstStepWithError(
  steps: readonly ThreatRecipeStep[],
  errors: FieldError[],
): number {
  for (const error of modelErrors(errors)) {
    const position = stepOfPointer(steps, error.pointer);
    if (position >= 0) return position;
  }
  return -1;
}

/** What the last page says of one step: the name it was given, or how many entries it holds, or that it is empty. */
export type StepSummary =
  { kind: 'name'; text: string } | { kind: 'count'; count: number } | { kind: 'none' };

/**
 * @param fills the pointer the step fills
 * @param values the fields filled in
 * @returns what the last page says of the step
 */
export function summaryOf(fills: string, values: ModelValues): StepSummary {
  const value = values[fills];
  if (Array.isArray(value))
    return value.length > 0 ? { kind: 'count', count: value.length } : { kind: 'none' };
  if (isObject(value)) {
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (name !== '') return { kind: 'name', text: name };
    return Object.keys(value).length > 0 ? { kind: 'count', count: 1 } : { kind: 'none' };
  }
  return { kind: 'none' };
}
