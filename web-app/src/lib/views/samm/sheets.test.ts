import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { ApiError } from '../../api/errors';
import type { SammAssessment, SammComparison, SammModel, SammScope } from '../../api/types';
import { clearModels, loadModel } from '../../samm/store';
import { session } from '../../stores/app';
import { scenarioFetch } from '../../test/scenarioFetch';
import AssessmentListColumn from './AssessmentListColumn.svelte';
import AssessmentSheet from './AssessmentSheet.svelte';
import PracticeListColumn from './PracticeListColumn.svelte';
import PracticeSheet from './PracticeSheet.svelte';
import SammOverview from './SammOverview.svelte';
import ScopeListColumn from './ScopeListColumn.svelte';
import ScopeSheet from './ScopeSheet.svelte';
import SinceList from './SinceList.svelte';

/**
 * The SAMM sheets and columns against the data of the `web-mock` profiles (AUN-TEST-1).
 */
interface Fixture {
  scope: SammScope;
  assessment: SammAssessment;
  model: SammModel;
  state: () => string;
}

/**
 * Stubs fetch with a profile, signs its user in and reads one assessment with its scope and model.
 *
 * @param profile `name` or `name#state`
 * @param scopeId the scope
 * @param slug the assessment's address segment
 * @returns the data the sheets take
 */
async function fixture(profile: string, scopeId = 'payments', slug = '2026-q4'): Promise<Fixture> {
  const scenario = scenarioFetch(profile);
  vi.stubGlobal('fetch', scenario.fetch);
  session.set(await apiClient.getSession());
  const scope = await apiClient.getSammScope(scopeId);
  const assessment = await apiClient.getSammAssessment(`${scopeId}-${slug}`);
  const model = await loadModel(scope.modelVersion);
  return { scope, assessment, model, state: scenario.state };
}

/**
 * @param model the model
 * @param assessment the assessment
 * @returns the assessment with every question answered
 */
function answeredFully(model: SammModel, assessment: SammAssessment): SammAssessment {
  const answers: SammAssessment['answers'] = {};
  for (const practice of model.functions.flatMap((fn) => fn.practices)) {
    answers[practice.id] = {};
    for (const question of practice.streams.flatMap((stream) => stream.questions)) {
      answers[practice.id][question.id] = { answer: 1 };
    }
  }
  return { ...assessment, answers };
}

beforeEach(() => clearModels());

