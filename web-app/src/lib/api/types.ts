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
  /**
   * PROVISIONAL: the own directory entry is due for its confirmation (rest-api.adoc, Decided Provisionally with the
   * directory, point 13). Absent reads `false`. The shell then shows a notice with a link to `/settings/profile`; it is
   * never a gate.
   */
  directoryConfirmationDue?: boolean;
}

/** The fetch state of one repository. */
export interface RepositoryStatus {
  alias: string;
  fetch: 'UP' | 'DOWN';
}

/**
 * How a transition that requires step-up confirms the user (AUN-AUTH-4): the identity provider's MFA, the renewed
 * password of a local user, or not at all (`step-up.enabled: false`).
 */
export type StepUpMethod = 'mfa' | 'password' | 'off';

/**
 * How the installation logs users in: the identity provider (`oidc`), or the local test accounts of a users file
 * (`local`, AUN-AUTH-6).
 */
export type LoginProvider = 'oidc' | 'local';

/** `GET /api/v1/status`, and the body of the event `status`. */
export interface Status {
  version: string;
  degraded: boolean;
  repositories: RepositoryStatus[];
  /**
   * How the login works (rest-api.adoc, `GET /api/v1/status`). Absent reads as `oidc`: PROVISIONAL tolerance, so an
   * older server does not break the shell. With `local` the shell shows the notice of local test accounts and the
   * login is the web app's page `/login`.
   */
  loginProvider?: LoginProvider;
  /**
   * PROVISIONAL: how step-up confirms a transition, so the step-up handler knows whether to ask for the password
   * or to leave for the identity provider (AUN-WEB-6). Absent means `mfa` with the identity provider and `off`
   * with local users. The method is never a label.
   */
  stepUp?: StepUpMethod;
}

/** One entry of the Due lens. */
export interface DueItem {
  kind: 'deadline' | 'review' | 'release';
  lens: 'samm' | 'threat-models' | 'incidents' | 'isms' | 'categories';
  title: string;
  address: string;
  due: string;
  /**
   * The release request behind a `release` item, and behind a `review` item of an approver when one is pending
   * (rest-api.adoc, Release Requests; PROVISIONAL): its id, who asked, when, and the comment. The four members come
   * together.
   */
  requestId?: string;
  requestedBy?: Person;
  requestedAt?: string;
  comment?: string;
}

/** `GET /api/v1/due`. */
export interface DueList {
  items: DueItem[];
}

/** The team and the role of a membership, both catalog references (`team:payments`). */
export interface Membership {
  team: string;
  role: string;
}

/** The own directory entry of `GET /api/v1/directory/me` (PROVISIONAL, rest-api.adoc, The Own Entry). */
export interface OwnEntry {
  pseudonym: string;
  name: string;
  memberships: Membership[];
  /** The day the entry was last confirmed, `YYYY-MM-DD`. */
  confirmedAt: string;
  /** Whether `confirmedAt` is older than the server's interval. */
  confirmationDue: boolean;
}

/**
 * `GET /api/v1/directory/me`: the prefill of the first-login form (AUN-DIR-2) and, once the entry exists, the entry.
 * `entry` is `null` while the first login is required; an older server leaves it out.
 */
export interface DirectoryPrefill {
  name: string;
  teams: string[];
  informationText: string;
  entry?: OwnEntry | null;
}

/** One entry of a catalog; `retired` is absent for an entry that is not retired (AUN-DIR-4). */
export interface CatalogEntry {
  id: string;
  name: string;
  retired?: boolean;
}

/** `GET /api/v1/catalogs/{catalog}`. */
export interface CatalogList {
  entries: CatalogEntry[];
}

/** The catalogs the Catalogs lens shows, in the order of its first column (rest-api.adoc, The Addresses). */
export const CATALOGS = ['team', 'role', 'service', 'system', 'external'] as const;

/** One of the five catalogs. */
export type CatalogId = (typeof CATALOGS)[number];

/** `GET /api/v1/catalogs/{catalog}/schema` (PROVISIONAL): the JSON Schema of the entries of a catalog. */
export interface CatalogSchema {
  catalog: string;
  schema: JsonSchema;
}

/** The three levels of a protection need, in rising order (BSI-Standard 200-2). */
export const PROTECTION_LEVELS = ['normal', 'high', 'very-high'] as const;

/** One level of a protection need. */
export type ProtectionLevel = (typeof PROTECTION_LEVELS)[number];

/** The three dimensions of a protection need. */
export const PROTECTION_DIMENSIONS = ['confidentiality', 'integrity', 'availability'] as const;

/** One dimension of a protection need. */
export type ProtectionDimension = (typeof PROTECTION_DIMENSIONS)[number];

/** A protection need per dimension. */
export type ProtectionNeeds = Record<ProtectionDimension, ProtectionLevel>;

