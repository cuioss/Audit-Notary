/**
 * The document controller (AUN-WEB-5, UC-DOC-2, UC-DOC-3): everything a sheet that edits one part of a document shares,
 * extracted from the SAMM practice sheet so that every lens uses the same behaviour.
 *
 * - **Edits** are held per field, keyed by the field's key (see {@link FieldKeys}); the page shows an edit over what was
 *   saved for everyone, which shows over what was loaded.
 * - **A draft** keeps the changes for the person only, within seconds of the last change (at most 5 s, AUN-WEB-5). A draft
 *   with field errors is refused (`422`, nothing is written): the text stays in the page, and the controller says so.
 * - **A save** writes one signed commit with the blob id the changes stand on. A `CONFLICT` is held per field with the own
 *   and the other value until the person decides; a `VALIDATION` is mapped onto the form's pointers by `part`;
 *   `DOCUMENT_RELEASED`, `REJECTED` and `GIT_UNAVAILABLE` keep the changes as the person's.
 * - **Step-up** for a save and a transition goes through the shared {@link StepUpHandler}; with the identity provider
 *   the changes are kept as a draft before the app leaves.
 * - **Live refresh**: the host reads the document again when the event stream names it ({@link DocumentController.watch})
 *   and passes the new read to {@link DocumentController.sync}; fields edited locally stay as they are.
 * - **The next version**: the first save after a release of a document type released more than once answers
 *   `state: draft` and `version: n+1`, which the controller keeps in {@link DocumentController.reopened}.
 *
 * The controller holds no component; a view creates one, calls `sync` whenever its document changes and renders the
 * state. Texts are the view's: the controller names catalogue keys only.
 */
import { get } from 'svelte/store';
import { apiClient, type ApiClient } from '../api/client';
import { errorMessageKey, isApiError, type FieldError } from '../api/errors';
import type {
  ConflictField,
  DocumentDraft,
  DocumentTransition,
  JsonObject,
  Person,
  Saved,
  SaveRequest,
  Transitioned,
  WorkflowState,
} from '../api/types';
import { jsonEqual } from '../forms/schema';
import type { SaveStateKind } from '../components/SaveState.svelte';
import { StepUpHandler } from '../stepup/stepUp';
import { session } from '../stores/app';
import {
  POINTER_KEYS,
  applyFields,
  conflictsOf,
  diffFields,
  missingOf,
  refreshesDocument,
  releasedTagOf,
  validationOf,
  withoutSent,
  type FieldKeys,
} from './fields';

/** How long after the last change the draft is kept: well inside the 5 seconds of AUN-WEB-5. */
export const DRAFT_DELAY_MS = 1200;

/**
 * The part of a document the controller edits, as the view has read it. The view passes a new snapshot whenever its
 * document is read again.
 */
export interface DocumentSnapshot {
  /** The document id. */
  document: string;
  /** The part (file) the form edits; `data` for a single-file document type. */
  part: string;
  /** The blob id the part was loaded with. */
  blob: string;
  /** Who saved the loaded version of the part; `null` when the read does not say. */
  savedBy: Person | null;
  /** The loaded value of the part, for a form that edits one JSON value (a generic document). */
  value?: JsonObject;
  /**
   * The user's own draft of the document, restored once when the document is opened: its fields become edits, and a
   * draft that started from an older blob is marked stale.
   */
  draft?: DocumentDraft | null;
  /** Whether the document refuses every save: released and released once, a revision. */
  frozen: boolean;
  /** Whether the user holds the right `edit`. */
  canEdit: boolean;
}

/** What another person's save changed under an open sheet. */
export interface RemoteChange {
  /** Who saved. */
  by: Person;
  /** The keys of the fields edited locally: the ones a refresh leaves alone. */
  edited: ReadonlySet<string>;
}

/** The options of one controller. */
export interface DocumentControllerOptions {
  /** The repository alias of the document type. */
  repository: string;
  /** The client; the app's by default. */
  client?: ApiClient;
  /** The step-up handler; a controller creates its own, which keeps the draft before the app leaves, by default. */
  stepUp?: StepUpHandler;
  /** How the pointers of a refusal become the keys of the fields; JSON Pointers by default. */
  keys?: FieldKeys;
  /**
   * Whether the document type is released once (a SAMM assessment): `DOCUMENT_RELEASED` then means frozen for good,
   * otherwise it means "released while you edited" and the next save starts the next version.
   */
  releasedOnce?: boolean;
  /** The pseudonym of the user, to tell their own save from another's; the session's by default. */
  self?: () => string | null;
  /** The delay of the draft; {@link DRAFT_DELAY_MS} by default. */
  draftDelayMs?: number;
  /** Called after a save for everyone. */
  onsaved?: (answer: Saved) => void;
  /** Called when the view should read the document again: after a transition, and after `DOCUMENT_RELEASED`. */
  onrefresh?: () => void;
  /** Called when the loaded version of the part was saved by someone else. */
  onremote?: (change: RemoteChange) => void;
}

