/**
 * What the lens Threat models knows of a threat model (rest-api.adoc, Threat Model Requests): the threats and the
 * countermeasures as the file holds them, the ids the application chooses, which threat is untreated, the review date
 * that a typed day gives, the places where an error of a refused save belongs, and the addresses of the lens.
 *
 * Nothing here touches the network or a component.
 */
import type { FieldError } from '../api/errors';
import { jsonEqual, pointerTokens, toPointer } from '../forms/schema';
import type {
  DiffChange,
  DocumentDiff,
  JsonObject,
  JsonSchema,
  OtmMitigation,
  OtmThreat,
  ThreatTreatment,
} from '../api/types';
import { THREAT_TREATMENTS } from '../api/types';
import { checkReturn, formatAddress } from '../routes';

/** The repository of the threat models. */
export const THREAT_REPOSITORY = 'threat-models';

/** The category and the document type of the threat models, for the texts of the form. */
export const THREAT_CATEGORY = 'threat-models';
export const THREAT_KIND = 'threat-model';

/** The transition that submits a model for review. */
export const SUBMIT_TRANSITION = 'threat-model.submit';

/** The most issues one countermeasure names, as the schema bounds them. */
export const MAX_ISSUES = 20;
/** The longest issue id. */
export const MAX_ISSUE_LENGTH = 64;
/** The most threats and countermeasures a model holds, as the schema bounds them. */
export const MAX_THREATS = 200;
export const MAX_MITIGATIONS = 400;
/** The longest name and description of a threat or a countermeasure. */
export const MAX_NAME = 200;
export const MAX_DESCRIPTION = 2000;

/** The part of the document that holds the file of the model, and the part of its data. */
export const MODEL_PART = 'model';
export const DATA_PART = 'data';

/** The address of the evaluation of every service, the first column of the lens. */
export const EVALUATION_ADDRESS = '/threat-models';

/**
 * @param service the service's address segment
 * @returns the address of the service's page
 */
export function serviceAddress(service: string): string {
  return formatAddress({ route: 'threat-models.service', params: { service } });
}

/**
 * @param service the service's address segment
 * @param recipe the recipe to continue, if any
 * @returns the address of the wizard of a new threat model
 */
export function newAddress(service: string, recipe?: string): string {
  return formatAddress({
    route: 'threat-models.new',
    params: { service },
    ...(recipe ? { query: { recipe } } : {}),
  });
}

/**
 * @param service the service's address segment
 * @param model the model's address segment
 * @param at the revision to read, if any
 * @returns the address of the model
 */
export function modelAddress(service: string, model: string, at?: string): string {
  return formatAddress({
    route: 'threat-models.model',
    params: { service, model },
    ...(at ? { query: { at } } : {}),
  });
}

/**
 * @param service the service's address segment
 * @param model the model's address segment
 * @returns the address of the release of the model
 */
export function releaseAddress(service: string, model: string): string {
  return formatAddress({ route: 'threat-models.release', params: { service, model } });
}

/** The reference of a threat that became a risk, as the file holds it. */
const RISK_REFERENCE = /^isms-register:risk\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})$/;

/**
 * The risk a threat was transferred to, as a name and, when the app has the address, a link. The reference is the
 * server's text: only an address the app knows becomes a link.
 *
 * @param reference the `attributes.transferred` of a threat
 * @returns the id of the risk and its address; `null` for a text that is no such reference
 */
export function riskOf(reference: string | undefined): { id: string; href: string | null } | null {
  const id = reference ? RISK_REFERENCE.exec(reference)?.[1] : undefined;
  if (!id) return null;
  const href = `/isms/risks/${id.toLowerCase()}`;
  return { id, href: checkReturn(href) === href ? href : null };
}

/**
 * @param value the value of the part `model`
 * @returns its threats
 */
export function threatsOf(value: JsonObject | undefined): OtmThreat[] {
  const list = value?.threats;
  return Array.isArray(list) ? (list as unknown as OtmThreat[]) : [];
}

/**
 * @param value the value of the part `model`
 * @returns its countermeasures
 */
export function mitigationsOf(value: JsonObject | undefined): OtmMitigation[] {
  const list = value?.mitigations;
  return Array.isArray(list) ? (list as unknown as OtmMitigation[]) : [];
}

