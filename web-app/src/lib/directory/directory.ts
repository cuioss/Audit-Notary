/**
 * What the pages of the directory know (rest-api.adoc, Directory and Catalog Requests): who may administer it, the
 * limits of the import and of the prefill, the words of a person and of a membership, the reasons the import leaves an
 * entity out, and whether the own entry is due for its confirmation.
 */
import {
  apiClient,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_DOCUMENTS,
  MAX_MEMBERSHIPS,
  MAX_PERSONS_PER_REQUEST,
} from '../api/client';
import type { FieldError } from '../api/errors';
import type {
  CatalogEntry,
  ImportDocument,
  Membership,
  PersonState,
  PersonSummary,
  Session,
} from '../api/types';
import { humanizeKey, hasMessage } from '../i18n';
import { errorKey } from '../forms/fieldErrors';
import { labelOf } from '../forms/texts';
import { CATALOG_CATEGORY } from '../catalogs/catalogs';

export { MAX_IMPORT_BYTES, MAX_IMPORT_DOCUMENTS, MAX_MEMBERSHIPS, MAX_PERSONS_PER_REQUEST };

/** The address of the person directory. */
export const PERSONS_ADDRESS = '/directory/persons';

/** The address of the Backstage import. */
export const IMPORT_ADDRESS = '/directory/import';

/** The address of the own directory entry. */
export const PROFILE_ADDRESS = '/settings/profile';

/**
 * @param session the session, `null` while it is not read
 * @returns whether the own entry is due for its confirmation: the shell then shows a notice with a link to the page of
 * the entry (never a gate)
 */
export function confirmationDue(session: Session | null): boolean {
  return session?.directoryConfirmationDue === true && !session.firstLoginRequired;
}

/**
 * @param text a text
 * @returns its size in bytes as UTF-8, the unit of the import's limit
 */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** What the chosen descriptors come to against the limits of the import. */
export interface ImportBudget {
  /** The number of documents. */
  count: number;
  /** Their size together, in bytes of UTF-8. */
  bytes: number;
  /** More documents than one import takes. */
  tooMany: boolean;
  /** More bytes than one import takes. */
  tooLarge: boolean;
}

/**
 * @param documents the chosen descriptors
 * @returns their number and size, and whether either is above its limit
 */
export function importBudget(documents: ImportDocument[]): ImportBudget {
  const bytes = documents.reduce((sum, document) => sum + byteLength(document.content), 0);
  return {
    count: documents.length,
    bytes,
    tooMany: documents.length > MAX_IMPORT_DOCUMENTS,
    tooLarge: bytes > MAX_IMPORT_BYTES,
  };
}

/**
 * @param bytes a size
 * @returns it in the unit a person reads: bytes below one KiB, then KiB with one decimal, then MiB
 */
export function sizeParts(bytes: number): { value: string; unit: 'B' | 'KiB' | 'MiB' } {
  if (bytes < 1024) return { value: String(bytes), unit: 'B' };
  if (bytes < 1024 * 1024) return { value: (bytes / 1024).toFixed(1), unit: 'KiB' };
  return { value: (bytes / (1024 * 1024)).toFixed(1), unit: 'MiB' };
}

/**
 * @param reason a reason code of the import, `LIFECYCLE_UNMAPPED`
 * @returns the catalogue key of its text, `import.reason.lifecycle-unmapped`; a reason this web app does not know has the
 * key `import.reason.unknown`
 */
export function importReasonKey(reason: string): string {
  const key = `import.reason.${reason.toLowerCase().replaceAll('_', '-')}`;
  return hasMessage(key) ? key : 'import.reason.unknown';
}

/**
 * @param messages the catalogue
 * @param catalog the catalog the changed entry belongs to
 * @param path a dotted path of the entry's value, `owner.team`
 * @returns the label the form of the catalog shows for the field, or the path in words
 */