/**
 * One service or external party a service reaches through `dependsOn` (PROVISIONAL): `counts` when it is a service that
 * is not retired and whose needs are known; an external party has none.
 */
export interface Dependency {
  /** The reference, `<catalog>:<id>`. */
  ref: string;
  name: string;
  /** How many steps from the service: 1 is a direct dependency. */
  depth: number;
  /** The reference it was first reached from. */
  via: string;
  retired: boolean;
  counts: boolean;
  protectionNeeds: ProtectionNeeds | null;
}

/** What a service's protection needs come to once the dependencies are read (AUN-DIR-5; PROVISIONAL). */
export interface EffectiveNeeds {
  /** The highest value per dimension over the service and every dependency that counts. */
  protectionNeeds: ProtectionNeeds;
  /** The reference that decides each dimension: the first of the service itself and then the dependencies. */
  decidedBy: Record<ProtectionDimension, string>;
  /** Every service and external party reachable through `dependsOn`, breadth first. */
  dependencies: Dependency[];
  /** The references of the services on a cycle the service is on or reaches; `null` without one. */
  cycle: string[] | null;
}

/** One line of the signed history of a catalog entry (PROVISIONAL). */
export interface CatalogHistoryLine {
  kind: 'create' | 'save' | 'retire';
  at: string;
  by: Person;
}

/** `GET /api/v1/catalogs/{catalog}/{id}` (PROVISIONAL): the whole entry. */
export interface CatalogEntryRead {
  catalog: string;
  id: string;
  name: string;
  retired: boolean;
  /** The entry as the schema of its catalog holds it. */
  value: JsonObject;
  /** The effective protection needs of a service; `null` for every other catalog. */
  effective: EffectiveNeeds | null;
  at: string;
  /** The signed history, newest first. */
  history: CatalogHistoryLine[];
}

/** `201` of `POST /api/v1/catalogs/{catalog}`. */
export interface CatalogCreated {
  outcome: 'CREATED';
  catalog: string;
  id: string;
  address: string;
  at: string;
}

/** `200` of `PUT /api/v1/catalogs/{catalog}/{id}`. */
export interface CatalogSaved {
  outcome: 'SAVED';
  catalog: string;
  id: string;
  at: string;
}

/** `200` of `POST /api/v1/catalogs/{catalog}/{id}/retirement`. */
export interface CatalogRetired {
  outcome: 'RETIRED';
  catalog: string;
  id: string;
  at: string;
}

/** `catalog-changed` on the event stream (PROVISIONAL): someone saved, created or retired an entry. */
export const CATALOG_CHANGED_EVENT = 'catalog-changed';

/** The data of `catalog-changed`. */
export interface CatalogChangedEvent {
  catalog: string;
  id: string;
  by?: Person;
}

/**
 * The body of `PUT /api/v1/directory/me` of the first login (AUN-DIR-2): the ids of one team and one role without their
 * prefix. `binding` is a candidate's pseudonym or `new`, sent after `BINDING_CANDIDATES` (PROVISIONAL).
 */
export interface DirectoryEntry {
  name: string;
  team: string;
  role: string;
  binding?: string;
}

/** The body of `PUT /api/v1/directory/me` of a user who has an entry: one to five memberships (PROVISIONAL). */
export interface OwnEntryChange {
  name: string;
  memberships: Membership[];
}

/** The answer of a successful save of the own entry; `confirmedAt` is there for a change of an existing entry. */
export interface DirectorySaved {
  outcome: 'SAVED';
  pseudonym: string;
  confirmedAt?: string;
}

/** The answer of `POST /api/v1/directory/me/confirmation` (PROVISIONAL). */
export interface DirectoryConfirmed {
  outcome: 'CONFIRMED';
  confirmedAt: string;
}

/** One candidate of the refusal `BINDING_CANDIDATES`: a prefilled entry the person may take over (PROVISIONAL). */
export interface BindingCandidate {
  pseudonym: string;
  name: string;
  memberships: Membership[];
}

/** One descriptor document of the Backstage import: its name and its text (PROVISIONAL). */
export interface ImportDocument {
  name: string;
  content: string;
}

/** An entry the import created, or would create. */
export interface ImportCreated {
  catalog: string;
  id: string;
  name: string;
}

/** An entry the import updated, or would update, with the fields of its value that change, as dotted paths. */
export interface ImportUpdated extends ImportCreated {
  changed: string[];
}

/** What the import left out of a descriptor. `field` and `detail` may be `null`. */
export interface ImportLeftOut {
  entity: string;
  field: string | null;
  /** `NAMESPACE_NOT_DEFAULT`, `REFERENCE_KIND_NOT_SUPPORTED`, `LIFECYCLE_UNMAPPED`, `DEFAULTS_MISSING` or `KIND_NOT_SUPPORTED`. */
  reason: string;
  detail: string | null;
}

