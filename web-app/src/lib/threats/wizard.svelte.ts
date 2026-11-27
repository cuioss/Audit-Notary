/**
 * The state of the recipe wizard of a new threat model (UC-TM-1, rest-api.adoc, The Recipe Draft, A New Model): the recipe,
 * what the person has filled in, the step they are on, the draft that keeps it between steps, and the create.
 *
 * - Nothing is stored before the first step is left. Going on keeps the whole draft for this person only (`PUT …/drafts/
 *   {recipe}`, replaced as a whole, with the step the person goes on to); going back writes nothing, because the values
 *   stay in the page.
 * - The last page (the position after the final step) asks for the owner and the review date and creates the model; the
 *   create ends the draft on the server.
 * - A refusal of the server names fields: the wizard goes to the step that fills the first of them and shows them there.
 *
 * It sends nothing by itself on construction: the view calls {@link RecipeWizard.open}.
 */
import { apiClient, type ApiClient } from '../api/client';
import { isApiError, errorMessageKey, type FieldError } from '../api/errors';
import type {
  JsonValue,
  OtmMitigation,
  OtmThreat,
  ThreatModelCreated,
  ThreatRecipe,
} from '../api/types';
import { jsonEqual } from '../forms/schema';
import { StepUpHandler } from '../stepup/stepUp';
import {
  createRequest,
  dataErrors,
  dataOfDraft,
  draftRequest,
  errorsOfStep,
  firstStepWithError,
  modelErrors,
  projectName,
  startStep,
  valuesOfDraft,
  type DataValues,
  type ModelValues,
} from './recipe';

/** What the wizard is doing. */
export type WizardPhase = 'loading' | 'ready' | 'missing' | 'failed';

/** What a request of the wizard is doing now. */
export type WizardBusy = 'keeping' | 'creating' | null;

/** The wizard of one recipe of one service. */
export class RecipeWizard {
  /** Whether the recipe and the draft are read, the recipe does not exist, or the read failed. */
  phase = $state<WizardPhase>('loading');
  /** The catalogue key of the failure of the read, when it failed. */
  loadFailure = $state<string | null>(null);
  /** The recipe in the language of the interface. */
  recipe = $state<ThreatRecipe | null>(null);
  /** The fields of the file of the model filled in so far, by the pointer a step fills. */
  values = $state<ModelValues>({});
  /** The fields of the part `data` the last page holds. */
  data = $state<DataValues>({});
  /** The position of the step the person is on; the number of steps for the last page. */
  current = $state(0);
  /** The furthest position the person has reached: the steps up to it can be gone back to. */
  furthest = $state(0);
  /** The field errors of the last refusal, `null` for none. */
  errors = $state<FieldError[] | null>(null);
  /** The catalogue key of the last failure that is no field error, `null` for none. */
  failure = $state<string | null>(null);
  /** The request that runs. */
  busy = $state<WizardBusy>(null);
  /** When the draft was kept last, `null` while it was not (the server's time of the draft read or of the last keep). */
  keptAt = $state<string | null>(null);
  /** The request that was made last, for the words of a refusal. */
  lastAct = $state<WizardBusy>(null);
  /** Whether the model was created: what the page holds is then stored, and leaving it loses nothing. */
  created = $state(false);

  /** The step-up handler of the create: a request that asks is sent through it like every other. */
  readonly stepUp: StepUpHandler;

  private baseline = $state.raw<{ values: ModelValues; data: DataValues }>({
    values: {},
    data: {},
  });
  private latest = 0;

  /**
   * @param service the service's address segment
   * @param today the day the review date starts as
   * @param client the client, replaced in tests
   * @param stepUp the step-up handler, replaced in tests
   */
  constructor(
    private readonly service: string,
    private readonly today: string,
    private readonly client: ApiClient = apiClient,
    stepUp?: StepUpHandler,
  ) {
    this.stepUp = stepUp ?? new StepUpHandler(client);
  }

