import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentLocale, messagesStore } from '../../i18n';
import { mockMessages } from '../../test/scenarioFetch';
import { hold, resetKit, useProfile, type Kit } from '../documents/testkit';
import ThreatModelsView from './ThreatModelsView.svelte';

/**
 * The recipe wizard of a new threat model against the profiles of the mock (AUN-TEST-1, UC-TM-1): the choice of a recipe,
 * the steps with their guidance and forms, the draft kept between them and continued from the service page, the last page,
 * the create, and the refusals.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(resetKit);

const SERVICE = { service: 'report-scheduler' };

/**
 * @param profile `name` or `name#state`
 * @param query the admitted query of the address
 * @param lang the language
 * @param answers answers that replace the profile's own
 * @param params the values of the address
 * @returns the kit and the navigation spy
 */
async function open(
  profile = 'workshop',
  query: Record<string, string> = {},
  lang: 'en' | 'de' = 'en',
  answers: Record<string, unknown> = {},
  params: Record<string, string> = SERVICE,
): Promise<Kit & { onnavigate: ReturnType<typeof vi.fn> }> {
  const kit = await useProfile(profile, lang, answers);
  const onnavigate = vi.fn();
  render(ThreatModelsView, { route: 'threat-models.new', params, query, onnavigate });
  return { ...kit, onnavigate };
}

/** Opens a recipe and waits for its first step. */
async function openRecipe(
  profile = 'workshop',
  recipe = 'quick-start',
  lang: 'en' | 'de' = 'en',
  answers: Record<string, unknown> = {},
) {
  const kit = await open(profile, { recipe }, lang, answers);
  await screen.findByTestId('recipe-step');
  await screen.findByTestId('step-guidance');
  return kit;
}

/** The text field or area whose label starts with the text: the sections of the form carry labels as well. */
const field = (label: RegExp) => screen.getByRole('textbox', { name: label });

const type = (label: RegExp, value: string) => fireEvent.input(field(label), { target: { value } });

/** The title of the step the wizard shows. */
const stepTitle = () => screen.getByTestId('recipe-step').querySelector('h2')?.textContent?.trim();

/** Goes on and waits until the step has changed from `from`. */
async function goOn(from: string | undefined) {
  await fireEvent.click(screen.getByTestId('step-next'));
  await waitFor(() => expect(stepTitle()).not.toBe(from));
}

const put = (kit: Kit, recipe: string) =>
  kit.bodies.filter(
    (entry) => entry.request === `PUT /api/v1/threat-models/report-scheduler/drafts/${recipe}`,
  );