/**
 * @param prefix `T` or `M`
 * @param taken the ids of the list
 * @returns the next free id of the form `<prefix>-<nn>`: one more than the highest number taken, two digits at least
 */
export function nextId(prefix: 'T' | 'M', taken: readonly string[]): string {
  let highest = 0;
  for (const id of taken) {
    const digits = id.startsWith(`${prefix}-`) ? id.slice(prefix.length + 1) : '';
    if (/^\d+$/.test(digits)) highest = Math.max(highest, Number(digits));
  }
  return `${prefix}-${String(highest + 1).padStart(2, '0')}`;
}

/**
 * @param threat a threat
 * @param mitigations the countermeasures of the model
 * @returns whether the threat is untreated: open, named by no countermeasure and not transferred
 */
export function isUntreated(threat: OtmThreat, mitigations: readonly OtmMitigation[]): boolean {
  return (
    threat.attributes.status === 'open' &&
    !threat.attributes.transferred &&
    !mitigations.some((entry) => entry.attributes.threat === threat.id)
  );
}

/**
 * @param status a status of a threat as the file holds it
 * @returns the status when it is one the application knows, `open` otherwise
 */
export function treatmentOf(status: string | undefined): ThreatTreatment {
  return (THREAT_TREATMENTS as readonly string[]).includes(status ?? '')
    ? (status as ThreatTreatment)
    : 'open';
}

/**
 * @param text what the person typed: ids separated by commas, semicolons, spaces or lines
 * @returns the ids, each once, in the order typed
 */
export function parseIssues(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\s,;]+/)) {
    if (part !== '') seen.add(part);
  }
  return [...seen];
}

/**
 * @param issues the issue ids of a countermeasure
 * @returns them as the field shows them
 */
export function issuesText(issues: readonly string[] | undefined): string {
  return (issues ?? []).join(', ');
}

/**
 * @param issues the ids typed
 * @returns the code of the first problem as the schema bounds the list, `null` when there is none
 */
export function issuesProblem(issues: readonly string[]): string | null {
  if (issues.length > MAX_ISSUES) return 'MAX_ITEMS';
  if (issues.some((issue) => issue.length > MAX_ISSUE_LENGTH)) return 'MAX_LENGTH';
  return null;
}

/**
 * @param date a calendar day, `YYYY-MM-DD`
 * @param months the months to add
 * @returns the day that many months later; the last day of a shorter month when the day does not exist there
 * (31 January plus one month is the last day of February); `null` for a text that is no day
 */
export function addMonths(date: string, months: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total % 12;
  const last = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const text = (n: number, width: number) => String(n).padStart(width, '0');
  return `${text(targetYear, 4)}-${text(targetMonth + 1, 2)}-${text(Math.min(day, last), 2)}`;
}

/**
 * @param from a calendar day
 * @param to a calendar day
 * @returns the whole days from `from` to `to`, negative when `to` is earlier; `null` for a text that is no day
 */
export function daysBetween(from: string, to: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to);
  if (!a || !b) return null;
  const left = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const right = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((right - left) / 86_400_000);
}

/** The codes of the errors of one row of a list, by the member of the row they name. */
export type RowErrors = Record<number, Record<string, string>>;

/**
 * Reads the errors a refused save names for the rows of one list of the model: the pointer `/threats/<n>/<member>/…` is
 * the member `<member>` of row `<n>`; the list itself (`/threats`) is the member `list` of row `-1`.
 *
 * @param errors the field errors of the part `model`
 * @param list the pointer of the list: `/threats` or `/mitigations`
 * @returns the code of the first error per row and member
 */
export function rowErrors(errors: FieldError[] | null, list: string): RowErrors {
  const found: RowErrors = {};
  for (const error of errors ?? []) {
    if (error.pointer === list) {
      (found[-1] ??= {}).list ??= error.code;
    } else if (error.pointer.startsWith(`${list}/`)) {
      const [index, member = 'row'] = error.pointer.slice(list.length + 1).split('/');
      const row = Number(index);
      if (!Number.isInteger(row) || row < 0) continue;
      (found[row] ??= {})[member] ??= error.code;
    }
  }
  return found;
}