/** The answer of the preview (`PREVIEW`) and of the import (`IMPORTED`): one shape (PROVISIONAL). */
export interface ImportResult {
  outcome: 'PREVIEW' | 'IMPORTED';
  created: ImportCreated[];
  updated: ImportUpdated[];
  unchanged: number;
  leftOut: ImportLeftOut[];
}

/** One person of the prefill request: a name and one to five memberships (PROVISIONAL). */
export interface PersonDraft {
  name: string;
  memberships: Membership[];
}

/** The answer of `POST /api/v1/directory/persons`. */
export interface PersonsCreated {
  outcome: 'CREATED';
  persons: PersonSummary[];
}

/** The answer of `POST /api/v1/directory/erasures`. */
export interface Erased {
  outcome: 'ERASED';
  pseudonym: string;
  erasedOn: string;
}

/** The answer of `POST /api/v1/auth/logout`. */
export interface LogoutAnswer {
  redirect: string;
}

/** A JSON value. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** A JSON object. */
export type JsonObject = { [key: string]: JsonValue };

/**
 * `document-saved` on the event stream (AUN-WEB-5). `part` and `by` are optional (rest-api.adoc, Events of the
 * Lifecycle; PROVISIONAL): the part the save changed, and who saved. For a document of the generic lens `fields` are
 * JSON Pointers into the value of `part`.
 */
export interface DocumentSavedEvent {
  repository: string;
  id: string;
  fields: string[];
  part?: string;
  by?: { pseudonym: string; name: string };
}

/**
 * The events of the document lifecycle on the stream (rest-api.adoc, Events of the Lifecycle): the open sheet of a document
 * reads it again on any of them.
 */
export const LIFECYCLE_EVENTS = [
  'document-saved',
  'document-created',
  'document-transitioned',
  'release-requested',
] as const;

/** `document-created` on the event stream (PROVISIONAL): the lists refresh. */
export interface DocumentCreatedEvent {
  repository: string;
  id: string;
  kind: string;
}

/** `document-transitioned` on the event stream (PROVISIONAL), for a submit and for a release. */
export interface DocumentTransitionedEvent {
  repository: string;
  id: string;
  state: WorkflowState;
  version: number;
  by: { pseudonym: string; name: string };
}

/** `release-requested` on the event stream (PROVISIONAL): Due refreshes. */
export interface ReleaseRequestedEvent {
  repository: string;
  id: string;
  requestId: string;
}

/*
 * Documents and SAMM (AUN-WEB-5, AUN-WEB-6, AUN-SAMM-1 … AUN-SAMM-6).
 *
 * The request paths are those of the specification; the shapes of the answers it leaves open are PROVISIONAL and
 * shaped by the visual design: the scope list, the scope, the assessment with its parts and signed history, and the
 * diff. They are marked where they are declared.
 */

/** A person as a document shows them: the pseudonym it stores and the name the directory resolves. */
export interface Person {
  pseudonym: string;
  name: string;
  role?: string;
}

/** The workflow states of a document. */
export type WorkflowState = 'draft' | 'in-review' | 'released';

/**
 * One line of a document's signed history: a commit, written by a person at a time (PROVISIONAL shape). The words
 * come from the catalogue by `kind`; the server sends no sentence.
 */
export interface HistoryLine {
  at: string;
  by: Person;
  kind: 'create' | 'save' | 'submit' | 'release';
  /** The part a save changed, such as a practice id. */
  part?: string;
  /** How many fields the save changed. */
  count?: number;
  /** The tag a release wrote. */
  tag?: string;
}

/** The loaded version of one part (one file) of a document: its blob id and who saved it when. */
export interface PartVersion {
  blob: string;
  savedAt: string;
  savedBy: Person;
}

/** A release of a document. */
export interface ReleaseInfo {
  tag: string;
  at: string;
  by: Person;
}

/** One answer of a model's answer set. */
export interface SammAnswerOption {
  value: number;
  text: string;
}

/** One question of a stream at one maturity level. */
export interface SammQuestion {
  id: string;
  level: 1 | 2 | 3;
  activity: string;
  text: string;
  quality: string[];
  answers: SammAnswerOption[];
}

/** One stream of a practice. */
export interface SammStream {
  letter: 'A' | 'B';
  name: string;
  questions: SammQuestion[];
}

/** One security practice. */
export interface SammPractice {
  id: string;
  shortName: string;
  name: string;
  description: string;
  streams: SammStream[];
}

/** One business function. */
export interface SammFunction {
  id: string;
  name: string;
  practices: SammPractice[];
}

/** `GET /api/v1/samm/models/{version}`: a pinned model version (PROVISIONAL path). */
export interface SammModel {
  model: string;
  version: string;
  source: string;
  licence: string;
  attribution: string;
  functions: SammFunction[];
}

/** The subject of a scope (AUN-SAMM-2). */
export interface SammSubject {
  kind: 'team' | 'service' | 'organisation';
  id?: string;
  name: string;
}