export function changedFieldLabel(
  messages: Record<string, string>,
  catalog: string,
  path: string,
): string {
  const segments = path.split('.');
  return labelOf(
    messages,
    CATALOG_CATEGORY,
    catalog,
    segments,
    humanizeKey(segments[segments.length - 1] ?? path),
  );
}

/** The names of the entries of a catalog, by id. */
export type Names = ReadonlyMap<string, string>;

/**
 * @param entries the entries of a catalog
 * @returns their names by id
 */
export function namesOf(entries: CatalogEntry[]): Names {
  return new Map(entries.map((entry) => [entry.id, entry.name]));
}

/**
 * @param reference a catalog reference, `team:payments`
 * @param names the names of the entries of its catalog
 * @returns the name of the entry, or its id when the catalog does not know it
 */
export function referenceName(reference: string, names: Names): string {
  const id = reference.slice(reference.indexOf(':') + 1);
  return names.get(id) ?? id;
}

/**
 * @param membership a membership
 * @param teams the names of the teams
 * @param roles the names of the roles
 * @param words puts the names of the team and of the role in a sentence (`directory.membership.text`)
 * @returns the membership in words, `Payments, Developer`
 */
export function membershipText(
  membership: Membership,
  teams: Names,
  roles: Names,
  words: (team: string, role: string) => string,
): string {
  return words(referenceName(membership.team, teams), referenceName(membership.role, roles));
}

/**
 * @param person a person of the directory
 * @returns whether the name of the person is known (a former member has none)
 */
export function hasName(person: PersonSummary): person is PersonSummary & { name: string } {
  return person.name !== null;
}

/**
 * @param state the state of a person entry
 * @returns the catalogue key of its word
 */
export function personStateKey(state: PersonState): string {
  return `directory.persons.state.${state}`;
}

/**
 * @param name a name
 * @returns it as the table compares names: trimmed, lower case, inner blanks as one
 */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * @param persons the persons of the directory
 * @param typed what was typed in the search
 * @returns the persons whose name contains it, upper and lower case alike; the server's filter is the same, a complete
 * answer is narrowed here as well (rest-api.adoc, the row of `GET /api/v1/directory/persons`)
 */
export function narrowPersons(persons: PersonSummary[], typed: string): PersonSummary[] {
  const needle = nameKey(typed);
  if (needle === '') return persons;
  return persons.filter((person) => nameKey(person.name ?? '').includes(needle));
}

/** The teams and the roles of the catalogs, which a membership is picked from. */
export interface TeamsAndRoles {
  teams: CatalogEntry[];
  roles: CatalogEntry[];
}

/**
 * @returns the entries of the catalogs `team` and `role`, retired ones included (the pickers do not offer a retired entry
 * that is not held)
 * @throws ApiError when a catalog cannot be read
 */
export async function loadTeamsAndRoles(): Promise<TeamsAndRoles> {
  const [teams, roles] = await Promise.all([
    apiClient.getCatalog('team'),
    apiClient.getCatalog('role'),
  ]);
  return { teams: teams.entries, roles: roles.entries };
}

/**
 * @param errors the field errors of a `422 VALIDATION`
 * @returns the catalogue key of the text of each, by pointer; a pointer named twice keeps its first error
 */
export function errorKeysByPointer(errors: FieldError[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const error of errors) {
    if (!Object.hasOwn(result, error.pointer)) result[error.pointer] = errorKey(error.code);
  }
  return result;
}

/**
 * @param memberships the memberships of an entry as typed
 * @returns whether there are one to {@link MAX_MEMBERSHIPS} and every one names a team and a role
 */
export function membershipsComplete(memberships: Membership[]): boolean {
  return (
    memberships.length >= 1 &&
    memberships.length <= MAX_MEMBERSHIPS &&
    memberships.every((membership) => membership.team !== '' && membership.role !== '')
  );
}

/**
 * @param left memberships
 * @param right memberships
 * @returns whether both hold the same teams and roles in the same order
 */
export function sameMemberships(left: Membership[], right: Membership[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item.team === right[index].team && item.role === right[index].role)
  );
}
