import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  callback: null as null | ((navigation: unknown) => void),
  goto: vi.fn(),
}));

vi.mock('$app/navigation', () => ({
  beforeNavigate: (callback: (navigation: unknown) => void) => {
    navigation.callback = callback;
  },
  afterNavigate: () => {},
  goto: navigation.goto,
}));

import { apiClient } from '../../api/client';
import type { SammAssessment, SammModel, SammModelList, SammScope } from '../../api/types';
import { clearModels, loadModel } from '../../samm/store';
import { session } from '../../stores/app';
import { scenarioFetch } from '../../test/scenarioFetch';
import NewAssessmentSheet from './NewAssessmentSheet.svelte';
import NewScopeSheet from './NewScopeSheet.svelte';
import PracticeSheet from './PracticeSheet.svelte';
import ScopeSheet from './ScopeSheet.svelte';
import AssessmentSheet from './AssessmentSheet.svelte';
import EvidenceEditor from './EvidenceEditor.svelte';
import SammOverview from './SammOverview.svelte';
import ScopeListColumn from './ScopeListColumn.svelte';

/**
 * The SAMM completion (UC-SAMM-1 to UC-SAMM-5) against the `web-mock` profiles (AUN-TEST-1): a new scope, its targets, a
 * new assessment, the evidence and the AsciiDoc comment of a practice, the frozen assessment, the refused comparison.
 */
interface Kit {
  models: SammModelList;
  state: () => string;
  goto: (next: string) => void;
}

/**
 * Stubs fetch with a profile and signs its user in.
 *
 * @param profile `name` or `name#state`
 * @returns the pinned models and the current state of the scenario
 */
async function useProfile(profile: string): Promise<Kit> {
  const scenario = scenarioFetch(profile);
  vi.stubGlobal('fetch', scenario.fetch);
  session.set(await apiClient.getSession());
  return { models: await apiClient.getSammModels(), state: scenario.state, goto: scenario.goto };
}

/** Reads a scope, one of its assessments and its model with the stubbed fetch. */
async function read(
  scopeId: string,
  slug: string,
): Promise<{ scope: SammScope; assessment: SammAssessment; model: SammModel }> {
  const scope = await apiClient.getSammScope(scopeId);
  const assessment = await apiClient.getSammAssessment(`${scopeId}-${slug}`);
  return { scope, assessment, model: await loadModel(scope.modelVersion) };
}

/** Picks an option of a select by its text. */
async function choose(testId: string, optionText: string | RegExp): Promise<void> {
  const select = screen.getByTestId(testId) as HTMLSelectElement;
  const option = await within(select).findByRole('option', { name: optionText });
  await fireEvent.change(select, { target: { value: (option as HTMLOptionElement).value } });
}

beforeEach(() => {
  clearModels();
  navigation.callback = null;
  navigation.goto.mockClear();
});