/** One scope of the list (PROVISIONAL). */
export interface SammScopeSummary {
  id: string;
  title: string;
  subject: SammSubject;
  latest: { assessment: string; title: string; date: string; overall: number } | null;
  open: { assessment: string; title: string; state: WorkflowState } | null;
  assessments: number;
}

/** `GET /api/v1/samm/scopes` (PROVISIONAL). */
export interface SammScopeList {
  scopes: SammScopeSummary[];
}

/** The target of one practice (`targets.yaml`). */
export interface SammTarget {
  target: number;
  due?: string;
}

/** One assessment of a scope (PROVISIONAL). */
export interface SammAssessmentSummary {
  /** The address segment. */
  id: string;
  /** The document id. */
  document: string;
  title: string;
  date: string;
  state: WorkflowState;
  modelVersion: string;
  /** The overall score of a submitted or released assessment; `null` for a draft. */
  overall: number | null;
  answered: number;
  release: ReleaseInfo | null;
}

/**
 * `GET /api/v1/samm/scopes/{scope}` (PROVISIONAL). The scope is a document without a workflow: `document` is its id for
 * the generic save and `parts` holds the blob of its `data` and of the roadmap, `targets` (rest-api.adoc, SAMM Requests).
 */
export interface SammScope {
  id: string;
  document: string;
  title: string;
  subject: SammSubject;
  modelVersion: string;
  targets: Record<string, SammTarget>;
  parts: Record<string, PartVersion>;
  assessments: SammAssessmentSummary[];
}

/** One pinned model version of `GET /api/v1/samm/models` (PROVISIONAL). */
export interface SammModelPin {
  version: string;
  source: string;
  checksum: string;
  /** The day the version was pinned, `YYYY-MM-DD`. */
  pinnedAt: string;
  /** Whether the application takes the version for a new scope or assessment. */
  default: boolean;
}

/** `GET /api/v1/samm/models` (PROVISIONAL): newest first; empty for an installation that pins none. */
export interface SammModelList {
  models: SammModelPin[];
}

/** The body of `POST /api/v1/samm/scopes` (PROVISIONAL): `subject` is `team:<id>`, `service:<id>` or `organisation`. */
export interface SammScopeDraft {
  title: string;
  subject: string;
  modelVersion?: string;
  targets?: Record<string, SammTarget>;
}

/** The answer of `POST /api/v1/samm/scopes` (`201`). */
export interface SammScopeCreated {
  outcome: 'CREATED';
  /** The address segment the server assigned. */
  id: string;
  document: string;
  address: string;
  at: string;
  parts: Record<string, PartVersion>;
}

/** The body of `POST /api/v1/samm/{scope}/assessments` (PROVISIONAL): `assessors` are further pseudonyms. */
export interface SammAssessmentDraft {
  title: string;
  date: string;
  modelVersion?: string;
  assessors?: string[];
}

/** The answer of `POST /api/v1/samm/{scope}/assessments` (`201`): the assessment is empty and a draft. */
export interface SammAssessmentCreated {
  outcome: 'CREATED';
  /** The address segment the server assigned. */
  id: string;
  document: string;
  scope: string;
  address: string;
  state: WorkflowState;
  at: string;
  parts: Record<string, PartVersion>;
}

/** One point of the trend of a scope: a released assessment with its scores, unrounded. */
export interface SammTrendPoint {
  assessment: string;
  document: string;
  title: string;
  date: string;
  overall: number;
  /** The score per business function id. */
  functions: Record<string, number>;
  /** The score per practice id. */
  practices: Record<string, number>;
}

/** `GET /api/v1/samm/{scope}/trend` (PROVISIONAL): one model version, oldest first. */
export interface SammTrend {
  scope: string;
  /** The model version of the points; `null` for a scope without a released assessment. */
  modelVersion: string | null;
  /** The released assessments of other model versions, which the trend does not mix. */
  omitted: number;
  points: SammTrendPoint[];
}

/** One answer of an assessment. */
export interface SammAnswer {
  answer: number | null;
  comment?: string | null;
}

/**
 * One evidence link of a practice (AUN-SAMM-7): a titled absolute `https` address, for one question of the practice or
 * for the practice as a whole (`question` is `null`).
 */
export interface SammEvidenceLink {
  question: string | null;
  title: string;
  url: string;
}

/** `GET /api/v1/documents/samm-assessments/{id}` (PROVISIONAL shape of the read). */
export interface SammAssessment {
  id: string;
  repository: string;
  scope: string;
  slug: string;
  title: string;
  date: string;
  modelVersion: string;
  state: WorkflowState;
  assessors: Person[];
  /** Per practice id, per question id. */
  answers: Record<string, Record<string, SammAnswer>>;
  /** The evidence links per practice id, in the order they were entered; a practice without a link is absent. */
  evidence: Record<string, SammEvidenceLink[]>;
  /** The loaded version of every practice file. */
  parts: Record<string, PartVersion>;
  history: HistoryLine[];
  release: ReleaseInfo | null;
}

