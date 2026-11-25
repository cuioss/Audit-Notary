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

/** `POST /api/v1/documents/…/save`. */
export interface Saved {
  outcome: 'SAVED';
  at: string;
  parts: Record<string, PartVersion>;
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

/** A transition's answer. */
export interface Transitioned {
  outcome: 'TRANSITIONED';
  state: WorkflowState;
}

/** `POST /api/v1/releases/…`. */
export interface Released {
  outcome: 'RELEASED';
  tag: string;
  at: string;
}