/** What a transition came to. */
export type TransitionResult =
  | { kind: 'transitioned'; state: WorkflowState; version: number | null }
  | { kind: 'missing'; pointers: string[] }
  | { kind: 'unsaved' }
  | { kind: 'handled' }
  | { kind: 'refused'; outcome: string };

/** The state of the page as the sheet shows it: the last write the controller made. */
export class DocumentController {
  /** The state of the person's work: the icon and the sentence of the margin. */
  saveState = $state<SaveStateKind>('clean');
  /** When the last draft or save was kept; the view formats it in the language of the moment. */
  stampAt = $state<Date | null>(null);
  /** The catalogue key of the notice above the form, `null` for none. */
  failure = $state<string | null>(null);
  /** The changes made and not yet saved for everyone, by key. */
  edits = $state<Record<string, unknown>>({});
  /** The conflicts of the last refused save, by key, with the own and the other value. */
  conflicts = $state<Record<string, ConflictField>>({});
  /** The errors of the last refused draft, save or create for this part, with the pointers of the form; `null` for none. */
  errors = $state<FieldError[] | null>(null);
  /** Whether the last draft was refused for field errors: the text stays in the page and is no draft. */
  draftRefused = $state(false);
  /** Whether the restored draft started from an older version of the part than the one loaded. */
  draftStale = $state(false);
  /** Whether the departure for the identity provider has begun: no edit is accepted any more. */
  leaving = $state(false);
  /** Who saved the loaded version of the part when it was last another person; `null` before. */
  remote = $state<Person | null>(null);
  /** The tag of the release that came between, after a save answered `DOCUMENT_RELEASED`; `null` otherwise. */
  releasedMeanwhile = $state<string | null>(null);
  /** The pointers of the empty mandatory fields of the last refused transition. */
  missing = $state<string[]>([]);
  /** The next version the last save started (`state: draft`, `version: n+1`), until the view reads the document again. */
  reopened = $state<{ state: WorkflowState; version: number } | null>(null);

