/**
 * What the Catalogs lens knows of the five catalogs (rest-api.adoc, Directory and Catalog Requests): which they are,
 * who may change them, the words of a catalog and of a reference to one of its entries, the schema of an entry that is
 * changed, and the signed history worded for the margin.
 */
import type {
  CatalogHistoryLine,
  CatalogId,
  EffectiveNeeds,
  JsonSchema,
  Session,
} from '../api/types';
import { CATALOGS } from '../api/types';
import type { HistoryEntry } from '../components/HistoryList.svelte';
import { isObject } from '../forms/schema';
import { formatAgo, formatDateTime } from '../format';
import { humanizeKey } from '../i18n';

/** The repository whose rights govern the catalogs (rest-api.adoc, Decided Provisionally with the directory, point 10). */
export const CATALOG_REPOSITORY = 'directory';

/** The category the form kit is given for the form of an entry; the kind is the catalog's id. */
export const CATALOG_CATEGORY = 'catalog';

/**
 * @param id an address segment
 * @returns whether it names one of the five catalogs
 */
export function isCatalog(id: string): id is CatalogId {
  return (CATALOGS as readonly string[]).includes(id);
}

/**
 * @param session the session
 * @returns whether the user holds the right `administer-catalogs`; without it every catalog is read-only
 */
export function canAdminister(session: Session | null): boolean {
  return (
    session?.rights.some(
      (right) =>
        right.repository === CATALOG_REPOSITORY && right.actions.includes('administer-catalogs'),
    ) ?? false
  );
}

/**
 * @param messages the catalogue
 * @param catalog the catalog id
 * @returns the name of the catalog as a list (`catalog.<catalog>.name`), or the id in words
 */
export function catalogName(messages: Record<string, string>, catalog: string): string {
  const key = `catalog.${catalog}.name`;
  return Object.hasOwn(messages, key) ? messages[key] : humanizeKey(catalog);
}

/**
 * @param messages the catalogue
 * @param catalog the catalog id
 * @returns the word for one entry of the catalog (`catalog.<catalog>.kind`), or the id in words
 */
export function catalogKind(messages: Record<string, string>, catalog: string): string {
  const key = `catalog.${catalog}.kind`;
  return Object.hasOwn(messages, key) ? messages[key] : humanizeKey(catalog);
}

/**
 * @param catalog the catalog
 * @param id the entry id
 * @returns the canonical address of the entry
 */
export function entryAddress(catalog: string, id: string): string {
  return `/catalogs/${encodeURIComponent(catalog)}/${encodeURIComponent(id)}`;
}

/**
 * @param ref a reference, `<catalog>:<id>`
 * @returns the canonical address of the entry it names, or `null` for a text that is no reference to one of the catalogs
 */
export function refAddress(ref: string): string | null {
  const split = ref.indexOf(':');
  if (split <= 0 || split === ref.length - 1) return null;
  const catalog = ref.slice(0, split);
  return isCatalog(catalog) ? entryAddress(catalog, ref.slice(split + 1)) : null;
}

/**
 * The name a reference goes by in a sentence: the name of the entry when the service's own reads know it, else the id.
 *
 * @param ref a reference, `<catalog>:<id>`
 * @param own the reference of the service being read, and its name
 * @param effective what the service's dependencies come to
 * @returns the name
 */
export function nameOfRef(
  ref: string,
  own: { ref: string; name: string },
  effective: EffectiveNeeds | null,
): string {
  if (ref === own.ref) return own.name;
  return (
    effective?.dependencies.find((entry) => entry.ref === ref)?.name ??
    ref.slice(ref.indexOf(':') + 1)
  );
}

/**
 * The schema of an entry as the form shows it: for an entry that exists the `id` is read, never edited, and is not
 * mandatory (the address decides it); a new entry asks for it.
 *
 * @param schema the schema of the catalog
 * @param existing whether the entry exists
 * @returns the schema to hand to the form
 */
export function formSchema(schema: JsonSchema, existing: boolean): JsonSchema {
  if (!existing || !isObject(schema.properties)) return schema;
  const properties = schema.properties as Record<string, unknown>;
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name) => name !== 'id')
    : [];
  return {
    ...schema,
    required,
    properties: {
      ...properties,
      id: { ...(isObject(properties.id) ? properties.id : {}), readOnly: true },
    },
  };
}

/** The words of the history, as the catalogue holds them. */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * @param lines the history of an entry, newest first
 * @param t the translation function
 * @param locale the language
 * @param now the present
 * @returns the worded lines
 */
export function catalogHistory(
  lines: CatalogHistoryLine[],
  t: Translate,
  locale: string,
  now: Date = new Date(),
): HistoryEntry[] {
  return lines.map((line, index) => {
    const recent = now.getTime() - new Date(line.at).getTime() < 86_400_000;
    return {
      key: `${line.at}-${index}`,
      who: line.by.name,
      what: t(`catalogs.history.${line.kind}`),
      when: recent ? formatAgo(line.at, locale, now) : formatDateTime(line.at, locale),
      datetime: line.at,
    };
  });
}
