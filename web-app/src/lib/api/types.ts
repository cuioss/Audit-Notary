/**
 * The wire types of the shell requests (doc/specification/web-app.adoc, AUN-WEB-9).
 */

/** The actions a right names (AUN-AUTH-2). */
export type Action = 'read' | 'edit' | 'approve' | 'administer-catalogs';

/** One mapped right: the actions the user may take on one repository. */
export interface Right {
  repository: string;
  actions: Action[];
}

/** `GET /api/v1/session`. */
export interface Session {
  user: { pseudonym: string | null; name: string };
  rights: Right[];
  csrfToken: string;
  firstLoginRequired: boolean;
}

/** The fetch state of one repository. */
export interface RepositoryStatus {
  alias: string;
  fetch: 'UP' | 'DOWN';
}

/** `GET /api/v1/status`, and the body of the event `status`. */
export interface Status {
  version: string;
  degraded: boolean;
  repositories: RepositoryStatus[];
}

/** One entry of the Due lens. */
export interface DueItem {
  kind: 'deadline' | 'review' | 'release';
  lens: 'samm' | 'threat-models' | 'incidents' | 'isms';
  title: string;
  address: string;
  due: string;
}

/** `GET /api/v1/due`. */
export interface DueList {
  items: DueItem[];
}

/** `GET /api/v1/directory/me`: the prefill of the first-login form (AUN-DIR-2). */
export interface DirectoryPrefill {
  name: string;
  teams: string[];
  informationText: string;
}

/** One entry of a catalog. */
export interface CatalogEntry {
  id: string;
  name: string;
}

/** `GET /api/v1/catalogs/{catalog}`. */
export interface CatalogList {
  entries: CatalogEntry[];
}

/** The body of `PUT /api/v1/directory/me`. */
export interface DirectoryEntry {
  name: string;
  team: string;
  role: string;
}

/** The answer of a successful save of the own entry. */
export interface DirectorySaved {
  outcome: 'SAVED';
  pseudonym: string;
}

/** The answer of `POST /api/v1/auth/logout`. */
export interface LogoutAnswer {
  redirect: string;
}

/** `document-saved` on the event stream (AUN-WEB-5). */
export interface DocumentSavedEvent {
  repository: string;
  id: string;
  fields: string[];
}