  /** @returns what the page holds now, as a plain copy: the base of the question whether it differs from what is kept */
  private snapshot(): { values: ModelValues; data: DataValues } {
    return {
      values: JSON.parse(JSON.stringify(this.values)) as ModelValues,
      data: JSON.parse(JSON.stringify(this.data)) as DataValues,
    };
  }

  /** The steps of the recipe. */
  get steps() {
    return this.recipe?.steps ?? [];
  }

  /** Whether the person is on the last page (owner, review date, create). */
  get onReview(): boolean {
    return this.recipe !== null && this.current === this.steps.length;
  }

  /** Whether what the page holds differs from what is kept: the page is left only after a question. */
  get dirty(): boolean {
    if (this.created) return false;
    const now = this.snapshot();
    return !jsonEqual(now.values, this.baseline.values) || !jsonEqual(now.data, this.baseline.data);
  }

  /** The name the person gave the model, `''` for none. */
  get name(): string {
    return projectName(this.values);
  }

  /** The position of the step that fills the name of the model, `-1` for a recipe that has none. */
  get nameStep(): number {
    return this.steps.findIndex((step) => step.fills === '/project');
  }

  /** The field errors of the file of the model. */
  get modelErrors(): FieldError[] {
    return modelErrors(this.errors);
  }

  /** The field errors of the part `data`. */
  get dataErrors(): FieldError[] {
    return dataErrors(this.errors);
  }

  /**
   * @param position the position of a step
   * @returns the field errors of the file of the model that belong to the step
   */
  errorsOf(position: number): FieldError[] {
    const fills = this.steps[position]?.fills;
    return fills === undefined ? [] : errorsOfStep(this.modelErrors, fills);
  }

  /**
   * Reads the recipe and the person's draft of it and opens on the step of the draft.
   *
   * @param recipe the recipe's id
   * @param lang `en` or `de`
   */
  async open(recipe: string, lang: string): Promise<void> {
    const read = ++this.latest;
    this.phase = 'loading';
    try {
      // Both reads are settled before either answer is used: a recipe that does not exist is the answer, whichever of the
      // two reads is refused first (the draft of a recipe that does not exist is refused as well).
      const [recipeRead, draftRead] = await Promise.allSettled([
        this.client.getThreatRecipe(recipe, lang),
        this.client.getThreatRecipeDraft(this.service, recipe).then((answer) => answer.draft),
      ]);
      if (read !== this.latest) return;
      if (recipeRead.status === 'rejected') throw recipeRead.reason;
      if (draftRead.status === 'rejected') throw draftRead.reason;
      const loaded = recipeRead.value;
      const draft = draftRead.value;
      this.recipe = loaded;
      this.values = valuesOfDraft(draft);
      this.data = dataOfDraft(draft, this.today);
      this.current = startStep(loaded.steps.length, draft);
      this.furthest = this.current;
      this.keptAt = draft?.at ?? null;
      this.baseline = this.snapshot();
      this.phase = 'ready';
    } catch (error) {
      if (read !== this.latest) return;
      if (isApiError(error) && error.outcome === 'NOT_FOUND') {
        this.phase = 'missing';
      } else {
        this.loadFailure = errorMessageKey(error);
        this.phase = 'failed';
      }
    }
  }

  /**
   * Reads the recipe again in another language: the texts change, what the person filled in and the step do not.
   *
   * @param recipe the recipe's id
   * @param lang `en` or `de`
   */
  async relocalise(recipe: string, lang: string): Promise<void> {
    const read = ++this.latest;
    try {
      const loaded = await this.client.getThreatRecipe(recipe, lang);
      if (read !== this.latest) return;
      // A recipe whose steps differ from the ones the person is in (another installation) is not mixed in.
      if (loaded.steps.length === this.steps.length) this.recipe = loaded;
    } catch {
      // The texts stay in the language they were read in.
    }
  }

