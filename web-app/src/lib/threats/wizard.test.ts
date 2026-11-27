import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type {
  RecipeDraftBody,
  ThreatModelCreated,
  ThreatRecipe,
  ThreatRecipeDraftRead,
} from '../api/types';
import { StepUpHandler } from '../stepup/stepUp';
import { RecipeWizard } from './wizard.svelte';

/**
 * The wizard of a recipe without a component (rest-api.adoc, The Recipe Draft, A New Model): the draft that is read and
 * kept, the step the person is on, what makes the page differ from what is kept, and what a refusal does.
 */
const RECIPE: ThreatRecipe = {
  id: 'quick-start',
  title: 'Quick start',
  description: 'Four steps.',
  steps: [
    { id: 'project', title: 'The frame', guidance: 'g', fills: '/project' },
    { id: 'zones', title: 'Trust zones', guidance: 'g', fills: '/trustZones' },
    { id: 'threats', title: 'Threats', guidance: 'g', fills: '/threats' },
  ],
};

const CREATED: ThreatModelCreated = {
  outcome: 'CREATED',
  model: 'scheduler-overview',
  document: 'report-scheduler-scheduler-overview',
  address: '/threat-models/report-scheduler/scheduler-overview',
  state: 'draft',
  version: 1,
  at: '2026-11-26T09:41:00Z',
  parts: {},
};

const draftOf = (step: number): RecipeDraftBody => ({
  step,
  at: '2026-11-26T09:20:00Z',
  parts: { model: { fields: { '/project': { name: 'Scheduler overview' } } } },
});

/** A client that answers like the mock's `workshop` and records the requests the wizard made. */
function client(over: Record<string, unknown> = {}) {
  const calls = { saved: [] as unknown[], created: [] as unknown[] };
  const fake = {
    getThreatRecipe: vi.fn(async () => structuredClone(RECIPE)),
    getThreatRecipeDraft: vi.fn(async (): Promise<ThreatRecipeDraftRead> => ({
      service: 'report-scheduler',
      recipe: 'quick-start',
      draft: null,
    })),
    saveThreatRecipeDraft: vi.fn(async (_service: string, _recipe: string, body: unknown) => {
      calls.saved.push(body);
      return { outcome: 'DRAFT_SAVED' as const, at: '2026-11-26T09:21:00Z' };
    }),
    createThreatModel: vi.fn(async (_service: string, body: unknown) => {
      calls.created.push(body);
      return CREATED;
    }),
    ...over,
  };
  return { api: fake as unknown as ApiClient, fake, calls };
}

async function opened(over: Record<string, unknown> = {}, draft: RecipeDraftBody | null = null) {
  const kit = client({
    getThreatRecipeDraft: async () => ({ service: 's', recipe: 'quick-start', draft }),
    ...over,
  });
  const wizard = new RecipeWizard(
    'report-scheduler',
    '2026-11-26',
    kit.api,
    new StepUpHandler(kit.api, () => 'off'),
  );
  await wizard.open('quick-start', 'en');
  return { wizard, ...kit };
}