  private snapshot = $state.raw<DocumentSnapshot | null>(null);
  private committed = $state.raw<{ blob: string; values: Record<string, unknown> } | null>(null);
  private conflictBlob = '';
  private editBase = '';
  private afterSave: { from: string; blob: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private owner = { document: '', part: '' };
  private lastBlob = '';

  /** The handler of the step-up of a save and of a transition; the view mounts its dialog. */
  readonly stepUp: StepUpHandler;

  private readonly repository: string;
  private readonly client: ApiClient;
  private readonly keys: FieldKeys;
  private readonly delay: number;
  private readonly self: () => string | null;
  private readonly options: DocumentControllerOptions;

  /**
   * @param options what the controller needs of its view
   */
  constructor(options: DocumentControllerOptions) {
    this.options = options;
    this.repository = options.repository;
    this.client = options.client ?? apiClient;
    this.keys = options.keys ?? POINTER_KEYS;
    this.delay = options.draftDelayMs ?? DRAFT_DELAY_MS;
    this.self = options.self ?? (() => get(session)?.user.pseudonym ?? null);
    // A step-up through the identity provider keeps nothing of this page: the changes are kept as the draft before the
    // app leaves. A draft that cannot be kept keeps the person on the page (the hook rejects), and no edit is accepted
    // from the moment the draft is read until the app has left, so every accepted edit is in the draft.
    this.stepUp =
      options.stepUp ??
      new StepUpHandler(this.client, undefined, async () => {
        this.leaving = true;
        try {
          await this.keepDraft(true);
        } catch (error) {
          this.leaving = false;
          throw error;
        }
      });
  }

  /** @returns whether there are changes not yet saved for everyone */
  get dirty(): boolean {
    return Object.keys(this.edits).length > 0;
  }

  /** @returns the number of conflicts still to decide */
  get open(): number {
    return Object.keys(this.conflicts).length;
  }

  /** @returns whether the sheet shows its value and offers no control: nothing to edit, frozen, or no right */
  get readonly(): boolean {
    const snapshot = this.snapshot;
    return !snapshot || snapshot.frozen || !snapshot.canEdit;
  }

  /** @returns whether the controls refuse a change: read-only, or the departure for the provider has begun */
  get locked(): boolean {
    return this.readonly || this.leaving;
  }

  /** @returns why the sheet is read-only: `frozen`, `right`, or `null` when it is not */
  get readonlyReason(): 'frozen' | 'right' | null {
    const snapshot = this.snapshot;
    if (!snapshot) return null;
    if (snapshot.frozen) return 'frozen';
    return snapshot.canEdit ? null : 'right';
  }

  /**
   * @returns the loaded value with what was saved for everyone and the edits on top, for a form that edits one JSON
   * value; `{}` before a snapshot with a value
   */
  get value(): JsonObject {
    return applyFields(this.baseline, this.edits);
  }

  /** The loaded value with the overlay of what was saved for everyone and not yet read back. */
  private get baseline(): JsonObject {
    const loaded = this.snapshot?.value ?? {};
    return this.committed ? applyFields(loaded, this.committed.values) : loaded;
  }

  /**
   * @param key the key of a field
   * @param loaded the value the loaded document holds for it
   * @returns the value the page shows: the own change, else what was saved for everyone and not yet read back, else
   * what was loaded
   */
  fieldValue(key: string, loaded: unknown): unknown {
    if (Object.hasOwn(this.edits, key)) return this.edits[key];
    if (this.committed && Object.hasOwn(this.committed.values, key)) {
      return this.committed.values[key];
    }
    return loaded;
  }

  /**
   * Tells the controller which part of which document the view shows. Call it whenever the document, the part or the
   * read changes (in `$effect.pre`, untracked).
   *
   * - Another document or part: the unsaved changes of the one before are kept as its draft, and the state starts fresh;
   *   the user's own draft of the new one is restored.
   * - The same part with a new blob: what was saved here is read back, so the overlay goes; a save by someone else is
   *   reported through `onremote`.
   *
   * @param next the part as read now, `null` while there is none
   */
  sync(next: DocumentSnapshot | null): void {
    const document = next?.document ?? '';
    const part = next?.part ?? '';
    if (document !== this.owner.document || part !== this.owner.part) {
      this.flush();
      this.owner = { document, part };
      this.lastBlob = '';
      this.reset();
      this.snapshot = next;
      this.noteBlob(next);
      if (next?.draft) this.restore(next, next.draft);
      return;
    }
    this.snapshot = next;
    this.noteBlob(next);
  }

  /** Keeps the unsaved changes of the document that was open as its draft, without waiting for the answer. */
  private flush(): void {
    const previous = this.snapshot;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!previous || !this.dirty) return;
    const pending: Record<string, unknown> = $state.snapshot(this.edits);
    void this.client
      .saveDraft(this.repository, previous.document, this.requestFor(previous.part, pending))
      .catch(() => {});
  }

  private reset(): void {
    this.edits = {};
    this.committed = null;
    this.conflicts = {};
    this.conflictBlob = '';
    this.editBase = '';
    this.afterSave = null;
    this.errors = null;
    this.draftRefused = false;
    this.draftStale = false;
    this.remote = null;
    this.releasedMeanwhile = null;
    this.missing = [];
    this.reopened = null;
    this.failure = null;
    this.stampAt = null;
    this.saveState = 'clean';
  }

  /** Reads back a new blob of the part: the overlay goes, a save by someone else is told. */
  private noteBlob(next: DocumentSnapshot | null): void {
    const blob = next?.blob ?? '';
    if (blob === this.lastBlob) return;
    const first = this.lastBlob === '';
    this.lastBlob = blob;
    if (this.committed && this.committed.blob !== blob) this.committed = null;
    this.reopened = null;
    if (first || !next || !next.savedBy || next.savedBy.pseudonym === this.self()) return;
    this.remote = next.savedBy;
    this.options.onremote?.({ by: next.savedBy, edited: new Set(Object.keys(this.edits)) });
  }

  /** Makes the user's own draft the starting point of the page. */
  private restore(next: DocumentSnapshot, draft: DocumentDraft): void {
    const own = draft.parts[next.part];
    if (!own || Object.keys(own.fields).length === 0) return;
    this.edits = { ...own.fields };
    // A draft that started from an older blob is saved on that blob, so the server finds what others changed since.
    this.draftStale = own.blob !== next.blob;
    this.editBase = own.blob;
    this.saveState = 'draft';
    this.stampAt = new Date(draft.at);
  }

  /**
   * Sets one field.
   *
   * @param key the key of the field
   * @param value its new value
   */
  change(key: string, value: unknown): void {
    this.edit({ ...this.edits, [key]: value });
  }

