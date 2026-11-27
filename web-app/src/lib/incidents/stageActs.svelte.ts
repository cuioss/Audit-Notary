/**
 * Completing and reopening a stage of an incident (UC-IR-1, UC-IR-3; rest-api.adoc, Completing and Reopening a Stage).
 *
 * A completion signs off the saved part, so the caller never sends it over changes only the person has. The review
 * stage asks for step-up: the request goes through the shared {@link StepUpHandler}, which owns the dialog and the
 * departure for the identity provider. Every refusal the handler leaves to the view is sorted here:
 *
 * - `STAGE_NOT_COMPLETABLE` names the empty mandatory fields and the predecessors still open, which the sheet lists;
 * - a stage that changed under the person (`CHANGED_SINCE_REVIEW`, `STAGE_STATE`, `STAGE_NOT_APPLICABLE`,
 *   `DOCUMENT_RELEASED`) is told in words and the incident is read again;
 * - everything else is a failure with the catalogue's text for it.
 *
 * The class holds no component and no text: it names catalogue keys only.
 */
import { apiClient, type ApiClient } from '../api/client';
import { errorMessageKey } from '../api/errors';
import type { IncidentStage } from '../api/types';
import type { StepUpHandler } from '../stepup/stepUp';

/** The refusal of a completion: what is missing, and which stages are still open before it. */
export interface StageRefusal {
  /** The stage that was refused. */
  stage: string;
  /** The JSON Pointers (`/<part>/<field>`) of the empty mandatory fields. */
  missing: string[];
  /** The ids of the predecessors that are neither completed nor not applicable. */
  open: string[];
}

/** What a request came to, for the announcement of the sheet. */
export interface StageDone {
  stage: string;
  act: 'complete' | 'reopen';
}

/** What the controller needs of its sheet. */
export interface StageActsOptions {
  /** The repository of the incident's year. */
  repository: string;
  /** The incident's document id. */
  document: string;
  /** The handler of the step-up, the sheet's; its dialog is mounted by the sheet. */
  stepUp: StepUpHandler;
  /** The client; the app's by default. */
  client?: ApiClient;
  /** Called when the incident is to be read again: after a completion, a reopening, or a refusal that shows it changed. */
  onchanged: () => void;
}

/** @returns the strings of a member of a refusal's body, `[]` for anything else */
function listOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** The state of the acts of one incident's sheet. */
export class StageActs {
  /** The stage whose request is running; `null` for none. */
  busy = $state<string | null>(null);
  /** The refusal of the last completion for missing fields or open predecessors; `null` for none. */
  refusal = $state<StageRefusal | null>(null);
  /** The catalogue key of the failure of the last act, `null` for none. */
  failure = $state<string | null>(null);
  /** What the last act did, `null` before one or once it is told. */
  done = $state<StageDone | null>(null);

  private readonly options: StageActsOptions;
  private readonly client: ApiClient;

  /**
   * @param options what the controller needs of its sheet
   */
  constructor(options: StageActsOptions) {
    this.options = options;
    this.client = options.client ?? apiClient;
  }

  /** Forgets the refusal and the failure of the last act: the person goes on editing, or chooses another stage. */
  clear(): void {
    this.refusal = null;
    this.failure = null;
    this.done = null;
  }

  /**
   * Completes a stage.
   *
   * @param stage the stage as the read declares it (its `stepUp` makes a local user answer for the password first)
   * @param blob the blob id of the part the form loaded; `null` for a part never saved
   * @returns whether the stage is completed
   */
  async complete(stage: IncidentStage, blob: string | null): Promise<boolean> {
    return this.send(
      stage.id,
      'complete',
      (password) =>
        this.client.completeStage(
          this.options.repository,
          this.options.document,
          stage.id,
          blob ? { blob } : {},
          password,
        ),
      stage.stepUp,
    );
  }

  /**
   * Reopens a completed stage; the stages after it stay completed and read as signed off before.
   *
   * @param stage the stage
   * @param blob the blob id of the part the form loaded
   * @returns whether the stage is open again
   */
  async reopen(stage: IncidentStage, blob: string | null): Promise<boolean> {
    return this.send(stage.id, 'reopen', () =>
      this.client.reopenStage(
        this.options.repository,
        this.options.document,
        stage.id,
        blob ? { blob } : {},
      ),
    );
  }

  private async send(
    stage: string,
    act: StageDone['act'],
    request: (password?: string) => Promise<unknown>,
    asks = false,
  ): Promise<boolean> {
    if (this.busy !== null) return false;
    this.clear();
    this.busy = stage;
    try {
      const result = await this.options.stepUp.run(request, { asks });
      if (result.status === 'handled') return false;
      if (result.status === 'done') {
        this.done = { stage, act };
        this.options.onchanged();
        return true;
      }
      const error = result.error;
      switch (error.outcome) {
        case 'STAGE_NOT_COMPLETABLE':
          this.refusal = {
            stage,
            missing: listOf(error.details.missing),
            open: listOf(error.details.open),
          };
          return false;
        case 'CHANGED_SINCE_REVIEW':
          // Someone saved the part since the form loaded it: the person signs off nothing they did not see.
          this.failure = 'incidents.stage.changed';
          this.options.onchanged();
          return false;
        case 'STAGE_STATE':
        case 'STAGE_NOT_APPLICABLE':
        case 'DOCUMENT_RELEASED':
          this.failure = errorMessageKey(error);
          this.options.onchanged();
          return false;
        default:
          this.failure = errorMessageKey(error);
          return false;
      }
    } finally {
      this.busy = null;
    }
  }
}