/** A score difference. */
export interface ScoreDelta {
  from: number;
  to: number;
  delta: number;
}

/** `GET /api/v1/samm/{scope}/compare` (AUN-SAMM-5). */
export interface SammComparison {
  from: string;
  to: string;
  modelVersion: string;
  overall: ScoreDelta;
  functions: (ScoreDelta & {
    id: string;
    practices: (ScoreDelta & { id: string; streams: (ScoreDelta & { letter: 'A' | 'B' })[] })[];
  })[];
}

/** One changed field of a diff. */
export interface DiffChange {
  /** The JSON Pointer of the field. */
  pointer: string;
  before: unknown;
  after: unknown;
}

/** One section of a diff: a part (a practice, a stage) and its changes. */
export interface DiffSection {
  part: string;
  changes: DiffChange[];
}

/** `GET /api/v1/documents/{repository}/{id}/diff?from=released` (PROVISIONAL shape). */
export interface DocumentDiff {
  repository: string;
  id: string;
  /** The tag compared against; `null` before the first release. */
  from: string | null;
  to: string;
  sections: DiffSection[];
}

/** The body of a draft or a save: the changed parts with the blob ids the form loaded. */
export interface SaveRequest {
  parts: Record<string, { blob: string; fields: Record<string, unknown> }>;
}

/** `PUT /api/v1/drafts/…`. */
export interface DraftSaved {
  outcome: 'DRAFT_SAVED';
  at: string;
}

/**
 * `POST /api/v1/documents/…/save`. A save after a release of a document type released more than once adds `state`
 * (`draft`) and the next `version` (rest-api.adoc, Document Lifecycle Requests).
 */
export interface Saved {
  outcome: 'SAVED';
  at: string;
  parts: Record<string, PartVersion>;
  state?: WorkflowState;
  version?: number;
}

/** One field that differs in a `CONFLICT`: the own value and the other value. */
export interface ConflictField {
  pointer: string;
  own: unknown;
  other: unknown;
  by: Person;
}

/** The body of a `CONFLICT` refusal: per part (file), the fields that differ. */
export interface ConflictDetails {
  outcome: 'CONFLICT';
  conflicts: { part: string; blob: string; fields: ConflictField[] }[];
}

/** A transition's answer; `version` and `at` are those of the generic documents (PROVISIONAL). */
export interface Transitioned {
  outcome: 'TRANSITIONED';
  state: WorkflowState;
  version?: number;
  at?: string;
}

/** The body of a `MANDATORY_FIELDS_MISSING` refusal: the JSON Pointers of the empty mandatory fields. */
export interface MissingFields {
  outcome: 'MANDATORY_FIELDS_MISSING';
  missing: string[];
}

/** The body of a `DOCUMENT_RELEASED` refusal: the tag of the release that froze the document. */
export interface DocumentReleasedDetails {
  outcome: 'DOCUMENT_RELEASED';
  tag?: string;
}

/** `POST /api/v1/releases/…`. */
export interface Released {
  outcome: 'RELEASED';
  tag: string;
  at: string;
}

/** A JSON Schema as the form kit reads it (Draft 2020-12, with the `x-` keywords of AUN-WEB-4); the keywords are open. */
export interface JsonSchema {
  [keyword: string]: unknown;
}

/** One document type of a category with its repository and its schema (`GET /api/v1/categories/{category}/schema`). */
export interface KindSchema {
  id: string;
  repository: string;
  schema: JsonSchema;
}

/** `GET /api/v1/categories/{category}/schema` (PROVISIONAL): every document type of the category. */
export interface CategorySchema {
  category: string;
  kinds: KindSchema[];
}

/** `POST /api/v1/render/asciidoc`: the sanitised HTML of the source (PROVISIONAL). */
export interface RenderedAsciiDoc {
  html: string;
}

/** The state of a person entry: bound to a login, prefilled and not yet bound, or erased (a former member). */
export type PersonState = 'bound' | 'unbound' | 'former';

/** One person of `GET /api/v1/directory/persons` (PROVISIONAL); the name is `null` for a former member. */
export interface PersonSummary {
  pseudonym: string;
  name: string | null;
  state: PersonState;
  memberships: Membership[];
}

/** `GET /api/v1/directory/persons`: at most 100 entries, `truncated` when more matched. */
export interface PersonList {
  persons: PersonSummary[];
  truncated: boolean;
}

/** `GET /api/v1/directory/persons/{pseudonym}`: one person as the form shows them. */
export interface PersonDetail extends PersonSummary {
  erasedOn: string | null;
}

/** One answer of `GET /api/v1/references/resolve` (PROVISIONAL). */
export interface ReferenceAnswer {
  ref: string;
  found: boolean;
  title: string | null;
  address: string | null;
  retired: boolean;
}