/**
 * @param schema the schema of the document type, `kinds[n].schema`
 * @returns the schema of the file of the model: the property `model`, which the schema declares as a split of its own
 */
export function modelSchemaOf(schema: JsonSchema): JsonSchema | null {
  const model = (schema.properties as Record<string, JsonSchema> | undefined)?.model;
  return model && typeof model === 'object' ? model : null;
}

/**
 * @param schema a schema of an object
 * @param names the properties to take
 * @returns a schema of the same object with those properties only, in the order of the schema
 */
export function pickProperties(schema: JsonSchema, names: readonly string[]): JsonSchema {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(properties).filter(([name]) => names.includes(name)),
    ),
    required: required.filter((name) => names.includes(name)),
  };
}

/**
 * @param schema a schema of an object
 * @param names the properties to leave out
 * @returns a schema of the same object without them
 */
export function omitProperties(schema: JsonSchema, names: readonly string[]): JsonSchema {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  return pickProperties(
    schema,
    Object.keys(properties).filter((name) => !names.includes(name)),
  );
}

/**
 * Splits the pointer of a refusal of a transition, which names the field in the whole document (`/model/project/name`),
 * into the part and the pointer in that part's value (`/project/name`).
 *
 * @param pointer a pointer into the document
 * @returns the part and the pointer into its value
 */
export function splitPointer(pointer: string): { part: string; pointer: string } {
  if (pointer === '/model') return { part: MODEL_PART, pointer: '' };
  return pointer.startsWith('/model/')
    ? { part: MODEL_PART, pointer: pointer.slice('/model'.length) }
    : { part: DATA_PART, pointer };
}

/**
 * @param category one of the six kinds of threat of STRIDE as the file writes it (`Information Disclosure`)
 * @returns the last part of the catalogue key of its words (`information-disclosure`)
 */
export function categorySlug(category: string): string {
  return category.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

/**
 * @param text the number a person typed
 * @returns the number when the text is a whole number from 0 to 100, `null` otherwise
 */
export function percentOf(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= 0 && value <= 100 ? value : null;
}

/** The translation function of the catalogue (`$t`). */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * The two sides of a conflict over a list, in the words of the lens: how many entries and which, by id, name and status
 * (a threat) or threat (a countermeasure). A conflict is decided per list, so the person must be able to tell the two
 * lists apart.
 *
 * @param pointer the pointer of the list
 * @param value one side of the conflict
 * @param t the translation function
 * @returns the line, or `null` for a field that is no list of the model
 */
export function describeList(pointer: string, value: unknown, t: Translate): string | null {
  if (pointer !== '/threats' && pointer !== '/mitigations') return null;
  if (!Array.isArray(value)) return null;
  const size = t('documents.value.entries', { count: value.length });
  if (value.length === 0) return size;
  const content = value
    .map((entry: { id?: string; name?: string; attributes?: Record<string, unknown> }) => {
      const id = entry?.id ?? '';
      const name = entry?.name ?? '';
      const attributes = entry?.attributes ?? {};
      const note =
        pointer === '/threats'
          ? t(`threats.status.${treatmentOf(attributes.status as string | undefined)}`)
          : String(attributes.threat ?? '');
      return `${id}: ${name} (${note})`;
    })
    .join('; ');
  return t('documents.value.with-content', { size, content });
}

/** The start of the data URL of a diagram the app draws: a base64 vector image, nothing else. */
const DIAGRAM_PREFIX = 'data:image/svg+xml;base64,';

/**
 * The diagram is the server's text: it is drawn as an image only when it is a base64 vector image (an image element
 * runs no script), never as anything else.
 *
 * @param dataUrl the `dataUrl` of the diagram
 * @returns whether it may be the source of an image
 */
export function isDiagramUrl(dataUrl: string): boolean {
  if (!dataUrl.startsWith(DIAGRAM_PREFIX)) return false;
  const rest = dataUrl.slice(DIAGRAM_PREFIX.length).replace(/=+$/, '');
  return (
    rest.length > 0 &&
    /^[A-Za-z0-9+/]+$/.test(rest) &&
    dataUrl.length - DIAGRAM_PREFIX.length - rest.length <= 2
  );
}

/**
 * @param value the value of the part `model`
 * @returns the names of its components, in the order of the file, for the text alternative of the diagram
 */
export function componentNames(value: JsonObject | undefined): string[] {
  const list = value?.components;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry) => {
    const name = (entry as { name?: unknown } | null)?.name;
    return typeof name === 'string' && name !== '' ? [name] : [];
  });
}