  /**
   * Replaces the changes by those of a form's value: the top-level properties that differ from what the page started
   * from (a generic document's form edits one JSON value).
   *
   * @param next the value the form holds now
   */
  setValue(next: JsonObject): void {
    this.edit(diffFields(this.baseline, next));
  }

  private edit(edits: Record<string, unknown>): void {
    if (this.locked || !this.snapshot) return;
    if (jsonEqual(edits, this.edits)) return;
    if (!this.dirty) this.editBase = this.currentBlob();
    this.edits = edits;
    this.failure = null;
    // While a save for everyone runs, it stays the state: the act stays busy, and the save keeps this change for the
    // next one when it returns.
    if (this.saveState === 'saving') return;
    this.saveState = 'changed';
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.keepDraft(), this.delay);
  }

  /** @returns the blob the loaded document is at, or the one the last save left when it is not read back yet */
  private currentBlob(): string {
    const loaded = this.snapshot?.blob ?? '';
    return this.afterSave && this.afterSave.from === loaded ? this.afterSave.blob : loaded;
  }

  /** @returns the blob the changes stand on: the one a conflict named, else the one the first change was made on */
  private baseBlob(): string {
    return this.conflictBlob || this.editBase || this.currentBlob();
  }

  /**
   * @param part the part
   * @param pending its changes
   * @returns the body of a draft or a save
   */
  private requestFor(part: string, pending: Record<string, unknown>): SaveRequest {
    return { parts: { [part]: { blob: this.baseBlob(), fields: pending } } };
  }

  /**
   * Keeps the changes as the person's draft.
   *
   * @param rethrow whether a failed write is thrown after it was shown, for the caller that must not go on without a
   *   draft (the departure for the identity provider); the timer swallows it
   */
  async keepDraft(rethrow = false): Promise<void> {
    this.timer = null;
    const snapshot = this.snapshot;
    if (!snapshot) return;
    if (!this.dirty) {
      if (this.saveState === 'changed') this.saveState = 'clean';
      return;
    }
    this.saveState = 'drafting';
    try {
      const answer = await this.client.saveDraft(
        this.repository,
        snapshot.document,
        this.requestFor(snapshot.part, $state.snapshot(this.edits)),
      );
      this.errors = null;
      this.draftRefused = false;
      if (this.saveState === 'drafting') {
        this.saveState = 'draft';
        this.stampAt = answer.at ? new Date(answer.at) : new Date();
      }
    } catch (error) {
      // A save for everyone started meanwhile keeps its own state.
      if (this.saveState === 'drafting') {
        this.saveState = 'failed';
        if (isApiError(error) && error.outcome === 'VALIDATION') {
          // Nothing was written: what was typed stays in the page, with the errors at its fields.
          this.errors = validationOf(error, snapshot.part);
          this.draftRefused = true;
        }
        this.failure = errorMessageKey(error);
      }
      if (rethrow) throw error;
    }
  }

  /** Saves for everyone: one signed commit with the blob id the changes stand on. */
  async save(): Promise<void> {
    const snapshot = this.snapshot;
    if (!snapshot || !this.dirty) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.saveState = 'saving';
    this.failure = null;
    // What this save sends; changes made while it runs stay in `edits` and are kept and saved later.
    const sent: Record<string, unknown> = $state.snapshot(this.edits);
    const request = this.requestFor(snapshot.part, sent);
    const loadedAtStart = snapshot.blob;
    try {
      const result = await this.stepUp.run((password) =>
        this.client.saveDocument(this.repository, snapshot.document, request, password),
      );
      if (result.status === 'handled') {
        // Nothing was saved for everyone (cancelled, too many logins; or the app is leaving for the provider, after the
        // changes were kept as a draft): the changes stay the person's and are kept as a draft.
        // A draft that failed before the departure keeps its message until the next write.
        // (`keepDraft` set the state meanwhile, which the compiler cannot see.)
        if ((this.saveState as SaveStateKind) !== 'failed') this.saveState = 'changed';
        this.schedule();
        return;
      }
      if (result.status === 'refused') throw result.error;
      this.saved(snapshot, sent, loadedAtStart, result.value);
    } catch (error) {
      this.refused(error, snapshot.part);
    }
  }

  private saved(
    snapshot: DocumentSnapshot,
    sent: Record<string, unknown>,
    loadedAtStart: string,
    answer: Saved,
  ): void {
    const merged: Record<string, unknown> = { ...this.committed?.values, ...sent };
    // A newer version that arrived meanwhile already shows the save, or will with the next read.
    this.committed =
      (this.snapshot?.blob ?? '') === loadedAtStart
        ? { blob: loadedAtStart, values: merged }
        : null;
    const blob = answer.parts?.[snapshot.part]?.blob;
    this.afterSave = blob ? { from: loadedAtStart, blob } : null;
    this.edits = withoutSent(this.edits, sent);
    this.editBase = '';
    this.conflicts = {};
    this.conflictBlob = '';
    this.errors = null;
    this.draftRefused = false;
    this.draftStale = false;
    this.releasedMeanwhile = null;
    this.missing = [];
    if (answer.state !== undefined && answer.version !== undefined) {
      this.reopened = { state: answer.state, version: answer.version };
    }
    this.saveState = this.dirty ? 'changed' : 'saved';
    this.stampAt = answer.at ? new Date(answer.at) : new Date();
    if (this.dirty) this.schedule();
    this.options.onsaved?.(answer);
  }

  /** Sorts the refusal of a save: the view's own states, or a failure that keeps the work. */
  private refused(error: unknown, part: string): void {
    if (!isApiError(error)) {
      this.failed(error);
      return;
    }
    switch (error.outcome) {
      case 'CONFLICT': {
        const found = conflictsOf(error, part, this.keys);
        this.conflicts = found?.fields ?? {};
        this.conflictBlob = found?.blob ?? '';
        this.saveState = 'conflict';
        return;
      }
      case 'VALIDATION':
        // Nothing was written, and a draft would be refused the same: the text stays in the page.
        this.errors = validationOf(error, part);
        this.draftRefused = true;
        this.saveState = 'failed';
        this.failure = errorMessageKey(error);
        return;
      case 'DOCUMENT_RELEASED':
        this.releasedMeanwhile = releasedTagOf(error);
        this.failed(error);
        if (!this.options.releasedOnce) this.failure = 'error.released-meanwhile';
        // The release is read again: the next save starts the next version, or the sheet is frozen for good.
        this.options.onrefresh?.();
        return;
      default:
        this.failed(error);
    }
  }

  private failed(error: unknown): void {
    this.saveState = 'failed';
    this.failure = errorMessageKey(error);
    // The changes are still the person's: they are kept as a draft again.
    this.schedule();
  }

  /**
   * Decides one conflict: keeps the own value, or takes the other into the field it belongs to.
   *
   * @param key the key of the field
   * @param keep which value stays
   */
  resolve(key: string, keep: 'own' | 'other'): void {
    const field = this.conflicts[key];
    if (!field) return;
    if (keep === 'other') {
      const value = this.keys.adopt ? this.keys.adopt(key, field.other) : field.other;
      this.edits = { ...this.edits, [key]: value };
    }
    const rest = { ...this.conflicts };
    delete rest[key];
    this.conflicts = rest;
  }

  /**
   * Moves the document along its workflow (a submit for review, a transition a category declares). The transition acts
   * on the saved document, so with unsaved changes nothing is sent. The release is the release flow's.
   *
   * @param transition the transition the read offers (`id`)
   * @returns what came of it
   */
  async transition(transition: DocumentTransition | string): Promise<TransitionResult> {
    const snapshot = this.snapshot;
    const id = typeof transition === 'string' ? transition : transition.id;
    if (!snapshot) return { kind: 'refused', outcome: 'UNEXPECTED' };
    if (this.dirty) return { kind: 'unsaved' };
    this.failure = null;
    this.missing = [];
    const result = await this.stepUp.run<Transitioned>((password) =>
      this.client.transition(this.repository, snapshot.document, id, password),
    );
    if (result.status === 'handled') return { kind: 'handled' };
    if (result.status === 'refused') {
      const error = result.error;
      this.failure = errorMessageKey(error);
      if (error.outcome === 'MANDATORY_FIELDS_MISSING') {
        this.missing = missingOf(error);
        return { kind: 'missing', pointers: this.missing };
      }
      return { kind: 'refused', outcome: error.outcome };
    }
    this.options.onrefresh?.();
    return {
      kind: 'transitioned',
      state: result.value.state,
      version: result.value.version ?? null,
    };
  }

  /**
   * Reads the event stream for the document the controller shows: a save or a transition of it makes the view read it
   * again (`onrefresh`), and the next `sync` refreshes the fields not edited locally.
   *
   * @returns the function that stops listening
   */
  watch(): () => void {
    return this.client.subscribeEvents((event, data) => {
      const snapshot = this.snapshot;
      if (snapshot && refreshesDocument(event, data, this.repository, snapshot.document)) {
        this.options.onrefresh?.();
      }
    });
  }

  /** Closes the page: unsaved changes are kept as the draft, whether or not the timer still runs. */
  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.dirty) void this.keepDraft();
  }
}