describe('the choice of a recipe', () => {
  it('lists the recipes with what they cover and the number of their steps, each a link to its wizard', async () => {
    await open();
    const choice = await screen.findByTestId('recipe-choice');
    await waitFor(() => expect(within(choice).getAllByRole('listitem')).toHaveLength(2));
    const quick = screen.getByTestId('recipe-quick-start');
    expect(quick).toHaveTextContent('Quick start');
    expect(quick).toHaveTextContent('4 steps');
    expect(screen.getByTestId('recipe-stride')).toHaveTextContent('6 steps');
    const link = screen.getByTestId('recipe-open-quick-start');
    expect(link).toHaveAttribute('href', '/threat-models/report-scheduler/new?recipe=quick-start');
    expect(link).toHaveTextContent('Start');
    expect(link).toHaveAccessibleName('Start Quick start');
    expect(screen.queryByTestId('recipe-started-quick-start')).toBeNull();
  });

  it('says in the language of the interface what a recipe is', async () => {
    await open('workshop', {}, 'de');
    const quick = await screen.findByTestId('recipe-quick-start');
    expect(quick).toHaveTextContent('Schnellstart');
    expect(quick).toHaveTextContent('4 Schritte');
    expect(screen.getByTestId('recipe-open-quick-start')).toHaveAccessibleName(
      'Schnellstart beginnen',
    );
  });

  it('shows where a recipe that was started stopped, and continues it', async () => {
    await open('workshop#recipe-draft-saved');
    const started = await screen.findByTestId('recipe-started-quick-start');
    expect(started).toHaveTextContent('Started, step 3 of 4');
    const link = screen.getByTestId('recipe-open-quick-start');
    expect(link).toHaveTextContent('Continue');
    expect(link).toHaveAccessibleName('Continue Quick start');
    expect(screen.queryByTestId('recipe-started-stride')).toBeNull();
  });

  it('says that an installation without a recipe cannot start a model', async () => {
    await open('workshop#threat-model-recipes-none');
    expect(await screen.findByText('No recipe is available')).toBeInTheDocument();
  });

  it('tells a refused read of the recipes', async () => {
    await open('workshop', {}, 'en', {
      'GET /api/v1/categories/threat-models/recipes': new Response(
        JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('reads the list again when the person asks after a refused read', async () => {
    const answers: Record<string, unknown> = {
      'GET /api/v1/categories/threat-models/recipes': new Response(
        JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    };
    await open('workshop', {}, 'en', answers);
    const retry = await screen.findByTestId('recipes-retry');
    expect(retry).toHaveTextContent('Try again');
    delete answers['GET /api/v1/categories/threat-models/recipes'];
    await fireEvent.click(retry);
    expect(await screen.findByTestId('recipe-quick-start')).toHaveTextContent('Quick start');
    expect(screen.queryByTestId('recipes-retry')).toBeNull();
  });

  it('does not show the list in the old language while the other one is read', async () => {
    await open();
    expect(await screen.findByTestId('recipe-quick-start')).toHaveTextContent('Quick start');
    const release = hold('GET', '/api/v1/categories/threat-models/recipes');
    messagesStore.set(mockMessages('de'));
    currentLocale.set('de');
    await waitFor(() => expect(screen.queryByTestId('recipe-quick-start')).toBeNull());
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument();
    release();
    await waitFor(() =>
      expect(screen.getByTestId('recipe-quick-start')).toHaveTextContent('Schnellstart'),
    );
  });

  it('reads the recipes again in the other language', async () => {
    await open();
    expect(await screen.findByTestId('recipe-quick-start')).toHaveTextContent('Quick start');
    messagesStore.set(mockMessages('de'));
    currentLocale.set('de');
    await waitFor(() =>
      expect(screen.getByTestId('recipe-quick-start')).toHaveTextContent('Schnellstart'),
    );
  });

  it('gives a person who may only read no wizard, and says why', async () => {
    await open('read-only');
    expect(await screen.findByTestId('new-threat-model-no-right')).toHaveTextContent(
      'needs the right to edit',
    );
    expect(screen.queryByTestId('recipe-choice')).toBeNull();
  });

  it('gives a retired service no wizard, and says why', async () => {
    await open('workshop', {}, 'en', {}, { service: 'ledger' });
    expect(await screen.findByTestId('new-threat-model-retired')).toHaveTextContent(
      'This service is retired',
    );
  });

  it('says that a recipe that does not exist does not exist, and leads back to the choice', async () => {
    await open('workshop', { recipe: 'nope' });
    expect(await screen.findByTestId('recipe-missing')).toHaveTextContent(
      'This recipe does not exist',
    );
    expect(screen.getByTestId('recipe-choose')).toHaveAttribute(
      'href',
      '/threat-models/report-scheduler/new',
    );
  });

  it('tells a failure of the recipe', async () => {
    await open('workshop', { recipe: 'quick-start' }, 'en', {
      'GET /api/v1/threat-models/report-scheduler/drafts/quick-start': new Response(
        JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    });
    const failed = await screen.findByTestId('recipe-failed');
    expect(failed).toHaveTextContent('Git server');
  });
});

describe('the steps', () => {
  it('shows the first step with its guidance and the form of the part it fills', async () => {
    await openRecipe();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New threat model');
    expect(stepTitle()).toBe('The frame');
    // The guidance is the recipe's own text, rendered by the server.
    await waitFor(() =>
      expect(screen.getByTestId('step-guidance')).toHaveTextContent(
        'Use a name that people will find again',
      ),
    );
    expect(field(/^Name/)).toBeInTheDocument();
    expect(field(/^Description/)).toBeInTheDocument();
    // The address segment is the server's: it is not asked for.
    expect(screen.queryByLabelText(/address/i)).toBeNull();
    expect(screen.getByTestId('save-state')).toHaveTextContent('Nothing is kept yet.');
    expect(screen.queryByTestId('step-back')).toBeNull();
  });

  it('shows the steps as a list that marks the current one, and the count', async () => {
    await openRecipe();
    const stepper = screen.getByRole('navigation', { name: 'Steps of the recipe Quick start' });
    expect(within(stepper).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByTestId('recipe-stepper-0')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('recipe-stepper-4')).toHaveTextContent('Review and create');
    expect(screen.getByTestId('recipe-stepper-count')).toHaveTextContent('Step 1 of 5');
    expect(screen.getByTestId('step-announce')).toHaveTextContent('Step 1 of 5: The frame');
  });

  it('keeps the draft for the person when they go on, and goes back without writing', async () => {
    const kit = await openRecipe();
    await type(/^Name/, 'Scheduler overview');
    await waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent('Changed. It is kept for you'),
    );
    await goOn('The frame');
    expect(stepTitle()).toBe('Trust zones');
    expect(put(kit, 'quick-start')).toEqual([
      {
        request: 'PUT /api/v1/threat-models/report-scheduler/drafts/quick-start',
        body: {
          step: 1,
          parts: { model: { fields: { '/project': { name: 'Scheduler overview' } } } },
        },
      },
    ]);
    expect(screen.getByTestId('save-state')).toHaveTextContent('Saved for you at');
    expect(screen.getByTestId('step-announce')).toHaveTextContent('Step 2 of 5: Trust zones');
    expect(screen.getByTestId('recipe-stepper-0')).toHaveTextContent('The frame');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 })),
    );
    await fireEvent.click(screen.getByTestId('step-back'));
    expect(stepTitle()).toBe('The frame');
    expect(field(/^Name/)).toHaveValue('Scheduler overview');
    expect(put(kit, 'quick-start')).toHaveLength(1);
  });

  it('goes back to a step that was reached, from the list of the steps', async () => {
    await openRecipe();
    await type(/^Name/, 'Scheduler overview');
    await goOn('The frame');
    await fireEvent.click(screen.getByRole('button', { name: 'The frame (done)' }));
    expect(stepTitle()).toBe('The frame');
    // The step after the one the person is on is not an act: they go on by the sheet's own act.
    expect(screen.getByTestId('recipe-stepper-1').querySelector('button')).not.toBeNull();
    expect(screen.getByTestId('recipe-stepper-2').querySelector('button')).toBeNull();
  });

  it('continues a recipe where the person left it, with what they had filled in', async () => {
    await openRecipe('workshop#recipe-draft-saved');
    expect(stepTitle()).toBe('Components');
    expect(screen.getByTestId('recipe-stepper-2')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('save-state')).toHaveTextContent('Saved for you at');
    await fireEvent.click(screen.getByTestId('step-back'));
    expect(stepTitle()).toBe('Trust zones');
    expect(screen.getByTestId('step-form')).toHaveTextContent('Internal');
    await fireEvent.click(screen.getByTestId('step-back'));
    expect(field(/^Name/)).toHaveValue('Scheduler overview');
  });

  it('shows a step in German with the recipe in German', async () => {
    await openRecipe('workshop', 'quick-start', 'de');
    expect(stepTitle()).toBe('Der Rahmen');
    await waitFor(() =>
      expect(screen.getByTestId('step-guidance')).toHaveTextContent(
        'Geben Sie dem Modell einen Namen',
      ),
    );
    expect(screen.getByTestId('step-next')).toHaveTextContent('Nächster Schritt');
    expect(screen.getByTestId('recipe-stepper-count')).toHaveTextContent('Schritt 1 von 5');
  });

  it('reads the texts of the recipe again when the language changes and keeps what was filled in', async () => {
    await openRecipe();
    await type(/^Name/, 'Scheduler overview');
    messagesStore.set(mockMessages('de'));
    currentLocale.set('de');
    await waitFor(() => expect(stepTitle()).toBe('Der Rahmen'));
    expect(field(/^Name/)).toHaveValue('Scheduler overview');
  });

  it('draws the threats of a recipe as the table of the sheet of a model, and the countermeasures of STRIDE as its editor', async () => {
    await openRecipe('workshop#recipe-draft-saved');
    await goOn('Components');
    expect(stepTitle()).toBe('Threats');
    expect(screen.getByTestId('wizard-threats-table', { exact: false })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add a threat' })).toBeInTheDocument();
  });

  it('draws the data flows and the countermeasures of STRIDE', async () => {
    await openRecipe('workshop#recipe-draft-saved', 'stride');
    expect(stepTitle()).toBe('The service');
    for (const title of ['Trust zones', 'Components', 'Data flows', 'Threats (STRIDE)']) {
      await goOn(stepTitle());
      expect(stepTitle()).toBe(title);
    }
    expect(screen.getByRole('button', { name: 'Add a threat' })).toBeInTheDocument();
    await goOn('Threats (STRIDE)');
    expect(stepTitle()).toBe('Countermeasures');
    expect(
      screen.getByText('Add a threat first: a countermeasure belongs to one threat.'),
    ).toBeInTheDocument();
  });

  it('tells a step that fills a part of the model the form cannot show, and goes on', async () => {
    await openRecipe('workshop', 'quick-start', 'en', {
      'GET /api/v1/categories/threat-models/recipes/quick-start': {
        id: 'quick-start',
        title: 'Quick start',
        description: 'x',
        steps: [{ id: 'extra', title: 'Extra', guidance: 'Say it.', fills: '/nowhere' }],
      },
    });
    expect(stepTitle()).toBe('Extra');
    expect(screen.getByText(/cannot show/)).toBeInTheDocument();
    await goOn('Extra');
    expect(stepTitle()).toBe('Review and create');
    expect(screen.getByTestId('summary-extra')).toHaveTextContent('Nothing yet');
  });

  it('stays on the step and says why when the draft is refused, and keeps what was typed', async () => {
    const kit = await openRecipe('workshop', 'quick-start', 'en', {
      'PUT /api/v1/threat-models/report-scheduler/drafts/quick-start': new Response(
        JSON.stringify({
          outcome: 'VALIDATION',
          errors: [{ part: 'model', pointer: '/project/name', code: 'MAX_LENGTH' }],
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
    });
    await type(/^Name/, 'Scheduler overview');
    await fireEvent.click(screen.getByTestId('step-next'));
    await waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent(
        'Some entries need a correction. Nothing was kept.',
      ),
    );
    expect(stepTitle()).toBe('The frame');
    expect(field(/^Name/)).toHaveValue('Scheduler overview');
    expect(put(kit, 'quick-start')).toHaveLength(1);
  });

  it('says that the draft could not be kept and stays', async () => {
    await openRecipe('workshop#threat-model-git-unavailable', 'quick-start', 'en', {
      'PUT /api/v1/threat-models/report-scheduler/drafts/quick-start': new Response(
        JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    });
    await fireEvent.click(screen.getByTestId('step-next'));
    await waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent(
        'Not kept. What you entered stays on this page.',
      ),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(stepTitle()).toBe('The frame');
  });

  it('refuses to go on while a field of the step has an error of the form', async () => {
    await openRecipe('workshop#recipe-draft-saved');
    await fireEvent.click(screen.getByTestId('step-back'));
    expect(stepTitle()).toBe('Trust zones');
    // The name of a project has a length: a text longer than the limit is marked and does not go on.
    await fireEvent.click(screen.getByTestId('step-back'));
    await type(/^Name/, 'x'.repeat(201));
    await waitFor(() =>
      expect(screen.getByTestId('step-next')).toHaveAttribute('aria-disabled', 'true'),
    );
    expect(screen.getByText('Correct the marked fields first.')).toBeInTheDocument();
    // Another language is the same step with the same error: the act still says so.
    messagesStore.set(mockMessages('de'));
    currentLocale.set('de');
    await waitFor(() => expect(stepTitle()).toBe('Der Rahmen'));
    expect(screen.getByTestId('step-next')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Korrigieren Sie zuerst die markierten Felder.')).toBeInTheDocument();
  });

  it('offers to read the schema again when it could not be read, and then shows the step', async () => {
    const answers: Record<string, unknown> = {
      'GET /api/v1/categories/threat-models/schema': new Response(
        JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    };
    await open('workshop', { recipe: 'quick-start' }, 'en', answers);
    const failed = await screen.findByTestId('recipe-schema-failed');
    expect(failed).toHaveTextContent('Git server');
    expect(screen.queryByTestId('recipe-wizard-loading')).toBeNull();
    delete answers['GET /api/v1/categories/threat-models/schema'];
    await fireEvent.click(screen.getByTestId('schema-retry'));
    await screen.findByTestId('recipe-step');
    await waitFor(() => expect(field(/^Name/)).toBeInTheDocument());
    expect(screen.queryByTestId('recipe-schema-failed')).toBeNull();
  });
});

describe('the last page and the create', () => {
  /** Opens the draft of the mock and goes on to the last page. */
  async function toReview(profile = 'workshop#recipe-draft-saved') {
    const kit = await openRecipe(profile);
    await goOn('Components');
    await goOn('Threats');
    expect(stepTitle()).toBe('Review and create');
    return kit;
  }

  /** Names the model in the first step and goes on through the four steps of the recipe to the last page. */
  async function walkToReview(profile: string) {
    const kit = await openRecipe(profile);
    await type(/^Name/, 'Scheduler overview');
    for (const from of ['The frame', 'Trust zones', 'Components', 'Threats']) await goOn(from);
    expect(stepTitle()).toBe('Review and create');
    return kit;
  }

  it('shows what was filled in, step by step, and asks for the owner and the review date, prefilled with today', async () => {
    await toReview();
    expect(screen.getByTestId('summary-project')).toHaveTextContent('Scheduler overview');
    expect(screen.getByTestId('summary-zones')).toHaveTextContent('One entry');
    expect(screen.getByTestId('summary-components')).toHaveTextContent('Nothing yet');
    expect(screen.getByTestId('summary-threats')).toHaveTextContent('Nothing yet');
    expect(screen.getByLabelText(/^Review date/)).toHaveValue('2026-11-26');
    expect(screen.getByTestId('save-state')).toHaveTextContent('Saved for you at');
    expect(screen.getByTestId('create-model')).toHaveTextContent('Create threat model');
    expect(screen.queryByTestId('step-next')).toBeNull();
  });

  it('changes a step from the summary', async () => {
    await toReview();
    await fireEvent.click(screen.getByRole('button', { name: 'Change Trust zones' }));
    expect(stepTitle()).toBe('Trust zones');
  });

  it('creates the model, moves to its sheet and has read the evaluation and the service again', async () => {
    const kit = await toReview();
    await fireEvent.click(screen.getByTestId('create-model'));
    await waitFor(() =>
      expect(kit.bodies.some((entry) => entry.request.startsWith('POST'))).toBe(true),
    );
    const posted = kit.bodies.find(
      (entry) => entry.request === 'POST /api/v1/threat-models/report-scheduler',
    );
    expect(posted?.body).toEqual({
      recipe: 'quick-start',
      parts: {
        data: { fields: { '/last-review': '2026-11-26' } },
        model: {
          fields: {
            '/project': {
              name: 'Scheduler overview',
              description: 'How a report is scheduled and sent.',
            },
            '/trustZones': [{ id: 'internal', name: 'Internal', risk: { trustRating: 80 } }],
          },
        },
      },
    });
    await waitFor(() =>
      expect(kit.onnavigate).toHaveBeenCalledWith(
        '/threat-models/report-scheduler/scheduler-overview',
        {
          replace: true,
        },
      ),
    );
    await waitFor(() =>
      expect(
        kit.requests.filter((request) => request === 'GET /api/v1/reports/threat-evaluation')
          .length,
      ).toBeGreaterThan(1),
    );
  });

  it('needs a name and says in which step it is given', async () => {
    await openRecipe('workshop');
    for (const from of ['The frame', 'Trust zones', 'Components', 'Threats']) await goOn(from);
    expect(stepTitle()).toBe('Review and create');
    const create = screen.getByTestId('create-model');
    expect(create).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText('The model needs a name. You give it in the step "The frame".'),
    ).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Change The frame' }));
    expect(stepTitle()).toBe('The frame');
  });

  it('shows the refusal of the create at the field, in the step that holds it', async () => {
    await walkToReview('workshop#threat-model-create-invalid');
    await fireEvent.click(screen.getByTestId('create-model'));
    await waitFor(() => expect(stepTitle()).toBe('The frame'));
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Some entries need a correction. Nothing was created.',
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(field(/^Name/)).toHaveValue('Scheduler overview');
  });

  it('shows the refusal of the owner at the owner and stays on the last page', async () => {
    const kit = await openRecipe('workshop#recipe-draft-saved', 'quick-start', 'en', {
      'POST /api/v1/threat-models/report-scheduler': new Response(
        JSON.stringify({
          outcome: 'VALIDATION',
          errors: [{ part: 'data', pointer: '/owner', code: 'REFERENCE_NOT_FOUND' }],
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
    });
    await goOn('Components');
    await goOn('Threats');
    await fireEvent.click(screen.getByTestId('create-model'));
    await waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent('Nothing was created.'),
    );
    expect(stepTitle()).toBe('Review and create');
    expect(screen.getByTestId('review-data')).toHaveTextContent('This reference leads nowhere');
    expect(kit.onnavigate).not.toHaveBeenCalled();
  });

  it('tells that nothing was created when the Git server cannot be reached, and stays', async () => {
    const kit = await walkToReview('workshop#threat-model-git-unavailable');
    await fireEvent.click(screen.getByTestId('create-model'));
    await waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent('Nothing was created.'),
    );
    expect(stepTitle()).toBe('Review and create');
    expect(kit.onnavigate).not.toHaveBeenCalled();
  });
});