/**
 * The state of the person's work, over several controllers: the most pressing one.
 *
 * @param state a save state
 * @returns its rank, higher for the one that tells the person more
 */
export function saveRank(state: string): number {
  const order = ['clean', 'saved', 'draft', 'drafting', 'changed', 'conflict', 'failed', 'saving'];
  return order.indexOf(state);
}

/** One change of the record a release makes: the part it is in and the words of its field. */
export interface ModelChange {
  /** A key that is unique in the record. */
  key: string;
  /** The part the change is in. */
  part: string;
  /**
   * The pointer into the value of the part. A threat or a countermeasure that is new, gone or changed is a change of its
   * own, with the pointer `/threats/<id>` or `/mitigations/<id>` (the id of the file, never the position).
   */
  pointer: string;
  /** The words of the field: the id of a threat or a countermeasure, empty when the title of the group says it. */
  label: string;
  before: unknown;
  after: unknown;
}

/** The changes of one property of one part. */
export interface ModelGroup {
  key: string;
  title: string;
  changes: ModelChange[];
}

/**
 * The diff of a release as the approver reads it (UC-TM-2, AUN-WEB-6): by property of the document, and for the lists of
 * threats and of countermeasures one change per threat or countermeasure that is new, gone or changed, by its id, so that
 * the approver reads "T-03: status open, then mitigated" and never two lists of nine entries side by side.
 *
 * @param diff the diff the server answered: the sections `data` and `model` with the whole lists
 * @param label the words of a field, by its pointer into the value of its part
 * @returns the groups in the order the server listed the changes
 */
export function groupModelDiff(
  diff: DocumentDiff,
  label: (part: string, pointer: string) => string,
): ModelGroup[] {
  const groups: ModelGroup[] = [];
  for (const section of diff.sections) {
    const byProperty = new Map<string, ModelGroup>();
    for (const change of section.changes) {
      const tokens = pointerTokens(change.pointer);
      const property = tokens[0] ?? '';
      let group = byProperty.get(property);
      if (!group) {
        group = {
          key: `${section.part}:${property}`,
          title: property === '' ? section.part : label(section.part, toPointer([property])),
          changes: [],
        };
        byProperty.set(property, group);
        groups.push(group);
      }
      const list = tokens.length === 1 && (property === 'threats' || property === 'mitigations');
      const byId = list ? elementChanges(section.part, change, group.key) : [];
      if (byId.length > 0) {
        group.changes.push(...byId);
      } else if (!list || !jsonEqual(change.before, change.after)) {
        // Another property, or a list that changed in a way no entry shows (the order, an entry without an id): the
        // approver reads the whole list as one change rather than a record that says nothing.
        group.changes.push({
          key: `${group.key}${change.pointer}`,
          part: section.part,
          pointer: change.pointer,
          label: tokens.length > 1 ? label(section.part, change.pointer) : '',
          before: change.before,
          after: change.after,
        });
      }
    }
  }
  return groups.filter((group) => group.changes.length > 0);
}

/** The changes of the entries of a list of the file, by id: new, gone or changed. */
function elementChanges(part: string, change: DiffChange, groupKey: string): ModelChange[] {
  const before = Array.isArray(change.before) ? (change.before as { id?: string }[]) : [];
  const after = Array.isArray(change.after) ? (change.after as { id?: string }[]) : [];
  const ids = [...new Set([...after, ...before].map((entry) => entry?.id ?? ''))].filter(
    (id) => id !== '',
  );
  const found = (list: { id?: string }[], id: string) => list.find((entry) => entry?.id === id);
  return ids.flatMap((id) => {
    const was = found(before, id) ?? null;
    const is = found(after, id) ?? null;
    if (jsonEqual(was, is)) return [];
    return [
      {
        key: `${groupKey}/${id}`,
        part,
        pointer: `${change.pointer}/${id}`,
        label: id,
        before: was,
        after: is,
      },
    ];
  });
}