describe('opening', () => {
  it('starts at the first step, empty, with the review date of today, and nothing to lose', async () => {
    const { wizard } = await opened();
    expect(wizard.phase).toBe('ready');
    expect(wizard.current).toBe(0);
    expect(wizard.furthest).toBe(0);
    expect(wizard.values).toEqual({});
    expect(wizard.data).toEqual({ 'last-review': '2026-11-26' });
    expect(wizard.keptAt).toBeNull();
    expect(wizard.dirty).toBe(false);
    expect(wizard.onReview).toBe(false);
  });

  it('continues a draft where the person left it, with what they had filled in', async () => {
    const { wizard } = await opened({}, draftOf(2));
    expect(wizard.current).toBe(2);
    expect(wizard.furthest).toBe(2);
    expect(wizard.name).toBe('Scheduler overview');
    expect(wizard.keptAt).toBe('2026-11-26T09:20:00Z');
    expect(wizard.dirty).toBe(false);
  });

  it('opens on the last page for a draft that was at it', async () => {
    const { wizard } = await opened({}, draftOf(3));
    expect(wizard.onReview).toBe(true);
  });

  it('knows that a recipe does not exist', async () => {
    const { wizard } = await opened({
      getThreatRecipe: async () => {
        throw new ApiError('NOT_FOUND', 404);
      },
    });
    expect(wizard.phase).toBe('missing');
  });

  it('keeps the failure of the read as the text it shows', async () => {
    const { wizard } = await opened({
      getThreatRecipeDraft: async () => {
        throw new ApiError('GIT_UNAVAILABLE', 503);
      },
    });
    expect(wizard.phase).toBe('failed');
    expect(wizard.loadFailure).toBe('error.git-unavailable');
  });

  it('drops the answer of an earlier read when a later one was asked', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { wizard, fake } = await opened();
    fake.getThreatRecipe.mockImplementationOnce(async () => {
      await gate;
      return { ...structuredClone(RECIPE), title: 'Late' };
    });
    const first = wizard.open('quick-start', 'en');
    await wizard.open('quick-start', 'de');
    release();
    await first;
    expect(wizard.recipe?.title).toBe('Quick start');
  });

  it('reads the texts again in another language and keeps what was filled in', async () => {
    const { wizard, fake } = await opened({}, draftOf(1));
    fake.getThreatRecipe.mockImplementationOnce(async () => ({
      ...structuredClone(RECIPE),
      title: 'Schnellstart',
    }));
    await wizard.relocalise('quick-start', 'de');
    expect(wizard.recipe?.title).toBe('Schnellstart');
    expect(wizard.current).toBe(1);
    expect(wizard.name).toBe('Scheduler overview');
  });

  it('keeps the texts it has when the other language cannot be read or has other steps', async () => {
    const { wizard, fake } = await opened();
    fake.getThreatRecipe.mockImplementationOnce(async () => {
      throw new ApiError('NETWORK', 0);
    });
    await wizard.relocalise('quick-start', 'de');
    expect(wizard.recipe?.title).toBe('Quick start');
    fake.getThreatRecipe.mockImplementationOnce(async () => ({
      ...structuredClone(RECIPE),
      title: 'Other',
      steps: RECIPE.steps.slice(0, 1),
    }));
    await wizard.relocalise('quick-start', 'de');
    expect(wizard.recipe?.title).toBe('Quick start');
  });
});

describe('filling in', () => {
  it('differs from what is kept after a change and is the same again after the draft was kept', async () => {
    const { wizard } = await opened();
    wizard.setValue('/project', { name: 'Scheduler' });
    expect(wizard.dirty).toBe(true);
    expect(await wizard.next()).toBe(true);
    expect(wizard.dirty).toBe(false);
    wizard.setValue('/project', undefined);
    expect(wizard.values).toEqual({});
    expect(wizard.dirty).toBe(true);
  });

  it('sets the owner and the review date of the last page', async () => {
    const { wizard } = await opened({}, draftOf(3));
    wizard.setData({ owner: 'role:service-owner', 'last-review': '2026-11-20' });
    expect(wizard.dirty).toBe(true);
  });

  it('removes the countermeasures of a threat in the same change, and adds none where there were none', async () => {
    const { wizard } = await opened();
    wizard.setThreats([{ id: 'T-01' } as never], []);
    expect(wizard.values['/mitigations']).toBeUndefined();
    wizard.setThreats([{ id: 'T-01' } as never], [{ id: 'M-01' } as never]);
    expect(wizard.values['/mitigations']).toEqual([{ id: 'M-01' }]);
    wizard.setThreats([], []);
    expect(wizard.values['/mitigations']).toEqual([]);
  });
});