afterEach(() => {
  session.set(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ScopeListColumn', () => {
  it('waits for the scopes', () => {
    render(ScopeListColumn, { scopes: null, selected: null });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('lists every scope and marks the selected one', async () => {
    vi.stubGlobal('fetch', scenarioFetch('workshop').fetch);
    const scopes = await apiClient.getSammScopes();
    render(ScopeListColumn, { scopes, selected: 'payments' });
    const list = screen.getByTestId('scope-list');
    expect(list.querySelectorAll('li')).toHaveLength(scopes.scopes.length);
    expect(screen.getByTestId('scope-payments')).toHaveAttribute('aria-current', 'page');
  });
});

describe('SammOverview', () => {
  it('waits for the scopes', () => {
    render(SammOverview, { scopes: null });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('lists the scopes as a register with their latest release and open assessment', async () => {
    vi.stubGlobal('fetch', scenarioFetch('workshop').fetch);
    const scopes = await apiClient.getSammScopes();
    render(SammOverview, { scopes });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SAMM overview');
    expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(
      scopes.scopes.length,
    );
    expect(screen.getByRole('link', { name: 'Payments' })).toHaveAttribute(
      'href',
      '/samm/payments',
    );
  });

  it('names a scope without a release and without an open assessment', () => {
    render(SammOverview, {
      scopes: {
        scopes: [
          {
            id: 'new',
            title: 'New team',
            subject: { kind: 'team', name: 'New team' },
            latest: null,
            open: null,
            assessments: 0,
          },
        ],
      },
    });
    expect(screen.getByText('No released assessment yet')).toBeInTheDocument();
    expect(screen.getByText('None open')).toBeInTheDocument();
  });
});

describe('AssessmentListColumn', () => {
  it('waits for the scope', () => {
    render(AssessmentListColumn, { scope: null, selected: null });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('lists the assessments, the draft with its answered count', async () => {
    const { scope } = await fixture('workshop');
    render(AssessmentListColumn, { scope, selected: '2026-q4' });
    expect(screen.getByTestId('assessment-list').querySelectorAll('li')).toHaveLength(
      scope.assessments.length,
    );
    expect(screen.getByTestId('assessment-2026-q4')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('assessment-2026-q4')).toHaveTextContent('63');
  });
});

describe('PracticeListColumn', () => {
  it('waits for its data', () => {
    render(PracticeListColumn, { scope: null, assessment: null, model: null, selected: null });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('lists the practices by business function with their progress', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    render(PracticeListColumn, { scope, assessment, model, selected: 'sm' });
    const list = screen.getByTestId('practice-list');
    expect(list.querySelectorAll('section')).toHaveLength(model.functions.length);
    expect(screen.getByTestId('practice-sm')).toHaveAttribute('aria-current', 'page');
    expect(list).toHaveTextContent('All answered');
  });

  it('shows practices without a target', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    render(PracticeListColumn, {
      scope: { ...scope, targets: {} },
      assessment: answeredFully(model, assessment),
      model,
      selected: null,
    });
    expect(screen.getByTestId('practice-sm')).not.toHaveTextContent('target');
  });
});

describe('ScopeSheet', () => {
  it('waits for the scope', () => {
    render(ScopeSheet, { scope: null });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the trend of the releases, the assessments and the targets', async () => {
    const { scope } = await fixture('workshop');
    render(ScopeSheet, { scope });
    expect(screen.getByTestId('scope-sheet')).toBeInTheDocument();
    expect(screen.getByText('Overall score over time')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Targets' })).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(15);
  });

  it('has no trend with a single release', async () => {
    const { scope } = await fixture('workshop', 'identity', '2026-q4');
    render(ScopeSheet, { scope });
    expect(screen.queryByText('Overall score over time')).not.toBeInTheDocument();
  });
});

describe('AssessmentSheet', () => {
  it('waits for its data', () => {
    render(AssessmentSheet, { scope: null, assessment: null, model: null });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('refuses to submit a draft with open questions and says why', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    render(AssessmentSheet, { scope, assessment, model });
    const submit = screen.getByTestId('assessment-submit');
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/questions are still open/)).toBeInTheDocument();
    expect(screen.queryByTestId('since-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gap-list')).not.toBeInTheDocument();
  });

  it('names the missing right to a reader', async () => {
    const { scope, assessment, model } = await fixture('read-only');
    render(AssessmentSheet, { scope, assessment, model });
    expect(screen.getByText('Submitting needs the edit right.')).toBeInTheDocument();
  });

  it('submits a complete draft and names the practices the server misses', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    const onchanged = vi.fn();
    render(AssessmentSheet, {
      scope,
      assessment: answeredFully(model, assessment),
      model,
      onchanged,
    });
    await fireEvent.click(screen.getByTestId('assessment-submit'));
    expect(await screen.findByText('Some mandatory fields are empty.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Architecture Assessment, Requirements-driven Testing',
    );
    expect(onchanged).not.toHaveBeenCalled();
  });

  it('reports a successful submit', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    vi.spyOn(apiClient, 'transition').mockResolvedValue({
      outcome: 'TRANSITIONED',
      state: 'in-review',
    });
    const onchanged = vi.fn();
    render(AssessmentSheet, {
      scope,
      assessment: answeredFully(model, assessment),
      model,
      onchanged,
    });
    await fireEvent.click(screen.getByTestId('assessment-submit'));
    await vi.waitFor(() => expect(onchanged).toHaveBeenCalled());
  });

  it('switches between the seal and the table', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    render(AssessmentSheet, { scope, assessment, model });
    expect(screen.getByTestId('maturity-seal')).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('maturity-view-table'));
    expect(screen.getByTestId('maturity-table')).toBeInTheDocument();
    expect(screen.queryByTestId('maturity-seal')).not.toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('maturity-view-seal'));
    expect(screen.getByTestId('maturity-seal')).toBeInTheDocument();
  });

  it('offers the review of an assessment in review and compares it with the last release', async () => {
    const { scope, assessment, model } = await fixture('release');
    render(AssessmentSheet, { scope, assessment, model });
    expect(screen.getByTestId('assessment-review')).toHaveAttribute(
      'href',
      '/samm/payments/2026-q4/release',
    );
    expect(await screen.findByTestId('since-list')).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('maturity-view-table'));
    expect(screen.getByRole('columnheader', { name: 'Change' })).toBeInTheDocument();
  });

  it('shows the release, its tag and the gaps of a released assessment', async () => {
    const { scope, assessment, model } = await fixture('workshop', 'payments', '2026-q2');
    render(AssessmentSheet, { scope, assessment, model });
    expect(screen.getByTestId('assessment-state')).toHaveTextContent('v1');
    expect(screen.getByTestId('release-tag')).toHaveTextContent('assessments/payments-2026-q2/v1');
    expect(screen.getByTestId('gap-list').querySelectorAll('li').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('assessment-submit')).not.toBeInTheDocument();
  });

  it('leaves out the comparison the server cannot give', async () => {
    const { scope, assessment, model } = await fixture('workshop', 'payments', '2026-q2');
    vi.spyOn(apiClient, 'compareSamm').mockRejectedValue(new Error('gone'));
    render(AssessmentSheet, { scope, assessment, model });
    await vi.waitFor(() => expect(apiClient.compareSamm).toHaveBeenCalled());
    expect(screen.queryByTestId('since-list')).not.toBeInTheDocument();
  });
});

describe('PracticeSheet', () => {
  it('waits for its data', () => {
    render(PracticeSheet, { scope: null, assessment: null, model: null, practiceId: 'sm' });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the practice with its answers, a clean save state and the pager', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    expect(screen.getByTestId('practice-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('save-state')).toHaveTextContent('Everything is saved for everyone.');
    expect(screen.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Nothing changed since the last save.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Next:/ })).toHaveAttribute(
      'href',
      '/samm/payments/2026-q4/pc',
    );
    expect(screen.queryByRole('link', { name: /^Previous:/ })).not.toBeInTheDocument();
  });

  it('links to the previous practice from the middle of the model', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'pc' });
    expect(screen.getByRole('link', { name: /^Previous:/ })).toHaveAttribute(
      'href',
      '/samm/payments/2026-q4/sm',
    );
  });

  it('keeps a change as a draft within seconds', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    const draft = vi.spyOn(apiClient, 'saveDraft');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    await fireEvent.click(screen.getByTestId('answer-sm-a-1-3'));
    expect(screen.getByTestId('save-state')).toHaveTextContent('Changed. Keeping it for you…');
    await vi.waitFor(
      () => expect(screen.getByTestId('save-state')).toHaveTextContent(/Saved for you at/),
      { timeout: 4000 },
    );
    expect(draft).toHaveBeenCalledWith('samm-assessments', 'payments-2026-q4', {
      parts: { sm: { blob: '003db47', fields: { 'sm-a-1/answer': 1 } } },
    });
  });

  it('saves for everyone', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    const onsaved = vi.fn();
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm', onsaved });
    await fireEvent.click(screen.getByTestId('answer-sm-a-1-3'));
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent(/Saved for everyone at/),
    );
    expect(onsaved).toHaveBeenCalled();
    expect(screen.getByTestId('answer-sm-a-1-3')).toBeChecked();
  });

  it('keeps a comment', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    await fireEvent.input(screen.getByTestId('comment-sm-a-1'), { target: { value: 'Agreed.' } });
    expect(screen.getByTestId('save-state')).toHaveTextContent('Changed. Keeping it for you…');
    expect(screen.getByTestId('save-everyone')).not.toHaveAttribute('aria-disabled');
  });

  it('shows a conflict per question and lets the person decide', async () => {
    const { scope, assessment, model } = await fixture('workshop#conflict');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    await fireEvent.click(screen.getByTestId('answer-sm-a-2-3'));
    await fireEvent.click(screen.getByTestId('save-everyone'));
    const first = await screen.findByTestId('conflict-sm-a-2');
    expect(screen.getByTestId('conflict-sm-b-1')).toBeInTheDocument();
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      '2 answers were changed by someone else.',
    );
    expect(screen.getByText('Decide the 2 open answers first.')).toBeInTheDocument();

    await fireEvent.click(within(first).getByRole('button', { name: 'Keep mine' }));
    expect(screen.queryByTestId('conflict-sm-a-2')).not.toBeInTheDocument();
    await fireEvent.click(
      within(screen.getByTestId('conflict-sm-b-1')).getByRole('button', {
        name: 'Take the answer of Jordan Weber',
      }),
    );
    expect(screen.queryByTestId('conflict-sm-b-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('answer-sm-b-1-2')).toBeChecked();
  });

  it('takes the other comment into the comment, not into the answer', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    vi.spyOn(apiClient, 'saveDocument').mockRejectedValueOnce(
      new ApiError('CONFLICT', 409, [], {
        outcome: 'CONFLICT',
        conflicts: [
          {
            part: 'sm',
            blob: 'b2',
            fields: [
              {
                pointer: '/answers/sm/sm-a-1/comment',
                own: 'Mine.',
                other: 'Theirs.',
                by: { pseudonym: 'p-2b7f10', name: 'Jordan Weber' },
              },
            ],
          },
        ],
      }),
    );
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    await fireEvent.input(screen.getByTestId('comment-sm-a-1'), { target: { value: 'Mine.' } });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    const conflict = await screen.findByTestId('conflict-sm-a-1-comment');
    expect(conflict).toHaveTextContent(
      'Jordan Weber saved the comment "Theirs.". Yours is "Mine.".',
    );
    await fireEvent.click(
      within(conflict).getByRole('button', { name: 'Take the comment of Jordan Weber' }),
    );
    expect(screen.getByTestId('comment-sm-a-1')).toHaveValue('Theirs.');
    // The answer is untouched: the loaded 0.5, the third answer.
    expect(screen.getByTestId('answer-sm-a-1-2')).toBeChecked();
  });

  it('keeps a change made while a save for everyone runs', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    let finish: (value: {
      outcome: 'SAVED';
      at: string;
      parts: Record<string, never>;
    }) => void = () => {};
    const save = vi
      .spyOn(apiClient, 'saveDocument')
      .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    await fireEvent.click(screen.getByTestId('answer-sm-a-1-3'));
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await fireEvent.click(screen.getByTestId('answer-sm-a-2-0'));
    // The save still runs: its act stays busy, so no second save can start beside it.
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'saving');
    expect(screen.getByTestId('save-everyone')).toHaveAttribute('aria-busy', 'true');
    finish({ outcome: 'SAVED', at: '2026-11-25T10:00:00Z', parts: {} });
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'changed'),
    );
    expect(screen.getByTestId('answer-sm-a-1-3')).toBeChecked();
    expect(screen.getByTestId('answer-sm-a-2-0')).toBeChecked();
    expect(save.mock.calls[0][2].parts.sm.fields).toEqual({ 'sm-a-1/answer': 1 });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(save.mock.calls[1][2].parts.sm.fields).toEqual({ 'sm-a-2/answer': 0 });
  });

  it('keeps an answer saved before when only the comment is saved after', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    vi.spyOn(apiClient, 'saveDocument').mockResolvedValue({
      outcome: 'SAVED',
      at: '2026-11-25T10:00:00Z',
      parts: {},
    });
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    await fireEvent.click(screen.getByTestId('answer-sm-a-1-3'));
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'saved'),
    );
    await fireEvent.input(screen.getByTestId('comment-sm-a-1'), { target: { value: 'Why.' } });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'saved'),
    );
    expect(screen.getByTestId('answer-sm-a-1-3')).toBeChecked();
  });

  it('says when a draft or a save fails and keeps the work', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    vi.spyOn(apiClient, 'saveDocument').mockRejectedValue(new Error('down'));
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    await fireEvent.click(screen.getByTestId('answer-sm-a-1-3'));
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent(
        'Not saved for everyone. Your work is kept for you.',
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
  });

  it('says when the draft cannot be kept', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { scope, assessment, model } = await fixture('workshop');
    vi.spyOn(apiClient, 'saveDraft').mockRejectedValue(new Error('down'));
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    await fireEvent.click(screen.getByTestId('answer-sm-a-1-3'));
    await vi.advanceTimersByTimeAsync(1500);
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent(
        'Not saved for everyone. Your work is kept for you.',
      ),
    );
  });

  it('keeps the pending draft when it closes', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    const draft = vi.spyOn(apiClient, 'saveDraft');
    const { unmount } = render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    await fireEvent.click(screen.getByTestId('answer-sm-a-1-3'));
    unmount();
    expect(draft).toHaveBeenCalledTimes(1);
  });

  it('answers with the number keys and moves with J and K', async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const { scope, assessment, model } = await fixture('workshop');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    const radio = screen.getByTestId('answer-sm-a-1-0');

    await fireEvent.keyDown(radio, { key: '4' });
    expect(screen.getByTestId('answer-sm-a-1-3')).toBeChecked();

    await fireEvent.keyDown(radio, { key: 'j' });
    expect(document.querySelector('[data-question="sm-a-2"]')).toHaveClass('question--active');
    await fireEvent.keyDown(radio, { key: '1' });
    expect(screen.getByTestId('answer-sm-a-2-0')).toBeChecked();
    await fireEvent.keyDown(radio, { key: 'k' });
    expect(document.querySelector('[data-question="sm-a-1"]')).toHaveClass('question--active');
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it('ignores keys outside the sheet, in a comment and with a modifier', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    await fireEvent.keyDown(document.body, { key: '4' });
    await fireEvent.keyDown(screen.getByTestId('comment-sm-a-1'), { key: '4' });
    await fireEvent.keyDown(screen.getByTestId('answer-sm-a-1-0'), { key: '4', ctrlKey: true });
    await fireEvent.keyDown(screen.getByTestId('answer-sm-a-1-0'), { key: 'x' });
    expect(screen.getByTestId('save-state')).toHaveTextContent('Everything is saved for everyone.');
  });

  it('switches the key hints off and remembers it', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    const { container } = render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    expect(container.querySelector('kbd')).not.toBeNull();
    await fireEvent.click(screen.getByTestId('key-hints'));
    expect(localStorage.getItem('audit_notary_key_hints')).toBe('off');
    expect(container.querySelector('kbd')).toBeNull();
  });

  it('starts without key hints when they were switched off', async () => {
    localStorage.setItem('audit_notary_key_hints', 'off');
    const { scope, assessment, model } = await fixture('workshop');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    expect(screen.getByTestId('key-hints')).toHaveAttribute('aria-checked', 'false');
  });

  it('is read only without the edit right', async () => {
    const { scope, assessment, model } = await fixture('read-only');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'You can read this assessment. Editing needs the edit right.',
    );
    expect(screen.queryByTestId('save-everyone')).not.toBeInTheDocument();
    await fireEvent.keyDown(screen.getByTestId('answer-sm-a-1-0'), { key: '4' });
    expect(screen.getByTestId('answer-sm-a-1-3')).not.toBeChecked();
  });

  it('is frozen once released', async () => {
    const { scope, assessment, model } = await fixture('workshop', 'payments', '2026-q2');
    render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Released assessments are frozen. Nothing here can change.',
    );
  });

  it('says who saved the practice meanwhile and marks the questions', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    const { rerender } = render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    const other = await apiClient.getSammAssessment('payments-2026-q4');
    vi.stubGlobal('fetch', scenarioFetch('workshop#saved-by-other').fetch);
    const saved = await apiClient.getSammAssessment('payments-2026-q4');
    expect(other.parts.sm.blob).not.toBe(saved.parts.sm.blob);
    await rerender({ assessment: saved });
    expect(screen.getByText(/^Jordan Weber saved Strategy and Metrics\./)).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.getAllByText('Jordan Weber just saved this practice.').length).toBeGreaterThan(0);
  });

  it('starts afresh for another practice', async () => {
    const { scope, assessment, model } = await fixture('workshop');
    const { rerender } = render(PracticeSheet, { scope, assessment, model, practiceId: 'sm' });
    await fireEvent.click(screen.getByTestId('answer-sm-a-1-3'));
    await rerender({ practiceId: 'pc' });
    expect(screen.getByTestId('save-state')).toHaveTextContent('Everything is saved for everyone.');
  });
});

describe('SinceList', () => {
  it('draws a loss apart from a gain and names an unknown function by its id', async () => {
    const { model } = await fixture('workshop');
    const practices: SammComparison['functions'][number]['practices'] = [];
    const { container } = render(SinceList, {
      model,
      comparison: {
        from: '2026-q2',
        to: '2026-q4',
        modelVersion: 'v2.2.0',
        overall: { from: 1, to: 1.5, delta: 0.5 },
        functions: [
          ...model.functions.map((fn) => ({ id: fn.id, from: 1, to: 1.5, delta: 0.5, practices })),
          { id: 'unknown', from: 2, to: 1, delta: -1, practices },
        ],
      },
    });
    expect(screen.getByTestId('since-list').querySelectorAll('li')).toHaveLength(
      model.functions.length + 1,
    );
    expect(screen.getByText('unknown')).toBeInTheDocument();
    expect(container.querySelectorAll('.since__span--down')).toHaveLength(1);
  });
});
