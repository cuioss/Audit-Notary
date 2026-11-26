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

/** `GET /api/v1/directory/me`: the prefill of the first-login form (AUN-DIR-2). */
export interface DirectoryPrefill {
  name: string;
  teams: string[];
  informationText: string;
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

/** `GET /api/v1/samm/scopes/{scope}` (PROVISIONAL). */
export interface SammScope {
  id: string;
  title: string;
  subject: SammSubject;
  modelVersion: string;
  targets: Record<string, SammTarget>;
  assessments: SammAssessmentSummary[];
}

/** One answer of an assessment. */
export interface SammAnswer {
  answer: number | null;
  comment?: string | null;
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

/** The team and the role of a membership, both catalog references (`team:payments`). */
export interface Membership {
  team: string;
  role: string;
}

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