describe('going on and back', () => {
  it('keeps the whole draft with the step it goes on to, and writes nothing on the way back', async () => {
    const { wizard, calls, fake } = await opened();
    wizard.setValue('/project', { name: 'Scheduler' });
    expect(await wizard.next()).toBe(true);
    expect(calls.saved).toEqual([
      { step: 1, parts: { model: { fields: { '/project': { name: 'Scheduler' } } } } },
    ]);
    expect(wizard.current).toBe(1);
    expect(wizard.furthest).toBe(1);
    expect(wizard.keptAt).toBe('2026-11-26T09:21:00Z');
    wizard.back();
    expect(wizard.current).toBe(0);
    wizard.back();
    expect(wizard.current).toBe(0);
    expect(fake.saveThreatRecipeDraft).toHaveBeenCalledTimes(1);
    expect(wizard.furthest).toBe(1);
  });

  it('goes to a step that was reached and to no other', async () => {
    const { wizard } = await opened({}, draftOf(2));
    wizard.goTo(0);
    expect(wizard.current).toBe(0);
    wizard.goTo(3);
    expect(wizard.current).toBe(0);
    wizard.goTo(-1);
    expect(wizard.current).toBe(0);
    wizard.goTo(2);
    expect(wizard.current).toBe(2);
  });

  it('sends the owner and the date with the draft once the person has been on the last page', async () => {
    const { wizard, calls } = await opened({}, draftOf(3));
    wizard.back();
    wizard.setData({ owner: 'role:a', 'last-review': '2026-11-26' });
    expect(await wizard.next()).toBe(true);
    expect(calls.saved[0]).toMatchObject({
      step: 3,
      parts: { data: { fields: { '/owner': 'role:a', '/last-review': '2026-11-26' } } },
    });
  });

  it('does not go on from the last page, before the recipe is read, or while it keeps a draft', async () => {
    const { wizard } = await opened({}, draftOf(3));
    expect(await wizard.next()).toBe(false);
    const idle = new RecipeWizard('s', 'today', client().api);
    expect(await idle.next()).toBe(false);
    expect(await idle.create()).toBeNull();
    expect(idle.onReview).toBe(false);
    expect(idle.nameStep).toBe(-1);
  });

  it('stays where it is when the draft is refused, says which fields, and goes to the step of the first one', async () => {
    const { wizard } = await opened(
      {
        saveThreatRecipeDraft: async () => {
          throw new ApiError('VALIDATION', 422, [
            { part: 'model', pointer: '/project/name', code: 'MAX_LENGTH' },
          ]);
        },
      },
      draftOf(2),
    );
    expect(await wizard.next()).toBe(false);
    expect(wizard.current).toBe(0);
    expect(wizard.errors).toHaveLength(1);
    expect(wizard.errorsOf(0)).toHaveLength(1);
    expect(wizard.errorsOf(1)).toEqual([]);
    expect(wizard.errorsOf(9)).toEqual([]);
    expect(wizard.failure).toBe('error.validation');
    expect(wizard.lastAct).toBe('keeping');
    expect(wizard.busy).toBeNull();
    // The next attempt starts clean.
    wizard.setValue('/project', { name: 'x' });
    expect(wizard.failure).toBeNull();
  });

  it('says that a draft could not be kept for any other failure and stays', async () => {
    const { wizard } = await opened({
      saveThreatRecipeDraft: async () => {
        throw new ApiError('NETWORK', 0);
      },
    });
    expect(await wizard.next()).toBe(false);
    expect(wizard.current).toBe(0);
    expect(wizard.errors).toBeNull();
    expect(wizard.failure).toBe('error.network');
  });
});