afterEach(() => {
  session.set(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NewScopeSheet', () => {
  it('names the missing right and offers the way back', async () => {
    const { models } = await useProfile('read-only');
    render(NewScopeSheet, { models, canCreate: false, onnavigate: vi.fn() });
    expect(screen.getByText('Creating a scope needs the edit right.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the scopes' })).toHaveAttribute(
      'href',
      '/samm',
    );
  });

  it('waits for the pinned models and says when none is pinned', async () => {
    const { rerender } = render(NewScopeSheet, {
      models: null,
      canCreate: true,
      onnavigate: vi.fn(),
    });
    expect(screen.getByTestId('new-scope-loading')).toBeInTheDocument();
    await useProfile('workshop#models-none');
    await rerender({ models: await apiClient.getSammModels(), canCreate: true });
    expect(screen.getByRole('heading', { name: 'No model version is pinned' })).toBeInTheDocument();
  });

  it('asks for a title and for who is assessed before it creates anything', async () => {
    const { models } = await useProfile('workshop');
    render(NewScopeSheet, { models, canCreate: true, onnavigate: vi.fn() });
    const create = screen.getByTestId('create-scope');
    expect(create).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Enter a title first.')).toBeInTheDocument();
    await fireEvent.input(screen.getByTestId('new-scope-title'), {
      target: { value: 'Mobile Apps' },
    });
    expect(screen.getByText('Choose who is assessed first.')).toBeInTheDocument();
    expect(screen.getByTestId('save-state')).toHaveTextContent('Not stored yet.');
  });

  it('creates a scope for a team with its targets and moves to the address the server names', async () => {
    const { models, state } = await useProfile('workshop');
    const create = vi.spyOn(apiClient, 'createSammScope');
    const onnavigate = vi.fn();
    const oncreated = vi.fn();
    render(NewScopeSheet, { models, canCreate: true, onnavigate, oncreated });
    await fireEvent.input(screen.getByTestId('new-scope-title'), {
      target: { value: 'Mobile Apps' },
    });
    await choose('new-scope-subject', 'Mobile Apps');
    // The default version is chosen already; its practices make the targets.
    expect(screen.getByTestId('new-scope-model')).toHaveValue('v2.2.0');
    await choose('new-scope-targets-editor-sm-target', '2');
    await choose('new-scope-targets-editor-ta-target', '2.5');
    await fireEvent.input(screen.getByTestId('new-scope-targets-editor-ta-due'), {
      target: { value: '2027-03-31' },
    });
    await fireEvent.click(screen.getByTestId('create-scope'));
    await vi.waitFor(() => expect(onnavigate).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith({
      title: 'Mobile Apps',
      subject: 'team:mobile',
      modelVersion: 'v2.2.0',
      targets: { sm: { target: 2 }, ta: { target: 2.5, due: '2027-03-31' } },
    });
    expect(onnavigate).toHaveBeenCalledWith('/samm/mobile', { replace: true });
    expect(oncreated).toHaveBeenCalled();
    expect(state()).toBe('scope-created');
  });

  it('creates a scope for the whole organisation with no picker and no targets', async () => {
    const { models } = await useProfile('workshop');
    const create = vi.spyOn(apiClient, 'createSammScope');
    const onnavigate = vi.fn();
    render(NewScopeSheet, { models, canCreate: true, onnavigate });
    await fireEvent.input(screen.getByTestId('new-scope-title'), { target: { value: 'Whole' } });
    await fireEvent.click(screen.getByTestId('new-scope-kind-organisation'));
    expect(screen.queryByTestId('new-scope-subject')).not.toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('create-scope'));
    await vi.waitFor(() => expect(onnavigate).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toEqual({
      title: 'Whole',
      subject: 'organisation',
      modelVersion: 'v2.2.0',
    });
  });

  it('drops the picked team when the subject changes to a service', async () => {
    const { models } = await useProfile('workshop');
    render(NewScopeSheet, { models, canCreate: true, onnavigate: vi.fn() });
    await fireEvent.input(screen.getByTestId('new-scope-title'), { target: { value: 'X' } });
    await choose('new-scope-subject', 'Payments');
    await fireEvent.click(screen.getByTestId('new-scope-kind-service'));
    expect(screen.getByTestId('new-scope-subject')).toHaveValue('');
    expect(screen.getByText('Choose who is assessed first.')).toBeInTheDocument();
  });

  it('shows the refusal at the fields it names and keeps what was typed', async () => {
    const { models } = await useProfile('workshop#scope-invalid');
    const onnavigate = vi.fn();
    render(NewScopeSheet, { models, canCreate: true, onnavigate });
    await fireEvent.input(screen.getByTestId('new-scope-title'), { target: { value: 'Bad' } });
    await choose('new-scope-subject', 'Payments');
    await choose('new-scope-targets-editor-ta-target', '2.5');
    await choose('new-scope-targets-editor-rt-target', '1');
    await fireEvent.click(screen.getByTestId('create-scope'));
    expect(
      await screen.findByText('Some entries are not valid. Correct the marked fields.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Some entries need a correction. Nothing was created.',
    );
    expect(
      screen.getAllByText('This reference leads nowhere. Check it or choose another.').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Fill in this field.')).toBeInTheDocument();
    expect(screen.getByText('Choose one of the offered values.')).toBeInTheDocument();
    expect(screen.getByTestId('new-scope-title')).toHaveValue('Bad');
    expect(onnavigate).not.toHaveBeenCalled();
  });

  it('says when the Git server cannot be reached and keeps the form', async () => {
    const { models } = await useProfile('workshop#samm-git-unavailable');
    const onnavigate = vi.fn();
    render(NewScopeSheet, { models, canCreate: true, onnavigate });
    await fireEvent.input(screen.getByTestId('new-scope-title'), { target: { value: 'Mobile' } });
    await fireEvent.click(screen.getByTestId('new-scope-kind-organisation'));
    await fireEvent.click(screen.getByTestId('create-scope'));
    expect(await screen.findByText(/The Git server cannot be reached/)).toBeInTheDocument();
    expect(screen.getByTestId('save-state')).toHaveTextContent('Nothing was created.');
    expect(onnavigate).not.toHaveBeenCalled();
  });

  it('creates the scope without targets when the model version has no file', async () => {
    const { models } = await useProfile('workshop');
    render(NewScopeSheet, { models, canCreate: true, onnavigate: vi.fn() });
    await choose('new-scope-model', 'OWASP SAMM v2.1.0');
    expect(
      await screen.findByText(/The practices of this model version cannot be shown/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('new-scope-targets-editor')).not.toBeInTheDocument();
  });

  it('sends no target that was chosen for another model version', async () => {
    const { models } = await useProfile('workshop');
    const create = vi.spyOn(apiClient, 'createSammScope');
    render(NewScopeSheet, { models, canCreate: true, onnavigate: vi.fn() });
    await fireEvent.input(screen.getByTestId('new-scope-title'), { target: { value: 'Old' } });
    await fireEvent.click(screen.getByTestId('new-scope-kind-organisation'));
    await screen.findByTestId('new-scope-targets-editor-ta-target');
    await choose('new-scope-targets-editor-ta-target', '2.5');
    // Another version whose practices cannot be shown: the target of the first one is not sent with it.
    await choose('new-scope-model', 'OWASP SAMM v2.1.0');
    await screen.findByText(/The practices of this model version cannot be shown/);
    await fireEvent.click(screen.getByTestId('create-scope'));
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith({
      title: 'Old',
      subject: 'organisation',
      modelVersion: 'v2.1.0',
    });
  });

  it('waits for the practices of the chosen version before it creates a scope with targets', async () => {
    const { models } = await useProfile('workshop');
    const create = vi.spyOn(apiClient, 'createSammScope');
    render(NewScopeSheet, { models, canCreate: true, onnavigate: vi.fn() });
    await fireEvent.input(screen.getByTestId('new-scope-title'), { target: { value: 'Old' } });
    await fireEvent.click(screen.getByTestId('new-scope-kind-organisation'));
    await screen.findByTestId('new-scope-targets-editor-ta-target');
    await choose('new-scope-targets-editor-ta-target', '2.5');
    expect(screen.getByTestId('create-scope')).not.toHaveAttribute('aria-disabled', 'true');
    // Another version: until its practices are read the targets are not sent.
    const wanted = screen.getByTestId('new-scope-model') as HTMLSelectElement;
    await fireEvent.change(wanted, { target: { value: 'v2.1.0' } });
    expect(screen.getByTestId('create-scope')).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText(
        'The practices of this model version are still loading. Create the scope in a moment.',
      ),
    ).toBeInTheDocument();
    await screen.findByText(/The practices of this model version cannot be shown/);
    expect(screen.getByTestId('create-scope')).not.toHaveAttribute('aria-disabled', 'true');
    expect(create).not.toHaveBeenCalled();
  });

  it('follows no address that is none of the app', async () => {
    const { models } = await useProfile('workshop');
    vi.spyOn(apiClient, 'createSammScope').mockResolvedValue({
      outcome: 'CREATED',
      id: 'mobile',
      document: 'mobile',
      address: 'https://evil.example/',
      at: '2026-11-26T09:30:00Z',
      parts: {},
    });
    const onnavigate = vi.fn();
    render(NewScopeSheet, { models, canCreate: true, onnavigate });
    await fireEvent.input(screen.getByTestId('new-scope-title'), { target: { value: 'M' } });
    await fireEvent.click(screen.getByTestId('new-scope-kind-organisation'));
    await fireEvent.click(screen.getByTestId('create-scope'));
    await vi.waitFor(() =>
      expect(onnavigate).toHaveBeenCalledWith('/samm/mobile', { replace: true }),
    );
  });

  it('asks before the page is left with what was typed, and not after the scope was created', async () => {
    const { models } = await useProfile('workshop');
    render(NewScopeSheet, { models, canCreate: true, onnavigate: vi.fn() });
    const clean = { cancel: vi.fn(), willUnload: false, to: { url: new URL('http://x/samm') } };
    navigation.callback?.(clean);
    expect(clean.cancel).not.toHaveBeenCalled();
    await fireEvent.input(screen.getByTestId('new-scope-title'), { target: { value: 'Typed' } });
    const leaving = { cancel: vi.fn(), willUnload: false, to: { url: new URL('http://x/samm') } };
    navigation.callback?.(leaving);
    expect(leaving.cancel).toHaveBeenCalled();
    expect(
      await screen.findByText(
        'What you typed is not saved anywhere yet. If you leave, it is lost.',
      ),
    ).toBeInTheDocument();
  });
});

describe('NewAssessmentSheet', () => {
  it('names the missing right', async () => {
    const { models } = await useProfile('read-only');
    const scope = await apiClient.getSammScope('shop');
    render(NewAssessmentSheet, { scope, models, canCreate: false, onnavigate: vi.fn() });
    expect(screen.getByText('Starting an assessment needs the edit right.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the scopes' })).toHaveAttribute(
      'href',
      '/samm/shop',
    );
  });

  it('waits for the scope and the models, and says when no model is pinned', async () => {
    await useProfile('workshop#models-none');
    const scope = await apiClient.getSammScope('shop');
    const none = await apiClient.getSammModels();
    const { rerender } = render(NewAssessmentSheet, {
      scope: null,
      models: none,
      canCreate: true,
      onnavigate: vi.fn(),
    });
    expect(screen.getByTestId('new-assessment-loading')).toBeInTheDocument();
    await rerender({ scope, models: none, canCreate: true });
    expect(screen.getByTestId('new-assessment-no-model')).toBeInTheDocument();
  });

  it('starts an assessment with the further assessors and moves to its address', async () => {
    const { models, state } = await useProfile('workshop');
    const scope = await apiClient.getSammScope('shop');
    const create = vi.spyOn(apiClient, 'createSammAssessment');
    const onnavigate = vi.fn();
    render(NewAssessmentSheet, { scope, models, canCreate: true, onnavigate });
    // The creator is the first assessor and needs no pick; the model is the one the scope's newest assessment has.
    expect(screen.getByTestId('assessor-self')).toHaveTextContent('Alex Example');
    expect(screen.getByTestId('new-assessment-model')).toHaveValue('v2.2.0');
    await fireEvent.input(screen.getByTestId('new-assessment-title'), {
      target: { value: 'Web shop 2026 Q4' },
    });
    await fireEvent.input(screen.getByTestId('new-assessment-date'), {
      target: { value: '2026-11-26' },
    });
    await fireEvent.click(screen.getByTestId('assessor-add'));
    await choose('assessor-0-person', 'Jordan Weber');
    await fireEvent.click(screen.getByTestId('create-assessment'));
    await vi.waitFor(() => expect(onnavigate).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith('shop', {
      title: 'Web shop 2026 Q4',
      date: '2026-11-26',
      modelVersion: 'v2.2.0',
      assessors: ['p-2b7f10'],
    });
    expect(onnavigate).toHaveBeenCalledWith('/samm/shop/2026-q4', { replace: true });
    expect(state()).toBe('shop-assessment-created');
  });

  it('adds and removes assessors, and sends none for a row left empty', async () => {
    const { models } = await useProfile('workshop');
    const scope = await apiClient.getSammScope('shop');
    const create = vi.spyOn(apiClient, 'createSammAssessment');
    const onnavigate = vi.fn();
    render(NewAssessmentSheet, { scope, models, canCreate: true, onnavigate });
    await fireEvent.input(screen.getByTestId('new-assessment-title'), { target: { value: 'T' } });
    await fireEvent.click(screen.getByTestId('assessor-add'));
    await fireEvent.click(screen.getByTestId('assessor-add'));
    expect(screen.getByTestId('assessor-1')).toBeInTheDocument();
    // The act names the person it removes: two rows both reading "Remove" cannot be told apart by name.
    expect(screen.getByTestId('assessor-1-remove')).toHaveAccessibleName('Remove assessor 3');
    await fireEvent.click(screen.getByTestId('assessor-1-remove'));
    expect(screen.queryByTestId('assessor-1')).not.toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('create-assessment'));
    await vi.waitFor(() => expect(onnavigate).toHaveBeenCalled());
    expect(create.mock.calls[0][1].assessors).toEqual([]);
  });

  it('limits the further assessors and says so', async () => {
    const { models } = await useProfile('workshop');
    const scope = await apiClient.getSammScope('shop');
    render(NewAssessmentSheet, { scope, models, canCreate: true, onnavigate: vi.fn() });
    for (let row = 0; row < 30; row += 1) await fireEvent.click(screen.getByTestId('assessor-add'));
    expect(screen.getByTestId('assessor-add')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('At most 30 further assessors.')).toBeInTheDocument();
  });

  it('refuses while an assessment of the scope is open and links to it', async () => {
    const { models } = await useProfile('workshop');
    const scope = await apiClient.getSammScope('payments');
    render(NewAssessmentSheet, { scope, models, canCreate: true, onnavigate: vi.fn() });
    const notice = screen.getByTestId('open-notice');
    expect(notice).toHaveTextContent('Payments 2026 Q4 is still open');
    expect(within(notice).getByRole('link', { name: 'Open the assessment' })).toHaveAttribute(
      'href',
      '/samm/payments/2026-q4',
    );
    await fireEvent.input(screen.getByTestId('new-assessment-title'), { target: { value: 'T' } });
    expect(screen.getByTestId('create-assessment')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('An assessment of this scope is open already.')).toBeInTheDocument();
  });

  it('names the assessment the server says is open when one was started meanwhile', async () => {
    const { models } = await useProfile('workshop#shop-assessment-created');
    // The page read the scope before the other tab started the assessment: it shows none open.
    const scope = { ...(await apiClient.getSammScope('shop')), assessments: [] };
    const oncreated = vi.fn();
    render(NewAssessmentSheet, { scope, models, canCreate: true, onnavigate: vi.fn(), oncreated });
    await fireEvent.input(screen.getByTestId('new-assessment-title'), { target: { value: 'T' } });
    await fireEvent.click(screen.getByTestId('create-assessment'));
    const notice = await screen.findByTestId('open-notice');
    expect(within(notice).getByRole('link', { name: 'Open the assessment' })).toHaveAttribute(
      'href',
      '/samm/shop/2026-q4',
    );
    expect(oncreated).toHaveBeenCalled();
  });

  it('forgets the assessment a refusal named once a newer read of the scope shows none open', async () => {
    const { models } = await useProfile('workshop#shop-assessment-created');
    const scope = { ...(await apiClient.getSammScope('shop')), assessments: [] };
    const view = render(NewAssessmentSheet, {
      scope,
      models,
      canCreate: true,
      onnavigate: vi.fn(),
    });
    await fireEvent.input(screen.getByTestId('new-assessment-title'), { target: { value: 'T' } });
    await fireEvent.click(screen.getByTestId('create-assessment'));
    await screen.findByTestId('open-notice');
    // Someone released it meanwhile: the scope read again holds no open assessment, and starting one is possible.
    await view.rerender({ scope: { ...scope, assessments: [] } });
    await vi.waitFor(() => expect(screen.queryByTestId('open-notice')).not.toBeInTheDocument());
    expect(screen.getByTestId('create-assessment')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the refusal at the fields and at the assessor it names', async () => {
    const { models } = await useProfile('workshop#assessment-invalid');
    const scope = await apiClient.getSammScope('shop');
    render(NewAssessmentSheet, { scope, models, canCreate: true, onnavigate: vi.fn() });
    await fireEvent.input(screen.getByTestId('new-assessment-title'), { target: { value: 'T' } });
    await fireEvent.click(screen.getByTestId('assessor-add'));
    await choose('assessor-0-person', 'Jordan Weber');
    await fireEvent.click(screen.getByTestId('assessor-add'));
    await choose('assessor-1-person', /^Lea Brandt/);
    await fireEvent.click(screen.getByTestId('create-assessment'));
    expect(
      await screen.findByText('This person is not in the directory. Choose another.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('This does not have the expected form.').length).toBeGreaterThan(0);
    expect(screen.getByTestId('save-state')).toHaveTextContent('Nothing was created');
  });

  it('asks for a title and a date before it starts anything', async () => {
    const { models } = await useProfile('workshop');
    const scope = await apiClient.getSammScope('shop');
    render(NewAssessmentSheet, { scope, models, canCreate: true, onnavigate: vi.fn() });
    expect(screen.getByText('Enter a title first.')).toBeInTheDocument();
    await fireEvent.input(screen.getByTestId('new-assessment-title'), { target: { value: 'T' } });
    await fireEvent.input(screen.getByTestId('new-assessment-date'), { target: { value: '' } });
    expect(screen.getByText('Enter the date of the assessment first.')).toBeInTheDocument();
  });

  it('prefills the model version of the newest assessment when it is still pinned', async () => {
    const { models } = await useProfile('workshop');
    const scope = await apiClient.getSammScope('shop');
    const older = {
      ...scope,
      assessments: scope.assessments.map((entry) => ({ ...entry, modelVersion: 'v2.1.0' })),
    };
    const { unmount } = render(NewAssessmentSheet, {
      scope: older,
      models,
      canCreate: true,
      onnavigate: vi.fn(),
    });
    expect(screen.getByTestId('new-assessment-model')).toHaveValue('v2.1.0');
    unmount();
    const gone = {
      ...scope,
      modelVersion: 'v1.0.0',
      assessments: scope.assessments.map((entry) => ({ ...entry, modelVersion: 'v1.0.0' })),
    };
    render(NewAssessmentSheet, { scope: gone, models, canCreate: true, onnavigate: vi.fn() });
    expect(screen.getByTestId('new-assessment-model')).toHaveValue('v2.2.0');
  });
});

describe('ScopeSheet, the roadmap', () => {
  it('shows the targets as text to a reader and offers no control', async () => {
    await useProfile('read-only');
    const { scope } = await read('payments', '2026-q4');
    render(ScopeSheet, { scope });
    expect(await screen.findByRole('heading', { name: 'Targets' })).toBeInTheDocument();
    expect(screen.queryByTestId('targets-sm-target')).not.toBeInTheDocument();
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'You can read the targets. Changing them needs the edit right.',
    );
    expect(screen.queryByTestId('save-targets')).not.toBeInTheDocument();
    expect(screen.getByTestId('start-assessment')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Starting an assessment needs the edit right.')).toBeInTheDocument();
  });

  it('changes the targets, keeps them on the page and saves them for everyone', async () => {
    const { models, state } = await useProfile('workshop');
    const { scope } = await read('payments', '2026-q4');
    const onsaved = vi.fn();
    const draft = vi.spyOn(apiClient, 'saveDraft');
    const save = vi.spyOn(apiClient, 'saveDocument');
    render(ScopeSheet, { scope, models, onsaved });
    await screen.findByTestId('targets-ta-target');
    expect(screen.getByTestId('save-targets')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('save-state')).toHaveTextContent('Everything is saved for everyone.');
    await choose('targets-ta-target', '3');
    await choose('targets-rt-target', '2');
    await fireEvent.input(screen.getByTestId('targets-rt-due'), {
      target: { value: '2027-09-30' },
    });
    await choose('targets-om-target', 'No target');
    // A scope has no draft: the change is on the page only, and the state says so.
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Changed. Not saved for everyone yet.',
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(draft).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByTestId('save-targets'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent(/Saved for everyone at/),
    );
    expect(save).toHaveBeenCalledWith(
      'samm-assessments',
      'payments',
      {
        parts: {
          targets: {
            blob: '6c5fc54',
            fields: {
              '/ta': { target: 3, due: '2027-03-31' },
              '/rt': { target: 2, due: '2027-09-30' },
              '/om': null,
            },
          },
        },
      },
      undefined,
    );
    expect(onsaved).toHaveBeenCalled();
    expect(state()).toBe('targets-saved');
    expect(screen.getByTestId('targets-ta-target')).toHaveValue('3');
  });

  it('takes back a change and has nothing to save again', async () => {
    await useProfile('workshop');
    const { scope } = await read('payments', '2026-q4');
    render(ScopeSheet, { scope });
    await screen.findByTestId('targets-sm-target');
    await choose('targets-sm-target', '3');
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'changed');
    await choose('targets-sm-target', '2');
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'clean');
  });

  it('drops the due day with the target, and offers none for a practice without one', async () => {
    await useProfile('workshop');
    const { scope } = await read('payments', '2026-q4');
    render(ScopeSheet, { scope });
    await screen.findByTestId('targets-ta-target');
    expect(screen.getByTestId('targets-ta-due')).toHaveValue('2027-03-31');
    await choose('targets-ta-target', 'No target');
    expect(screen.queryByTestId('targets-ta-due')).not.toBeInTheDocument();
    // A due day typed for a target that was set, and emptied again, is none.
    await choose('targets-ta-target', '1');
    await fireEvent.input(screen.getByTestId('targets-ta-due'), {
      target: { value: '2027-05-01' },
    });
    await fireEvent.input(screen.getByTestId('targets-ta-due'), { target: { value: '' } });
    expect((screen.getByTestId('targets-ta-due') as HTMLInputElement).value).toBe('');
  });

  it('shows what the server refused at the practice and the field it names', async () => {
    await useProfile('workshop#targets-invalid');
    const { scope } = await read('payments', '2026-q4');
    render(ScopeSheet, { scope });
    await screen.findByTestId('targets-ta-target');
    await choose('targets-ta-target', '3');
    await fireEvent.click(screen.getByTestId('save-targets'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent(
        'Some targets need a correction. Nothing was saved.',
      ),
    );
    expect(screen.getByText('Choose one of the offered values.')).toBeInTheDocument();
    expect(screen.getByText('This does not have the expected form.')).toBeInTheDocument();
    expect(screen.getByTestId('targets-ta-target')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('targets-rt-due')).toHaveAttribute('aria-invalid', 'true');
  });

  it('decides a conflict per practice with both entries, then saves', async () => {
    const { state } = await useProfile('workshop#targets-conflict');
    const { scope } = await read('payments', '2026-q4');
    render(ScopeSheet, { scope });
    await screen.findByTestId('targets-ta-target');
    await choose('targets-ta-target', '3');
    await fireEvent.click(screen.getByTestId('save-targets'));
    const conflict = await screen.findByTestId('conflict-target-ta');
    expect(conflict).toHaveTextContent(
      'Jordan Weber saved the target of Threat Assessment: 2. Yours is 3, due by',
    );
    expect(screen.getByText('Someone else changed a target you changed')).toBeInTheDocument();
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'One target was changed by someone else. Decide, then save again.',
    );
    expect(screen.getByTestId('save-targets')).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(
      within(conflict).getByRole('button', { name: 'Take the target of Jordan Weber' }),
    );
    expect(screen.queryByTestId('conflict-target-ta')).not.toBeInTheDocument();
    expect(screen.getByTestId('targets-ta-target')).toHaveValue('2');
    await fireEvent.click(screen.getByTestId('save-targets'));
    await vi.waitFor(() => expect(state()).toBe('targets-saved'));
  });

  it('keeps own value of a conflict and saves it', async () => {
    await useProfile('workshop#targets-conflict');
    const { scope } = await read('payments', '2026-q4');
    render(ScopeSheet, { scope });
    await screen.findByTestId('targets-ta-target');
    await choose('targets-ta-target', '3');
    await fireEvent.click(screen.getByTestId('save-targets'));
    const conflict = await screen.findByTestId('conflict-target-ta');
    await fireEvent.click(within(conflict).getByRole('button', { name: 'Keep mine' }));
    expect(screen.getByTestId('targets-ta-target')).toHaveValue('3');
  });

  it('says when the Git server cannot be reached and keeps the changes', async () => {
    await useProfile('workshop#samm-git-unavailable');
    const { scope } = await read('payments', '2026-q4');
    render(ScopeSheet, { scope });
    await screen.findByTestId('targets-sm-target');
    await choose('targets-sm-target', '3');
    await fireEvent.click(screen.getByTestId('save-targets'));
    expect(await screen.findByTestId('targets-failure')).toHaveTextContent(
      'The Git server cannot be reached',
    );
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Not saved for everyone. Your changes stay on this page.',
    );
    expect(screen.getByTestId('targets-sm-target')).toHaveValue('3');
  });

  it('asks before it is left with unsaved targets', async () => {
    await useProfile('workshop');
    const { scope } = await read('payments', '2026-q4');
    render(ScopeSheet, { scope });
    await screen.findByTestId('targets-sm-target');
    const quiet = { cancel: vi.fn(), willUnload: false, to: { url: new URL('http://x/samm') } };
    navigation.callback?.(quiet);
    expect(quiet.cancel).not.toHaveBeenCalled();
    await choose('targets-sm-target', '3');
    const leaving = { cancel: vi.fn(), willUnload: false, to: { url: new URL('http://x/samm') } };
    navigation.callback?.(leaving);
    expect(leaving.cancel).toHaveBeenCalled();
  });

  it('tells that someone else saved the targets', async () => {
    await useProfile('workshop');
    const { scope } = await read('payments', '2026-q4');
    const { rerender } = render(ScopeSheet, { scope });
    await screen.findByTestId('targets-sm-target');
    await rerender({
      scope: {
        ...scope,
        targets: { ...scope.targets, sm: { target: 3 } },
        parts: {
          ...scope.parts,
          targets: {
            blob: 'ffffff0',
            savedAt: '2026-11-26T10:00:00Z',
            savedBy: { pseudonym: 'p-2b7f10', name: 'Jordan Weber' },
          },
        },
      },
    });
    expect(
      screen.getByText(
        'Jordan Weber saved the targets. Targets you did not change are up to date.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('targets-sm-target')).toHaveValue('3');
  });

  it('starts an assessment of a scope that has none open, and says why not where one is', async () => {
    const { models } = await useProfile('workshop');
    const shop = await apiClient.getSammScope('shop');
    const { unmount } = render(ScopeSheet, { scope: shop, models });
    expect(screen.getByTestId('start-assessment')).toHaveAttribute('href', '/samm/shop/new');
    unmount();
    const payments = await apiClient.getSammScope('payments');
    const second = render(ScopeSheet, { scope: payments, models });
    expect(screen.getByTestId('start-assessment')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/Payments 2026 Q4 is still open/)).toBeInTheDocument();
    second.unmount();
    await useProfile('workshop#models-none');
    render(ScopeSheet, { scope: shop, models: await apiClient.getSammModels() });
    expect(
      screen.getByText('No model version is pinned, so no assessment can be started.'),
    ).toBeInTheDocument();
  });

  it('reads the trend of the scope from its own request and says what it leaves out', async () => {
    await useProfile('workshop');
    const { scope } = await read('payments', '2026-q4');
    vi.spyOn(apiClient, 'getSammTrend').mockResolvedValue({
      scope: 'payments',
      modelVersion: 'v2.2.0',
      omitted: 2,
      points: [
        {
          assessment: 'a',
          document: 'a',
          title: 'A',
          date: '2025-01-01',
          overall: 1,
          functions: {},
          practices: {},
        },
        {
          assessment: 'b',
          document: 'b',
          title: 'B',
          date: '2026-01-01',
          overall: 2,
          functions: {},
          practices: {},
        },
      ],
    });
    render(ScopeSheet, { scope });
    expect(await screen.findByText('Overall score over time')).toBeInTheDocument();
    expect(screen.getByTestId('trend-omitted')).toHaveTextContent(
      '2 released assessments taken with another model version are not shown; the trend shows v2.2.0 only.',
    );
  });

  it('says what the trend leaves out even when it has too few points for a chart', async () => {
    await useProfile('workshop');
    const { scope } = await read('payments', '2026-q4');
    vi.spyOn(apiClient, 'getSammTrend').mockResolvedValue({
      scope: 'payments',
      modelVersion: 'v2.2.0',
      omitted: 2,
      points: [
        {
          assessment: 'b',
          document: 'b',
          title: 'B',
          date: '2026-01-01',
          overall: 2,
          functions: {},
          practices: {},
        },
      ],
    });
    render(ScopeSheet, { scope });
    expect(await screen.findByTestId('trend-omitted')).toHaveTextContent(
      '2 released assessments taken with another model version are not shown',
    );
  });

  it('asks before it is left with a half-typed due date, and saves nothing until it is finished or cleared', async () => {
    await useProfile('workshop');
    const { scope } = await read('payments', '2026-q4');
    render(ScopeSheet, { scope });
    const due = (await screen.findByTestId('targets-ta-due')) as HTMLInputElement;
    // A date the browser cannot read yet is no value: the field reports a bad input.
    Object.defineProperty(due, 'validity', { value: { badInput: true }, configurable: true });
    await fireEvent.input(due, { target: { value: '' } });
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Changed. Not saved for everyone yet.',
    );
    expect(screen.getByTestId('save-targets')).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText('A due date is not complete. Finish it or clear it first.'),
    ).toBeInTheDocument();
    expect(navigation.callback).not.toBeNull();
    const cancel = vi.fn();
    navigation.callback?.({ cancel, to: { url: new URL('http://localhost/samm') }, type: 'link' });
    expect(cancel).toHaveBeenCalled();
    // Finished: a day again.
    Object.defineProperty(due, 'validity', { value: { badInput: false }, configurable: true });
    await fireEvent.input(due, { target: { value: '2027-04-01' } });
    expect(screen.getByTestId('save-targets')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('shows no trend when it cannot be read', async () => {
    await useProfile('workshop');
    const { scope } = await read('payments', '2026-q4');
    vi.spyOn(apiClient, 'getSammTrend').mockRejectedValue(new Error('down'));
    render(ScopeSheet, { scope });
    expect(await screen.findByRole('heading', { name: 'Targets' })).toBeInTheDocument();
    expect(screen.queryByText('Overall score over time')).not.toBeInTheDocument();
  });

  it('says when the model of the scope cannot be read', async () => {
    await useProfile('workshop');
    const { scope } = await read('payments', '2026-q4');
    clearModels();
    vi.spyOn(apiClient, 'getSammModel').mockRejectedValue(new Error('down'));
    render(ScopeSheet, { scope });
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
  });
});

describe('the entries to the forms', () => {
  it('offers a new scope on the overview to a user who may create one, and says why not', async () => {
    const { models } = await useProfile('workshop');
    const scopes = await apiClient.getSammScopes();
    const first = render(SammOverview, { scopes, models, canCreate: true });
    expect(screen.getByTestId('new-scope')).toHaveAttribute('href', '/samm/new');
    first.unmount();
    const second = render(SammOverview, { scopes, models, canCreate: false });
    expect(screen.getByTestId('new-scope')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Creating a scope needs the edit right.')).toBeInTheDocument();
    second.unmount();
    const third = render(SammOverview, { scopes, models: { models: [] }, canCreate: true });
    expect(
      screen.getByText('No model version is pinned, so no scope can be created.'),
    ).toBeInTheDocument();
    third.unmount();
    render(SammOverview, { scopes, models: null, canCreate: true });
    expect(screen.getByTestId('new-scope')).toHaveAttribute('aria-disabled', 'true');
  });

  it('links a new scope below the list of scopes only to a user who may create one', async () => {
    await useProfile('workshop');
    const scopes = await apiClient.getSammScopes();
    const first = render(ScopeListColumn, { scopes, selected: null, canCreate: true });
    expect(screen.getByTestId('new-scope-link')).toHaveAttribute('href', '/samm/new');
    first.unmount();
    render(ScopeListColumn, { scopes, selected: null });
    expect(screen.queryByTestId('new-scope-link')).not.toBeInTheDocument();
  });
});

describe('PracticeSheet, the evidence and the comment', () => {
  it('lists the evidence links of the practice, the address a link only when it is https', async () => {
    await useProfile('workshop');
    const { scope, assessment, model } = await read('payments', '2026-q4');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sb' });
    const table = screen.getByTestId('evidence-editor-table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    const link = within(table).getByRole('link', { name: 'https://ci.example/payments/pipeline' });
    expect(link).toHaveAttribute('href', 'https://ci.example/payments/pipeline');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(table).getAllByText('The practice as a whole').length).toBeGreaterThan(0);
  });

  it('shows a link that is no https address as text, never as a link', async () => {
    await useProfile('workshop');
    const { scope, assessment, model } = await read('payments', '2026-q4');
    const hostile = {
      ...assessment,
      evidence: {
        sb: [{ question: null, title: 'Hostile', url: 'javascript:alert(1)' }],
      },
    };
    render(PracticeSheet, { scope, assessment: hostile, model, practiceId: 'sb' });
    const table = screen.getByTestId('evidence-editor-table');
    expect(within(table).queryByRole('link')).not.toBeInTheDocument();
    expect(within(table).getByText('javascript:alert(1)')).toBeInTheDocument();
  });

  it('adds a link with the editor, saves the whole list for everyone and reads it back', async () => {
    await useProfile('workshop');
    const { scope, assessment, model } = await read('payments', '2026-q4');
    const save = vi.spyOn(apiClient, 'saveDocument');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sb' });
    await fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
    // Nothing invalid is kept: the editor says what is wrong and applies nothing.
    await fireEvent.input(screen.getByTestId('evidence-editor-field-title'), {
      target: { value: 'Policy' },
    });
    await fireEvent.input(screen.getByTestId('evidence-editor-field-url'), {
      target: { value: 'http://wiki.example/policy' },
    });
    await fireEvent.click(screen.getByTestId('evidence-editor-apply'));
    expect(screen.getByText('Use an address that starts with https://.')).toBeInTheDocument();
    await fireEvent.input(screen.getByTestId('evidence-editor-field-url'), {
      target: { value: 'https://wiki.example/policy' },
    });
    await choose(
      'evidence-editor-field-question',
      /Dependencies/.test('') ? '' : 'The practice as a whole',
    );
    await fireEvent.click(screen.getByTestId('evidence-editor-apply'));
    const table = screen.getByTestId('evidence-editor-table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByTestId('save-state')).toHaveTextContent('Changed. Keeping it for you…');
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent(/Saved for everyone at/),
    );
    const sent = save.mock.calls[0][2].parts.sb.fields.evidence as { title: string }[];
    expect(sent.map((link) => link.title)).toEqual([
      'Pipeline of the payment service',
      'Dependency policy',
      'Policy',
    ]);
  });

  it('edits, moves and removes a link, and asks before it removes', async () => {
    await useProfile('workshop');
    const { scope, assessment, model } = await read('payments', '2026-q4');
    const save = vi.spyOn(apiClient, 'saveDocument');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sb' });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 2' }));
    await fireEvent.input(screen.getByTestId('evidence-editor-field-title'), {
      target: { value: 'Policy, renamed' },
    });
    await fireEvent.click(screen.getByTestId('evidence-editor-apply'));
    await fireEvent.click(screen.getByRole('button', { name: 'Move up, row 2' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Remove row 2' }));
    expect(
      screen.getByText(/The link "Pipeline of the payment service" leaves/),
    ).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('evidence-editor-remove-cancel'));
    expect(within(screen.getByTestId('evidence-editor-table')).getAllByRole('row')).toHaveLength(3);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove row 2' }));
    await fireEvent.click(screen.getByTestId('evidence-editor-remove-confirm'));
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][2].parts.sb.fields.evidence).toEqual([
      {
        question: null,
        title: 'Policy, renamed',
        url: 'https://wiki.example/payments/dependency-policy',
      },
    ]);
  });

  it('explains the limit of the practice where the act would be', async () => {
    await useProfile('workshop');
    const { scope, assessment, model } = await read('payments', '2026-q4');
    const full = {
      ...assessment,
      evidence: {
        sb: Array.from({ length: 50 }, (_, index) => ({
          question: null,
          title: `Link ${index}`,
          url: `https://wiki.example/${index}`,
        })),
      },
    };
    render(PracticeSheet, { scope, assessment: full, model, practiceId: 'sb' });
    expect(screen.getByRole('button', { name: 'Add row' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText('At most 50 links per practice.')).toBeInTheDocument();
  });

  it('shows the refusal of the evidence at the link and the member it names', async () => {
    await useProfile('workshop#evidence-invalid');
    const { scope, assessment, model } = await read('payments', '2026-q4');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sb' });
    await fireEvent.input(screen.getByTestId('comment-sb-b-1'), { target: { value: 'x' } });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    const errors = await screen.findByTestId('evidence-editor-errors');
    expect(errors).toHaveTextContent('Link 2: Use an address that starts with https://.');
    expect(errors).toHaveTextContent('Link 1: Fill in this field.');
    expect(screen.getByTestId('save-state')).toHaveTextContent('Some entries need a correction.');
    expect(screen.getByTestId('comment-sb-b-1')).toHaveAttribute('aria-invalid', 'true');
    // The editor shows the server's verdict for the link it opens.
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 2' }));
    expect(screen.getAllByText('Use an address that starts with https://.').length).toBeGreaterThan(
      0,
    );
  });

  it('decides a conflict of the evidence with both lists', async () => {
    await useProfile('workshop');
    const { scope, assessment, model } = await read('payments', '2026-q4');
    const theirs = [{ question: null, title: 'Their link', url: 'https://wiki.example/theirs' }];
    vi.spyOn(apiClient, 'saveDocument').mockRejectedValueOnce(
      new (await import('../../api/errors')).ApiError('CONFLICT', 409, [], {
        outcome: 'CONFLICT',
        conflicts: [
          {
            part: 'sb',
            blob: 'b2',
            fields: [
              {
                pointer: '/evidence/sb',
                own: assessment.evidence.sb,
                other: theirs,
                by: { pseudonym: 'p-2b7f10', name: 'Jordan Weber' },
              },
            ],
          },
        ],
      }),
    );
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sb' });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    await fireEvent.click(screen.getByTestId('evidence-editor-remove-confirm'));
    await fireEvent.click(screen.getByTestId('save-everyone'));
    const conflict = await screen.findByTestId('conflict-evidence');
    expect(conflict).toHaveTextContent(
      'Jordan Weber saved Their link. Yours are Pipeline of the payment service, Dependency policy.',
    );
    await fireEvent.click(
      within(conflict).getByRole('button', { name: 'Take the links of Jordan Weber' }),
    );
    expect(screen.queryByTestId('conflict-evidence')).not.toBeInTheDocument();
    const table = screen.getByTestId('evidence-editor-table');
    expect(within(table).getByText('Their link')).toBeInTheDocument();
  });

  it('keeps own list when the person keeps theirs', async () => {
    await useProfile('workshop');
    const { scope, assessment, model } = await read('payments', '2026-q4');
    vi.spyOn(apiClient, 'saveDocument').mockRejectedValueOnce(
      new (await import('../../api/errors')).ApiError('CONFLICT', 409, [], {
        outcome: 'CONFLICT',
        conflicts: [
          {
            part: 'sb',
            blob: 'b2',
            fields: [
              {
                pointer: '/evidence/sb',
                own: [],
                other: null,
                by: { pseudonym: 'p-2b7f10', name: 'Jordan Weber' },
              },
            ],
          },
        ],
      }),
    );
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sb' });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    await fireEvent.click(screen.getByTestId('evidence-editor-remove-confirm'));
    await fireEvent.click(screen.getByTestId('save-everyone'));
    const conflict = await screen.findByTestId('conflict-evidence');
    expect(conflict).toHaveTextContent('no links');
    await fireEvent.click(within(conflict).getByRole('button', { name: 'Keep mine' }));
    expect(screen.queryByTestId('conflict-evidence')).not.toBeInTheDocument();
  });

  it('shows the AsciiDoc comment as written and previews it', async () => {
    await useProfile('workshop');
    const { scope, assessment, model } = await read('payments', '2026-q4');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sb' });
    const field = screen.getByTestId('comment-sb-b-1');
    expect((field as HTMLTextAreaElement).value).toContain(
      'Dependency scanning runs in *every* pipeline.',
    );
    expect(await screen.findByTestId('comment-sb-b-1-preview')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(screen.getByTestId('comment-sb-b-1-preview')).toHaveAttribute('data-outcome', 'shown'),
    );
    expect(within(screen.getByTestId('comment-sb-b-1-preview')).getByText('every').tagName).toBe(
      'STRONG',
    );
  });

  it('reads the comment as formatted text in a frozen sheet and the evidence without an act', async () => {
    await useProfile('workshop');
    const { scope, assessment, model } = await read('payments', '2026-q2');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sb' });
    expect(screen.queryByRole('button', { name: 'Add row' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('save-everyone')).not.toBeInTheDocument();
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Released assessments are frozen. Nothing here can change.',
    );
    // The way on is a new assessment.
    expect(screen.getByTestId('start-new-assessment')).toHaveAttribute(
      'href',
      '/samm/payments/new',
    );
    expect(screen.getByText('Evidence')).toBeInTheDocument();
  });

  it('offers no way on from a frozen sheet to a reader, and no empty evidence', async () => {
    await useProfile('read-only');
    const { scope, assessment, model } = await read('payments', '2026-q2');
    const bare = { ...assessment, evidence: {} };
    render(PracticeSheet, { scope, assessment: bare, model, practiceId: 'pc' });
    expect(screen.queryByTestId('start-new-assessment')).not.toBeInTheDocument();
    expect(screen.queryByTestId('evidence')).not.toBeInTheDocument();
  });

  it('answers a save to an assessment released meanwhile with the frozen sheet', async () => {
    const { goto } = await useProfile('workshop');
    const { scope, assessment, model } = await read('payments', '2026-q4');
    const onrefresh = vi.fn();
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm', onrefresh });
    await fireEvent.click(screen.getByTestId('answer-sm-a-1-3'));
    // Noor Haddad releases the assessment while the person works on it.
    goto('assessment-released-meanwhile');
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByText(/This document is released and frozen/)).toBeInTheDocument();
    expect(onrefresh).toHaveBeenCalled();
    // The view reads the assessment again: it is released and frozen, and the answer typed stays on the page.
    const released = await apiClient.getSammAssessment('payments-2026-q4');
    expect(released.state).toBe('released');
  });
});

describe('AssessmentSheet, frozen and refused comparison', () => {
  it('offers a new assessment on a released one, to a user who may create one', async () => {
    await useProfile('workshop');
    const { scope, assessment, model } = await read('payments', '2026-q2');
    render(AssessmentSheet, { scope, assessment, model });
    expect(screen.getByTestId('start-new-assessment')).toHaveAttribute(
      'href',
      '/samm/payments/new',
    );
  });

  it('offers nothing on a released assessment to a reader', async () => {
    await useProfile('read-only');
    const { scope, assessment, model } = await read('payments', '2026-q2');
    render(AssessmentSheet, { scope, assessment, model });
    expect(screen.queryByTestId('start-new-assessment')).not.toBeInTheDocument();
  });

  it('names both assessments and both model versions when they are not compared', async () => {
    await useProfile('workshop#model-versions-differ');
    const { scope, assessment, model } = await read('payments', '2026-q2');
    render(AssessmentSheet, { scope, assessment, model });
    const notice = await screen.findByTestId('versions-differ');
    expect(notice).toHaveTextContent('These assessments are not compared');
    expect(notice).toHaveTextContent(
      'Payments 2025 Q4 was taken with model version v2.1.0, Payments 2026 Q2 with v2.2.0.',
    );
    // The scores of the assessment stay readable.
    expect(screen.getByTestId('maturity-seal')).toBeInTheDocument();
    expect(screen.queryByTestId('since-list')).not.toBeInTheDocument();
  });

  it('shows the changes since the previous release when the versions are the same', async () => {
    await useProfile('workshop');
    const { scope, assessment, model } = await read('payments', '2026-q2');
    render(AssessmentSheet, { scope, assessment, model });
    expect(await screen.findByTestId('since-list')).toBeInTheDocument();
    expect(screen.queryByTestId('versions-differ')).not.toBeInTheDocument();
  });
});

describe('EvidenceEditor, a list that changes while its dialog is open', () => {
  const link = (title: string) => ({
    question: null,
    title,
    url: `https://wiki.example/${title.toLowerCase()}`,
  });
  const questions: never[] = [];

  it('applies an edit to the link it was opened on, not to the one now at its position', async () => {
    const onchange = vi.fn();
    const view = render(EvidenceEditor, { links: [link('A'), link('B')], questions, onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 1' }));
    await fireEvent.input(screen.getByTestId('evidence-field-title'), { target: { value: 'A2' } });
    // Someone else saved the list in the other order.
    await view.rerender({ links: [link('B'), link('A')] });
    await fireEvent.click(screen.getByTestId('evidence-apply'));
    // Nothing was applied: the dialog says so and keeps what was typed.
    expect(onchange).not.toHaveBeenCalled();
    expect(screen.getByTestId('evidence-dialog-note')).toHaveTextContent(
      'The list changed while this window was open.',
    );
    expect(screen.getByTestId('evidence-field-title')).toHaveValue('A2');
    await fireEvent.click(screen.getByTestId('evidence-apply'));
    expect(onchange).toHaveBeenCalledWith([link('B'), { ...link('A'), title: 'A2' }]);
  });

  it('applies an edit of an unchanged list at once', async () => {
    const onchange = vi.fn();
    render(EvidenceEditor, { links: [link('A'), link('B')], questions, onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 2' }));
    await fireEvent.input(screen.getByTestId('evidence-field-title'), { target: { value: 'B2' } });
    await fireEvent.click(screen.getByTestId('evidence-apply'));
    expect(onchange).toHaveBeenCalledWith([link('A'), { ...link('B'), title: 'B2' }]);
  });

  it('removes the link that was confirmed, wherever the newer list holds it', async () => {
    const onchange = vi.fn();
    const view = render(EvidenceEditor, { links: [link('A'), link('B')], questions, onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    await view.rerender({ links: [link('B'), link('A')] });
    await fireEvent.click(screen.getByTestId('evidence-remove-confirm'));
    expect(onchange).toHaveBeenCalledWith([link('B')]);
  });

  it('removes nothing when the confirmed link is gone', async () => {
    const onchange = vi.fn();
    const view = render(EvidenceEditor, { links: [link('A'), link('B')], questions, onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    await view.rerender({ links: [link('B')] });
    await fireEvent.click(screen.getByTestId('evidence-remove-confirm'));
    expect(onchange).not.toHaveBeenCalled();
  });

  it('keeps the typed values and says the limit when the list filled up while a link was being added', async () => {
    const onchange = vi.fn();
    const forty9 = Array.from({ length: 49 }, (_, index) => link(`L${index}`));
    const view = render(EvidenceEditor, { links: forty9, questions, onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
    await fireEvent.input(screen.getByTestId('evidence-field-title'), { target: { value: 'New' } });
    await fireEvent.input(screen.getByTestId('evidence-field-url'), {
      target: { value: 'https://wiki.example/new' },
    });
    await view.rerender({ links: [...forty9, link('Fifty')] });
    await fireEvent.click(screen.getByTestId('evidence-apply'));
    expect(onchange).not.toHaveBeenCalled();
    expect(screen.getByTestId('evidence-dialog-note')).toHaveTextContent(
      'At most 50 links per practice.',
    );
    expect(screen.getByTestId('evidence-field-title')).toHaveValue('New');
  });

  it('accepts the fiftieth link', async () => {
    const onchange = vi.fn();
    const forty9 = Array.from({ length: 49 }, (_, index) => link(`L${index}`));
    render(EvidenceEditor, { links: forty9, questions, onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
    await fireEvent.input(screen.getByTestId('evidence-field-title'), { target: { value: 'New' } });
    await fireEvent.input(screen.getByTestId('evidence-field-url'), {
      target: { value: 'https://wiki.example/new' },
    });
    await fireEvent.click(screen.getByTestId('evidence-apply'));
    expect(onchange).toHaveBeenCalledOnce();
    expect(onchange.mock.calls[0][0]).toHaveLength(50);
  });
});