/** `GET /api/v1/references/resolve`: one entry per reference asked, in the order asked. */
export interface ReferenceList {
  references: ReferenceAnswer[];
}

/*
 * The document lifecycle of the generic documents lens (rest-api.adoc, The Document Lifecycle and Document Lifecycle
 * Requests). Everything here is PROVISIONAL like the requests.
 */

/** One document type of a category with the repository that holds its documents. */
export interface CategoryKind {
  id: string;
  repository: string;
}

/**
 * One category of `GET /api/v1/categories` (PROVISIONAL). `generic` marks the categories the generic lens shows;
 * `enabled` is `false` for a switched-off custom category that still holds documents, and absent for one that is on.
 */
export interface Category {
  id: string;
  generic: boolean;
  enabled?: boolean;
  kinds: CategoryKind[];
}

/** `GET /api/v1/categories`. */
export interface CategoryList {
  categories: Category[];
}

/** One document of `GET /api/v1/documents/{repository}`. */
export interface DocumentSummary {
  id: string;
  kind: string;
  title: string;
  state: WorkflowState;
  version: number;
  updatedAt: string;
  updatedBy: Person;
  /** The last release, `null` for a document never released. */
  release: { tag: string; at: string } | null;
  /** Whether a release request is pending. */
  requested: boolean;
  /** The canonical address of the document. */
  address: string;
}

/** `GET /api/v1/documents/{repository}`: at most 500 documents, newest change first. */
export interface DocumentList {
  repository: string;
  documents: DocumentSummary[];
  truncated: boolean;
}

/** One hit of `GET /api/v1/search?q=`. */
export interface SearchResult {
  repository: string;
  id: string;
  category: string;
  kind: string;
  title: string;
  state: WorkflowState;
  address: string;
}

/** `GET /api/v1/search?q=`: at most 20 hits. */
export interface SearchResults {
  query: string;
  results: SearchResult[];
  truncated: boolean;
}

/**
 * A transition the workflow offers in the current state (the web app reads the user's rights from the session).
 * `release` marks the release itself, whose text is always "Release".
 */
export interface DocumentTransition {
  id: string;
  to: WorkflowState;
  right: Action;
  stepUp: boolean;
  release?: boolean;
}

/** The release request a document read carries: who asked, when, and the comment. */
export interface ReleaseRequest {
  id: string;
  by: Person;
  at: string;
  comment: string;
}

/** One part of a generic document read: its loaded version and its value, which the form edits. */
export interface DocumentPart extends PartVersion {
  value: JsonObject;
}

/** The user's own draft of a document: when it was kept, and per part the blob it started from and its fields. */
export interface DocumentDraft {
  at: string;
  parts: Record<string, { blob: string; fields: Record<string, unknown> }>;
}

/** What a revision read says about the revision. */
export interface RevisionAt {
  ref: string;
  kind: 'create' | 'save' | 'submit' | 'release';
  commit: string;
  tag: string | null;
  at: string;
  by: Person;
}

/** `GET /api/v1/documents/{repository}/{id}`, and with `?at=` the document as it was then (the member `at`). */
export interface DocumentRead {
  repository: string;
  id: string;
  category: string;
  kind: string;
  title: string;
  state: WorkflowState;
  /** The number of the working state: `1` until the first release, `n+1` after the release `v<n>` and the next save. */
  version: number;
  /** `true` for a document that refuses every save (a released SAMM assessment, a revision). */
  frozen: boolean;
  /** Per part; a single-file document type has one part, `data`. */
  parts: Record<string, DocumentPart>;
  draft: DocumentDraft | null;
  history: HistoryLine[];
  release: ReleaseInfo | null;
  releaseRequest: ReleaseRequest | null;
  transitions: DocumentTransition[];
  /** Present on a revision read only. */
  at?: RevisionAt;
}

/** One revision of `GET /api/v1/documents/{repository}/{id}/revisions`; `ref` is what `?at=` takes. */
export interface Revision {
  ref: string;
  commit: string;
  kind: RevisionAt['kind'];
  tag: string | null;
  version: number;
  at: string;
  by: Person;
}

/** `GET /api/v1/documents/{repository}/{id}/revisions`. */
export interface RevisionList {
  repository: string;
  id: string;
  revisions: Revision[];
  truncated: boolean;
}

/** The body of `POST /api/v1/documents/{repository}`: the first save of a new document. */
export interface CreateRequest {
  kind: string;
  parts: Record<string, { fields: Record<string, unknown> }>;
}

/** `201` of `POST /api/v1/documents/{repository}`: the server assigns the id. */
export interface Created {
  outcome: 'CREATED';
  id: string;
  repository: string;
  address: string;
  state: WorkflowState;
  version: number;
  at: string;
  parts: Record<string, PartVersion>;
}

/**
 * A team or a service named in a report: the kind, the id and the name. A subject of a scope may be the organisation,
 * which has no id.
 */