describe('creating', () => {
  it('needs a name and says so', async () => {
    const { wizard } = await opened({}, { ...draftOf(3), parts: { model: { fields: {} } } });
    expect(wizard.createBlocker).toBe('name');
    wizard.setValue('/project', { name: 'A' });
    expect(wizard.createBlocker).toBeNull();
    expect(wizard.nameStep).toBe(0);
  });

  it('creates from the recipe and both parts, and then has nothing to lose', async () => {
    const { wizard, calls } = await opened({}, draftOf(3));
    wizard.setData({ owner: 'role:service-owner', 'last-review': '2026-11-26' });
    expect(wizard.dirty).toBe(true);
    const answer = await wizard.create();
    expect(answer).toEqual(CREATED);
    expect(calls.created).toEqual([
      {
        recipe: 'quick-start',
        parts: {
          data: { fields: { '/owner': 'role:service-owner', '/last-review': '2026-11-26' } },
          model: { fields: { '/project': { name: 'Scheduler overview' } } },
        },
      },
    ]);
    expect(wizard.created).toBe(true);
    expect(wizard.dirty).toBe(false);
    // A model is created once.
    expect(await wizard.create()).toBeNull();
    expect(calls.created).toHaveLength(1);
  });

  it('goes to the step of the first refused field and shows the refusal there', async () => {
    const { wizard } = await opened(
      {
        createThreatModel: async () => {
          throw new ApiError('VALIDATION', 422, [
            { part: 'model', pointer: '/project/name', code: 'REQUIRED' },
          ]);
        },
      },
      draftOf(3),
    );
    expect(await wizard.create()).toBeNull();
    expect(wizard.current).toBe(0);
    expect(wizard.errorsOf(0)[0].code).toBe('REQUIRED');
    expect(wizard.lastAct).toBe('creating');
    expect(wizard.created).toBe(false);
  });

  it('stays on the last page for a refusal of the owner', async () => {
    const { wizard } = await opened(
      {
        createThreatModel: async () => {
          throw new ApiError('VALIDATION', 422, [
            { part: 'data', pointer: '/owner', code: 'REFERENCE_NOT_FOUND' },
          ]);
        },
      },
      draftOf(3),
    );
    await wizard.create();
    expect(wizard.onReview).toBe(true);
    expect(wizard.dataErrors).toHaveLength(1);
    // A refusal of the part data that was seen on an earlier step brings the person to the last page.
    wizard.goTo(0);
    await wizard.create();
    expect(wizard.onReview).toBe(true);
  });

  it('tells a retired service and a Git server that cannot be reached, and creates nothing', async () => {
    const retired = await opened(
      {
        createThreatModel: async () => {
          throw new ApiError('SERVICE_RETIRED', 409);
        },
      },
      draftOf(3),
    );
    expect(await retired.wizard.create()).toBeNull();
    expect(retired.wizard.failure).toBe('error.service-retired');
    expect(retired.wizard.errors).toBeNull();
    expect(retired.wizard.created).toBe(false);
    const down = await opened(
      {
        createThreatModel: async () => {
          throw new ApiError('GIT_UNAVAILABLE', 503);
        },
      },
      draftOf(3),
    );
    expect(await down.wizard.create()).toBeNull();
    expect(down.wizard.failure).toBe('error.git-unavailable');
  });

  it('sends the password the step-up dialog collected and nothing for a request that is handled', async () => {
    const kit = client({
      createThreatModel: vi.fn(async (_s: string, _b: unknown, password?: string) => {
        if (typeof password !== 'string') throw new ApiError('STEP_UP_REQUIRED', 403);
        return CREATED;
      }),
      getThreatRecipeDraft: async () => ({
        service: 's',
        recipe: 'quick-start',
        draft: draftOf(3),
      }),
    });
    const handler = new StepUpHandler(kit.api, () => 'password');
    const wizard = new RecipeWizard('report-scheduler', '2026-11-26', kit.api, handler);
    await wizard.open('quick-start', 'en');
    const pending = wizard.create();
    await vi.waitFor(() => expect(get(handler.state).asking).toBe(true));
    await handler.submit('secret');
    expect(await pending).toEqual(CREATED);
    expect(kit.fake.createThreatModel).toHaveBeenLastCalledWith(
      'report-scheduler',
      expect.anything(),
      'secret',
    );
    // Cancelling the dialog is the handler's business: nothing was created and nothing is shown.
    const other = client({
      createThreatModel: async () => {
        throw new ApiError('STEP_UP_REQUIRED', 403);
      },
      getThreatRecipeDraft: async () => ({
        service: 's',
        recipe: 'quick-start',
        draft: draftOf(3),
      }),
    });
    const second = new StepUpHandler(other.api, () => 'password');
    const cancelled = new RecipeWizard('report-scheduler', '2026-11-26', other.api, second);
    await cancelled.open('quick-start', 'en');
    const waiting = cancelled.create();
    await vi.waitFor(() => expect(get(second.state).asking).toBe(true));
    second.cancel();
    expect(await waiting).toBeNull();
    expect(cancelled.failure).toBeNull();
    expect(cancelled.created).toBe(false);
  });
});