  /**
   * Sets what a step fills. A change clears nothing of the refusal here: the form kit drops the error of a field that
   * changes, and the next request replaces the rest.
   *
   * @param fills the pointer the step fills
   * @param value the new value of that member of the file
   */
  setValue(fills: string, value: JsonValue | undefined): void {
    if (value === undefined) {
      this.values = Object.fromEntries(
        Object.entries(this.values).filter(([pointer]) => pointer !== fills),
      );
    } else {
      this.values = { ...this.values, [fills]: value };
    }
    this.failure = null;
  }

  /**
   * Sets the threats and the countermeasures together: removing a threat removes its countermeasures in the same change.
   *
   * @param threats the threats
   * @param mitigations the countermeasures
   */
  setThreats(threats: OtmThreat[], mitigations: OtmMitigation[]): void {
    const held = this.values['/mitigations'];
    const next: ModelValues = { ...this.values, '/threats': threats as unknown as JsonValue };
    if (held !== undefined || mitigations.length > 0) {
      next['/mitigations'] = mitigations as unknown as JsonValue;
    }
    this.values = next;
    this.failure = null;
  }

  /**
   * Sets the part `data` of the last page.
   *
   * @param data the owner and the review date
   */
  setData(data: DataValues): void {
    this.data = data;
    this.failure = null;
  }

  /** Goes back one step. Nothing is written: the values stay in the page. */
  back(): void {
    if (this.current > 0) this.current -= 1;
  }

  /**
   * Goes to a step that was reached.
   *
   * @param position the position of the step
   */
  goTo(position: number): void {
    if (position >= 0 && position <= this.furthest && position !== this.current) {
      this.current = position;
    }
  }

  /**
   * Keeps the draft for this person and goes on to the next step (or the last page). A draft with field errors is refused
   * and nothing is written: the wizard then stays where it is, or goes to the step that holds the first field.
   *
   * @returns whether the wizard went on
   */
  async next(): Promise<boolean> {
    if (this.recipe === null || this.busy !== null || this.onReview) return false;
    const target = this.current + 1;
    this.busy = 'keeping';
    this.lastAct = 'keeping';
    this.failure = null;
    this.errors = null;
    try {
      const answer = await this.client.saveThreatRecipeDraft(
        this.service,
        this.recipe.id,
        draftRequest(target, this.values, this.furthest >= this.steps.length ? this.data : null),
      );
      this.keptAt = answer.at;
      this.baseline = this.snapshot();
      this.current = target;
      this.furthest = Math.max(this.furthest, target);
      return true;
    } catch (error) {
      this.refuse(error);
      return false;
    } finally {
      this.busy = null;
    }
  }

  /**
   * Creates the model from what the page holds (the first save, which ends the draft).
   *
   * @returns the answer, `null` while nothing was created
   */
  async create(): Promise<ThreatModelCreated | null> {
    if (this.recipe === null || this.busy !== null || this.created) return null;
    const recipe = this.recipe.id;
    const body = createRequest(recipe, this.values, this.data);
    this.busy = 'creating';
    this.lastAct = 'creating';
    this.failure = null;
    this.errors = null;
    try {
      const result = await this.stepUp.run((password) =>
        this.client.createThreatModel(this.service, body, password),
      );
      if (result.status === 'done') {
        this.created = true;
        return result.value;
      }
      if (result.status === 'refused') this.refuse(result.error);
      return null;
    } finally {
      this.busy = null;
    }
  }

  /**
   * Takes a refusal of the server: field errors are shown where the field is, anything else is a failure of the request.
   *
   * @param error what the request failed with
   */
  private refuse(error: unknown): void {
    if (isApiError(error) && error.outcome === 'VALIDATION') {
      this.errors = error.errors;
      const position = firstStepWithError(this.steps, error.errors);
      if (position >= 0) this.current = Math.min(position, this.furthest);
      else if (this.dataErrors.length > 0) this.current = this.steps.length;
    }
    this.failure = errorMessageKey(error);
  }

  /** @returns the reason the model cannot be created yet, `null` when it can */
  get createBlocker(): 'name' | null {
    return this.name === '' ? 'name' : null;
  }
}