export interface ReportOwner {
  kind: 'team' | 'service' | 'organisation';
  id?: string;
  name: string;
}

/** The newest released assessment of a scope in the summary of the dashboard. */
export interface ReportsSammLatest {
  scope: string;
  name: string;
  assessment: string;
  date: string;
  overall: number;
  /** The overall score minus the one of the release before it of the same model version; `null` when there is none. */
  change: number | null;
}

/** The SAMM section of the summary. */
export interface ReportsSammSummary {
  scopes: number;
  withoutRelease: number;
  open: number;
  latest: ReportsSammLatest[];
}

/** The threat-model section of the summary. */
export interface ReportsThreatSummary {
  services: number;
  withModel: number;
  withoutModel: number;
  openThreats: number;
  untreatedThreats: number;
  overdue: number;
  dueSoon: number;
}

/** The ratings of a risk, in rising order. */
export const RISK_RATINGS = ['low', 'medium', 'high', 'critical'] as const;

/** The rating of a risk. */
export type RiskRating = (typeof RISK_RATINGS)[number];

/** The risk section of the summary. */
export interface ReportsRiskSummary {
  entries: number;
  byRating: Record<RiskRating, number>;
  dueSoon: number;
  overdue: number;
  /** The time of the newest release of the register; `null` for a register without one. */
  latestRelease: string | null;
}

/**
 * `GET /api/v1/reports/summary` (PROVISIONAL): one section per repository the user may read; a section is absent when
 * the user may not read its repository.
 */
export interface ReportsSummary {
  today: string;
  samm?: ReportsSammSummary;
  threatModels?: ReportsThreatSummary;
  risks?: ReportsRiskSummary;
}

/** One point of the trend of a scope in the report: a released assessment with its overall and function scores. */
export interface SammReportPoint {
  assessment: string;
  document: string;
  title: string;
  date: string;
  overall: number;
  /** The score per business function id. */
  functions: Record<string, number>;
}

/** One scope of the trend report. */
export interface SammReportScope {
  scope: string;
  title: string;
  subject: ReportOwner;
  /** The model version of the points; `null` for a scope without a released assessment. */
  modelVersion: string | null;
  /** The released assessments of other model versions, which the report does not mix. */
  omitted: number;
  points: SammReportPoint[];
}

/** `GET /api/v1/reports/samm-trend` (PROVISIONAL): every scope in the order of the scope list. */
export interface SammTrendReport {
  scopes: SammReportScope[];
}

/** The review state of a threat model (AUN-TM-3, AUN-TM-4). */
export const THREAT_STATUSES = ['overdue', 'due-soon', 'ok', 'unreleased'] as const;

/** The review state of a threat model. */
export type ThreatStatus = (typeof THREAT_STATUSES)[number];

/** A service named in the threat evaluation. */
export interface ReportService {
  id: string;
  name: string;
}

/** The counts of the threats of one model. */
export interface ThreatCounts {
  total: number;
  open: number;
  /** Open, without a countermeasure and not transferred; never more than `open`. */
  untreated: number;
  /** Carrying a reference into the risk register. */
  transferred: number;
}

/** One row of the threat evaluation: a threat model and its review. */
export interface ThreatEvaluationModel {
  service: ReportService;
  protectionNeed: ProtectionLevel;
  /** An ISO 8601 period: `P6M`, `P12M` or `P24M`. */
  reviewInterval: string;
  model: string;
  address: string;
  state: WorkflowState;
  /** The number of the last release; `null` before the first. */
  version: number | null;
  lastReview: string | null;
  daysSinceReview: number | null;
  reviewDue: string | null;
  /** Negative when the review is overdue. */
  dueInDays: number | null;
  status: ThreatStatus;
  threats: ThreatCounts;
}

/** A service without a threat model. */
export interface ServiceWithoutModel {
  service: ReportService;
  lifecycle: string;
  owner: ReportOwner;
  protectionNeed: ProtectionLevel;
  address: string;
}

/** `GET /api/v1/reports/threat-evaluation` (PROVISIONAL): one row per threat model, and the services without one. */
export interface ThreatEvaluation {
  today: string;
  models: ThreatEvaluationModel[];
  withoutModel: ServiceWithoutModel[];
}

/** The treatment of a threat (rest-api.adoc, The Data Shape of a Threat Model). */
export const THREAT_TREATMENTS = ['open', 'mitigated', 'accepted'] as const;

/** The status of one threat: not yet decided, treated by countermeasures, or accepted. */
export type ThreatTreatment = (typeof THREAT_TREATMENTS)[number];

/** The six kinds of threat of STRIDE, as the model file writes them. */
export const STRIDE_CATEGORIES = [
  'Spoofing',
  'Tampering',
  'Repudiation',
  'Information Disclosure',
  'Denial of Service',
  'Elevation of Privilege',
] as const;

