/**
 * What the generic documents lens knows of the categories (rest-api.adoc, The Generic Documents Lens): which categories it
 * shows, which repository holds the documents of a document type, which rights the session has there, and the words of a
 * category, a document type and a field that the catalogue holds as data.
 */
import { derived, writable } from 'svelte/store';
import { apiClient, type ApiClient } from '../api/client';
import { isApiError } from '../api/errors';
import type { Action, Category, CategoryList, DocumentRead, Session } from '../api/types';
import { labelOf } from '../forms/texts';
import { humanizeKey } from '../i18n';

/** The categories as the shell last read them; `null` until the first read, and after a read that failed. */
export const categoryList = writable<CategoryList | null>(null);

/**
 * @param category a category
 * @returns whether the lens lists and counts it: a generic category that is switched on
 */
export function isShown(category: Category): boolean {
  return category.generic && category.enabled !== false;
}

/** Whether the rail offers the lens: while `GET /api/v1/categories` lists a generic category that is switched on. */
export const hasDocumentsLens = derived(categoryList, (list) =>
  (list?.categories ?? []).some(isShown),
);

/**
 * Reads the categories and keeps them for the shell.
 *
 * @param client the client
 * @returns the categories
 */
export async function loadCategories(client: ApiClient = apiClient): Promise<CategoryList> {
  const list = await client.listCategories();
  categoryList.set(list);
  return list;
}

/**
 * Reads the categories for the rail and keeps quiet when that is not possible: a session without a right, a first login
 * or a server that cannot be reached has no documents lens for now.
 *
 * @param client the client
 */
export async function refreshCategories(client: ApiClient = apiClient): Promise<void> {
  try {
    await loadCategories(client);
  } catch {
    categoryList.set(null);
  }
}

/**
 * @param category a category
 * @returns the repositories of its document types, each once
 */
export function repositoriesOf(category: Category): string[] {
  return [...new Set(category.kinds.map((kind) => kind.repository))];
}

/**
 * @param session the session
 * @param repository a repository alias
 * @returns the actions the session may take there
 */
export function actionsOn(session: Session | null, repository: string): Action[] {
  return session?.rights.find((right) => right.repository === repository)?.actions ?? [];
}

/**
 * Reads a document of a category by its id: the address names the category and the document, never the repository, so
 * the document is looked for in the repositories of the category's document types, one after the other.
 *
 * @param client the client
 * @param category the category
 * @param id the document id
 * @param at a revision, for a read of an earlier state
 * @returns the document
 * @throws ApiError `NOT_FOUND` when no repository of the category holds it (or the revision), any other refusal as it is
 */
export async function findDocument(
  client: ApiClient,
  category: Category,
  id: string,
  at?: string,
): Promise<DocumentRead> {
  let missing: unknown = null;
  for (const repository of repositoriesOf(category)) {
    try {
      return await client.getDocument(repository, id, at);
    } catch (error) {
      if (!isApiError(error) || error.outcome !== 'NOT_FOUND') throw error;
      missing = error;
    }
  }
  if (missing !== null) throw missing;
  throw new Error(`category ${category.id} has no repository`);
}

/**
 * @param messages the catalogue
 * @param key a key
 * @param fallback the text when the catalogue has none
 * @returns the text, or the fallback
 */
function lookup(messages: Record<string, string>, key: string, fallback: string): string {
  return Object.hasOwn(messages, key) ? messages[key] : fallback;
}

/**
 * @param messages the catalogue
 * @param category the category id
 * @returns its name (the catalogue key `category.<category>.name`), or the id in words
 */
export function categoryName(messages: Record<string, string>, category: string): string {
  return lookup(messages, `category.${category}.name`, humanizeKey(category));
}

/**
 * @param messages the catalogue
 * @param category the category id
 * @param kind the document type id
 * @returns its name (`category.<category>.<kind>.name`), or the id in words
 */
export function kindName(messages: Record<string, string>, category: string, kind: string): string {
  return lookup(messages, `category.${category}.${kind}.name`, humanizeKey(kind));
}

/**
 * @param messages the catalogue
 * @param category the category id
 * @param transition the transition id
 * @returns the text of the act (`category.<category>.transition.<id>`), or the id in words
 */
export function transitionName(
  messages: Record<string, string>,
  category: string,
  transition: string,
): string {
  return lookup(messages, `category.${category}.transition.${transition}`, humanizeKey(transition));
}

/**
 * @param messages the catalogue
 * @param category the category id
 * @param kind the document type id
 * @param pointer a JSON Pointer into the document's value
 * @returns the label of the field the pointer names: the label of the nearest property, rows left out
 */
export function fieldLabel(
  messages: Record<string, string>,
  category: string,
  kind: string,
  pointer: string,
): string {
  const path = pointer
    .split('/')
    .slice(1)
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))
    .filter((token) => !/^\d+$/.test(token));
  return labelOf(messages, category, kind, path, path.at(-1) ?? pointer);
}