/** The status of a countermeasure. */
export const MITIGATION_STATUSES = ['planned', 'implemented'] as const;

/** The status of one countermeasure. */
export type MitigationStatus = (typeof MITIGATION_STATUSES)[number];

/** One threat of the model file (the subset of Open Threat Model the application reads and writes). */
export interface OtmThreat {
  id: string;
  name: string;
  description?: string;
  categories?: string[];
  risk: { likelihood: number; impact: number };
  attributes: {
    status: ThreatTreatment;
    /** The reference `isms-register:risk/<id>` of the risk the threat became; written by the transfer only. */
    transferred?: string;
  };
}

/** One countermeasure of the model file: it belongs to one threat. */
export interface OtmMitigation {
  id: string;
  name: string;
  description?: string;
  riskReduction: number;
  attributes: {
    /** The `id` of the threat the countermeasure treats. */
    threat: string;
    status?: MitigationStatus;
    /** The ids of the issues that carry out the work, entered by a person; no issue tracker is connected. */
    issues?: string[];
  };
}

/** The review of the last released version of a threat model (rest-api.adoc, A Threat Model). */
export interface ThreatModelReview {
  today: string;
  protectionNeed: ProtectionLevel;
  /** An ISO 8601 period of months: `P6M`, `P12M` or `P24M`. */
  reviewInterval: string;
  /** The interval of every protection need: the table of the kind. */
  reviewIntervals: Record<ProtectionLevel, string>;
  lastReview: string | null;
  daysSinceReview: number | null;
  reviewDue: string | null;
  dueInDays: number | null;
  status: ThreatStatus;
}

/** The generated diagram of a model: a vector image as a data URL. */
export interface ThreatModelDiagram {
  mediaType: string;
  width: number;
  height: number;
  dataUrl: string;
}

/** `GET /api/v1/threat-models/{service}/{model}` (PROVISIONAL): the generic document read with the members of the model. */
export interface ThreatModelRead extends DocumentRead {
  service: ReportService;
  /** The address segment of the model. */
  model: string;
  address: string;
  review: ThreatModelReview;
  threats: ThreatCounts;
  /** `null` for a model without a component. */
  diagram: ThreatModelDiagram | null;
}

/** One model in the page of a service. */
export interface ThreatModelSummary {
  model: string;
  document: string;
  title: string;
  address: string;
  state: WorkflowState;
  version: number | null;
  lastReview: string | null;
  daysSinceReview: number | null;
  reviewDue: string | null;
  dueInDays: number | null;
  status: ThreatStatus;
  threats: ThreatCounts;
  requested: boolean;
  updatedAt: string;
}

/** A recipe the person started and has not finished. */
export interface ThreatRecipeDraft {
  recipe: string;
  /** The zero-based step the person goes on to. */
  step: number;
  at: string;
}

/** `GET /api/v1/threat-models/{service}` (PROVISIONAL): a service, its models and the person's recipe drafts. */
export interface ThreatModelService {
  today: string;
  service: {
    id: string;
    name: string;
    lifecycle: string;
    retired: boolean;
    owner: ReportOwner;
    protectionNeed: ProtectionLevel;
    reviewInterval: string;
  };
  reviewIntervals: Record<ProtectionLevel, string>;
  models: ThreatModelSummary[];
  drafts: ThreatRecipeDraft[];
}

/** What a read of the risk register names: the date or tag it was asked for and the commit it read. */
export interface RiskRegisterAsOf {
  /** The parameter as given; `null` for the register as of now. */
  requested: string | null;
  /** The day the register is as of, UTC. */
  date: string;
  tag: string | null;
  /** Seven hexadecimal digits; `null` for a date before the first commit. */
  commit: string | null;
  at: string | null;
}

/** One tag of the register. */
export interface RiskRegisterTag {
  tag: string;
  commit: string;
  at: string;
}

/** The origin of a risk: a SAMM practice or a threat. */
export interface RiskReference {
  ref: string;
  title: string;
  address: string;
}

/** One released risk of the register as it was at the commit read. */
export interface RiskSummary {
  /** `R-<n>`. */
  id: string;
  /** The address segment, in lower case. */
  entry: string;
  title: string;
  rating: RiskRating;
  treatment: 'mitigate' | 'accept' | 'transfer' | 'avoid';
  owner: ReportOwner;
  /** The number of the release shown. */
  version: number;
  releasedAt: string;
  reviewDue: string | null;
  reference: RiskReference | null;
  /** The entry's page; with `as-of` it carries `?at=v<n>`. */
  address: string;
}

/** `GET /api/v1/isms/risks?as-of=` (AUN-ISMS-3): the released entries as of a date or tag. */
export interface RiskRegister {
  asOf: RiskRegisterAsOf;
  /** The newest tags of the register, newest first, at most 20; may be empty. */
  tags: RiskRegisterTag[];
  risks: RiskSummary[];
}
