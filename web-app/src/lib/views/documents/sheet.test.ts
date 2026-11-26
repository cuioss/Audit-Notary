import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { ApiError } from '../../api/errors';
import { DRAFT_DELAY_MS } from '../../documents/controller.svelte';
import { status } from '../../stores/app';
import { scenarioFetch } from '../../test/scenarioFetch';
import DocumentsView from './DocumentsView.svelte';
import { N1, N2, N3, N6, N7, N9, REPOSITORY, resetKit, useProfile, type Kit } from './testkit';

/**
 * The document sheet of the generic lens against the `note-*` states of the `workshop` profile and against `read-only`
 * (AUN-TEST-1): reading, the draft, the save, every refusal with its text, the steps of the workflow, the earlier states.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(resetKit);

/**
 * Opens a document of the lens.
 *
 * @param profile `name` or `name#state`
 * @param id the document
 * @param at an earlier state
 * @param lang the language
 * @returns the kit
 */
async function open(
  profile: string,
  id: string,
  at?: string,
  lang: 'en' | 'de' = 'en',
): Promise<Kit & { onnavigate: ReturnType<typeof vi.fn> }> {
  const kit = await useProfile(profile, lang);
  const onnavigate = vi.fn();
  render(DocumentsView, {
    route: 'categories.document',
    params: { category: 'test-note', document: id },
    query: at ? { at } : {},
    onnavigate,
  });
  await screen.findByTestId('document-sheet');
  return { ...kit, onnavigate };
}

/**
 * @param profile the profile whose read to take
 * @param id the document
 * @param change what to change in it
 * @returns the read of the document as the profile answers it, changed
 */
async function readOf(profile: string, id: string, change: Record<string, unknown>) {
  const answer = await scenarioFetch(profile).fetch(`/api/v1/documents/${REPOSITORY}/${id}`);
  return { ...((await answer.json()) as Record<string, unknown>), ...change };
}

const summary = () => screen.getByLabelText(/^Summary/);

/** Types into the summary and waits for the draft. */
async function type(text: string) {
  await fireEvent.input(summary(), { target: { value: text } });
}

const writes = (kit: Kit, method: string, path: string) =>
  kit.requests.filter((request) => request === `${method} ${path}`).length;

describe('reading a document', () => {
  it('shows the record: kind, title, state, version, last save, the form and the margin', async () => {
    await open('workshop', N2);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Retention schedule for audit evidence',
    );
    expect(screen.getByTestId('document-state')).toHaveTextContent('Draft');
    const sheet = screen.getByTestId('document-sheet');
    expect(sheet).toHaveTextContent('Note');
    expect(sheet).toHaveTextContent(/Version\s*1\s*Last saved/);
    expect(sheet).toHaveTextContent('Alex Example, Nov 26, 2026');
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Retention schedule for audit evidence');
    expect(screen.getByTestId('release-request')).toHaveTextContent(
      'Written from the interview notes; please submit it and release it.',
    );
    expect(screen.getByTestId('release-request')).toHaveTextContent('Alex Example asked');
    expect(within(screen.getByTestId('document-history')).getAllByRole('listitem')).toHaveLength(3);
  });

  it('restores the own draft over the saved value and says so', async () => {
    await open('workshop', N2);
    expect(summary()).toHaveValue('Keep audit evidence for ten years; review it every year.');
    expect(screen.getByRole('switch', { name: 'Pinned' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('restored-notice')).toHaveTextContent(
      'Your own draft from 9:30 AM is on this page. Others do not see it yet.',
    );
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'draft');
    expect(screen.getByTestId('save-state')).toHaveTextContent('Saved for you at 9:30 AM');
  });

  it('a clean document has nothing to save and says why', async () => {
    await open('workshop', N3);
    expect(screen.getByTestId('save-state')).toHaveTextContent('Everything is saved for everyone.');
    expect(screen.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Nothing changed since the last save.')).toBeInTheDocument();
  });

  it('names the release of a document with one: the line of the margin and the tag', async () => {
    await open('workshop', N7);
    expect(screen.getByTestId('release-block')).toHaveTextContent(
      'Released by Noor Haddad on Sep 30, 2026',
    );
    expect(screen.getByTestId('release-block')).toHaveTextContent(
      'notes/01JZ8X4F6H8K0N2Q4S6V8Y0A2C/v2',
    );
  });

  it('shows a released document that is not frozen as editable, and says what the next save does', async () => {
    await open('workshop', N1);
    expect(screen.getByTestId('document-state')).toHaveTextContent('Released as v1');
    expect(screen.getAllByText('Released as v1')).toHaveLength(2);
    expect(
      screen.getByText('Your next save starts version 2. The released version stays as it was.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('frozen-notice')).toBeNull();
    expect(summary()).not.toHaveAttribute('readonly');
  });

  it('shows a frozen document as read-only, typeset, with its reason and no act', async () => {
    const frozen = await readOf('workshop', N1, { frozen: true });
    await useProfile('workshop', 'en', { [`GET /api/v1/documents/${REPOSITORY}/${N1}`]: frozen });
    render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N1 },
      onnavigate: vi.fn(),
    });
    await screen.findByTestId('document-sheet');
    expect(screen.getByTestId('frozen-notice')).toHaveTextContent(
      'This document is released and frozen',
    );
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Released and frozen. Nothing here can change.',
    );
    expect(screen.queryByTestId('save-everyone')).toBeNull();
    expect(within(screen.getByTestId('document-form')).queryAllByRole('textbox')).toHaveLength(0);
  });

  it('reads for a person without the right edit: the form typeset, no save, the reason', async () => {
    await open('read-only', N2);
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'You can read this document. Editing needs the edit right.',
    );
    expect(screen.queryByTestId('save-everyone')).toBeNull();
    expect(within(screen.getByTestId('document-form')).queryAllByRole('textbox')).toHaveLength(0);
    // The own draft stays on the server: a reader sees the saved document.
    expect(screen.getByTestId('document-form')).toHaveTextContent(
      'Keep audit evidence for seven years; review it every two years.',
    );
    expect(screen.queryByTestId('restored-notice')).toBeNull();
  });
});

describe('the draft and the save', () => {
  it('keeps a change as the draft within the delay, on the blob the form loaded', async () => {
    const kit = await open('workshop', N3);
    await type('Restore the nightly backup on a clean host.');
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'changed');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    expect(writes(kit, 'PUT', `/api/v1/drafts/${REPOSITORY}/${N3}`)).toBe(1);
    const draft = kit.bodies.find((entry) => entry.request.startsWith('PUT'))!.body as {
      parts: { data: { blob: string; fields: Record<string, unknown> } };
    };
    expect(draft.parts.data.fields).toEqual({
      '/summary': 'Restore the nightly backup on a clean host.',
    });
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'draft'),
    );
  });

  it('saves for everyone, says so, and reads the document again', async () => {
    const kit = await open('workshop', N3);
    const reads = () => writes(kit, 'GET', `/api/v1/documents/${REPOSITORY}/${N3}`);
    expect(reads()).toBe(1);
    await type('Restore the nightly backup on a clean host.');
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'saved'),
    );
    expect(screen.getByTestId('save-state')).toHaveTextContent('Saved for everyone at');
    expect(writes(kit, 'POST', `/api/v1/documents/${REPOSITORY}/${N3}/save`)).toBe(1);
    await vi.waitFor(() => expect(reads()).toBe(2));
  });

  it('starts the next version when a released document is saved', async () => {
    await open('workshop', N1);
    await type('Rotate every 60 days.');
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByTestId('reopened-notice')).toHaveTextContent('Version 2 has begun');
  });

  it('refreshes what another person saved in place, keeps the own change and says who saved', async () => {
    const kit = await open('workshop', N2);
    await type('My own summary.');
    kit.scenario.goto('note-saved-by-other');
    kit.emit('document-saved', {
      repository: REPOSITORY,
      id: N2,
      fields: ['/summary', '/pinned'],
      part: 'data',
      by: { pseudonym: 'p-2b7f10', name: 'Jordan Weber' },
    });
    expect(await screen.findByTestId('remote-notice')).toHaveTextContent(
      'Jordan Weber saved this document. What you did not change here is up to date.',
    );
    expect(summary()).toHaveValue('My own summary.');
  });

  it('ignores an event for another document', async () => {
    const kit = await open('workshop', N3);
    kit.emit('document-saved', { repository: REPOSITORY, id: N2 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writes(kit, 'GET', `/api/v1/documents/${REPOSITORY}/${N3}`)).toBe(1);
  });

  it('shows a conflict per field with both versions, lets the person decide, then saves the decision', async () => {
    const kit = await open('workshop#note-conflict', N2);
    await type('Rotate every 90 days.');
    await fireEvent.change(screen.getByLabelText(/^Status/), { target: { value: 'agreed' } });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    const panel = await screen.findByTestId('conflict-panel');
    expect(panel).toHaveTextContent('2 fields were changed by someone else');
    const summaryConflict = screen.getByTestId('conflict-/summary');
    expect(summaryConflict).toHaveTextContent('Summary');
    expect(summaryConflict).toHaveTextContent('Your version');
    expect(summaryConflict).toHaveTextContent('Rotate every 90 days.');
    expect(summaryConflict).toHaveTextContent('Version of Jordan Weber');
    expect(summaryConflict).toHaveTextContent('Rotate every 60 days.');
    expect(screen.getByTestId('conflict-/status')).toHaveTextContent('Dropped');
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'conflict');
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      '2 fields were changed by someone else. Decide, then save again.',
    );
    expect(screen.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Decide the 2 open fields first.')).toBeInTheDocument();

    await fireEvent.click(screen.getByTestId('keep-own-/summary'));
    await fireEvent.click(screen.getByTestId('take-other-/status'));
    expect(screen.queryByTestId('conflict-panel')).toBeNull();
    expect(
      (screen.getByLabelText(/^Status/) as HTMLSelectElement).selectedOptions[0].textContent,
    ).toBe('Dropped');
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'saved'),
    );
    const saves = kit.bodies.filter((entry) => entry.request.endsWith('/save'));
    expect((saves[1].body as { parts: { data: { blob: string } } }).parts.data.blob).toBe(
      '5d1e9a0',
    );
  });

  it('shows the own side of a conflict as the page holds it now, when the field is changed again', async () => {
    await open('workshop#note-conflict', N2);
    await type('Rotate every 90 days.');
    await fireEvent.change(screen.getByLabelText(/^Status/), { target: { value: 'agreed' } });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    const conflict = await screen.findByTestId('conflict-/summary');
    expect(conflict).toHaveTextContent('Rotate every 90 days.');
    await type('Rotate every 30 days.');
    expect(screen.getByTestId('conflict-/summary')).toHaveTextContent('Rotate every 30 days.');
    expect(screen.getByTestId('conflict-/summary')).not.toHaveTextContent('Rotate every 90 days.');
  });

  it('marks the errors of a refused save at the fields and keeps the text on the page', async () => {
    await open('workshop#note-invalid', N2);
    await type('Rotate every 90 days.');
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(
      'Some entries are not valid. Correct the marked fields.',
    );
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Some entries need a correction. Until then your text stays on this page',
    );
    expect(summary()).toHaveValue('Rotate every 90 days.');
    expect(
      screen.getByText('This reference leads nowhere. Check it or choose another.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This person is not in the directory. Choose another.'),
    ).toBeInTheDocument();
  });

  it('says that the document was released meanwhile and keeps the changes', async () => {
    const kit = await open('workshop#note-released-meanwhile', N2);
    await type('Rotate every 90 days.');
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(
      'This document was released while you were working. Your changes are kept; save again to start the next version.',
    );
    expect(summary()).toHaveValue('Rotate every 90 days.');
    await vi.waitFor(() =>
      expect(writes(kit, 'GET', `/api/v1/documents/${REPOSITORY}/${N2}`)).toBe(2),
    );
  });

  it('says that the Git server refused the change and keeps the work', async () => {
    await open('workshop#note-rejected', N2);
    await type('Rotate every 90 days.');
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(
      'The Git server refused the change. Your work is kept; ask an administrator.',
    );
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Not saved for everyone. Your work is kept for you.',
    );
    expect(summary()).toHaveValue('Rotate every 90 days.');
  });

  it('keeps working as a draft while the Git server cannot be reached', async () => {
    const kit = await open('workshop#note-git-unavailable', N2);
    await type('Rotate every 90 days.');
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(
      'The Git server cannot be reached. Your work is kept; save again later.',
    );
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    await vi.waitFor(() =>
      expect(writes(kit, 'PUT', `/api/v1/drafts/${REPOSITORY}/${N2}`)).toBe(1),
    );
    await type('Rotate every 90 days, reviewed yearly.');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 10);
    await vi.waitFor(() =>
      expect(writes(kit, 'PUT', `/api/v1/drafts/${REPOSITORY}/${N2}`)).toBe(2),
    );
  });

  it('leaves for the identity provider when the save asks for step-up, after keeping the draft', async () => {
    const kit = await open('workshop#note-submit-step-up', N3);
    await type('Restore the nightly backup on a clean host.');
    vi.spyOn(apiClient, 'saveDocument').mockRejectedValue(
      new ApiError('STEP_UP_REQUIRED', 403, [], { stepUp: '/api/v1/auth/login?step-up=mfa' }),
    );
    const leave = vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() => expect(leave).toHaveBeenCalledWith('/api/v1/auth/login?step-up=mfa'));
    expect(writes(kit, 'PUT', `/api/v1/drafts/${REPOSITORY}/${N3}`)).toBe(1);
  });
});

describe('what others do meanwhile', () => {
  it('refreshes a field nobody changed here, in place, and leaves the one that was changed', async () => {
    const before = await readOf('workshop', N3, {});
    const after = {
      ...before,
      parts: {
        data: {
          ...(before.parts as Record<string, Record<string, unknown>>).data,
          blob: '9a8b7c6',
          savedBy: { pseudonym: 'p-2b7f10', name: 'Jordan Weber' },
          value: {
            title: 'Backup restore test, Q4 (renamed)',
            summary: 'Restore the nightly backup, measured by Jordan.',
          },
        },
      },
    };
    const answers: Record<string, unknown> = {
      [`GET /api/v1/documents/${REPOSITORY}/${N3}`]: before,
    };
    const kit = await useProfile('workshop', 'en', answers);
    render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N3 },
      onnavigate: vi.fn(),
    });
    await screen.findByTestId('document-sheet');
    await fireEvent.input(screen.getByLabelText(/^Title/), { target: { value: 'My title' } });
    answers[`GET /api/v1/documents/${REPOSITORY}/${N3}`] = after;
    kit.emit('document-saved', { repository: REPOSITORY, id: N3, fields: ['/summary'] });
    await vi.waitFor(() =>
      expect(summary()).toHaveValue('Restore the nightly backup, measured by Jordan.'),
    );
    expect(screen.getByLabelText(/^Title/)).toHaveValue('My title');
    expect(await screen.findByTestId('remote-notice')).toHaveTextContent('Jordan Weber saved');
  });

  it('shows the document as frozen, and not as released meanwhile, once the read says so', async () => {
    const open = await readOf('workshop', N2, { draft: null });
    const answers: Record<string, unknown> = {
      [`GET /api/v1/documents/${REPOSITORY}/${N2}`]: open,
    };
    await useProfile('workshop#note-released-meanwhile', 'en', answers);
    render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N2 },
      onnavigate: vi.fn(),
    });
    await screen.findByTestId('document-sheet');
    await type('Rotate every 90 days.');
    answers[`GET /api/v1/documents/${REPOSITORY}/${N2}`] = {
      ...open,
      frozen: true,
      state: 'released',
    };
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByTestId('frozen-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('failure-notice')).toBeNull();
    expect(screen.queryByTestId('save-everyone')).toBeNull();
  });
});

describe('the steps of the workflow', () => {
  it('offers the submit of a draft and names it with the category text', async () => {
    await open('workshop', N3);
    expect(screen.getByTestId('transition-test-note.submit')).toHaveTextContent(
      'Submit for review',
    );
  });

  it('lists the empty mandatory fields of a refused submit, each as a way to the field, and goes back to editing', async () => {
    await open('workshop', N3);
    await fireEvent.click(screen.getByTestId('transition-test-note.submit'));
    const list = await screen.findByTestId('missing-fields');
    expect(list).toHaveTextContent('Go to Noted at');
    expect(list).toHaveTextContent('Go to Status');
    expect(screen.getByText('Some mandatory fields are empty')).toBeInTheDocument();
    expect(screen.queryByTestId('failure-notice')).toBeNull();
    expect(screen.getAllByText('required').length).toBeGreaterThan(0);
    await fireEvent.click(within(list).getByRole('button', { name: 'Go to Status' }));
    expect(screen.getByLabelText(/^Status/)).toHaveFocus();
    await fireEvent.click(screen.getByTestId('back-to-editing'));
    expect(screen.queryByTestId('missing-fields')).toBeNull();
    expect(screen.getByLabelText(/^Noted at/)).toBeInTheDocument();
  });

  it('submits a saved draft: the document is in review and offers the release', async () => {
    const kit = await open('workshop', N9);
    await fireEvent.click(screen.getByTestId('transition-test-note.submit'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('document-state')).toHaveTextContent('In review'),
    );
    expect(
      writes(kit, 'POST', `/api/v1/documents/${REPOSITORY}/${N9}/transitions/test-note.submit`),
    ).toBe(1);
    expect(screen.getByTestId('transition-test-note.release')).toHaveAttribute(
      'href',
      `/categories/test-note/${N9}/release`,
    );
    expect(screen.getByTestId('transition-test-note.release')).toHaveTextContent('Release');
    expect(screen.queryByTestId('transition-test-note.submit')).toBeNull();
    expect(screen.getByTestId('step-up-note')).toHaveTextContent(
      'You confirm your identity once more before the release.',
    );
  });

  it('asks to save first when the person has changes, then saves and submits', async () => {
    const kit = await open('workshop#note-submit-stepped-up', N3);
    await type('Restore the nightly backup on a clean host.');
    await fireEvent.click(screen.getByTestId('transition-test-note.submit'));
    expect(await screen.findByText('Save your changes first')).toBeInTheDocument();
    expect(
      writes(kit, 'POST', `/api/v1/documents/${REPOSITORY}/${N3}/transitions/test-note.submit`),
    ).toBe(0);
    await fireEvent.click(screen.getByTestId('save-first'));
    await vi.waitFor(() =>
      expect(
        writes(kit, 'POST', `/api/v1/documents/${REPOSITORY}/${N3}/transitions/test-note.submit`),
      ).toBe(1),
    );
    expect(writes(kit, 'POST', `/api/v1/documents/${REPOSITORY}/${N3}/save`)).toBe(1);
    expect(screen.queryByText('Save your changes first')).toBeNull();
  });

  it('does not submit when the save before it is refused', async () => {
    const kit = await open('workshop#note-rejected', N2);
    await type('Rotate every 90 days.');
    await fireEvent.click(screen.getByTestId('transition-test-note.submit'));
    await fireEvent.click(await screen.findByTestId('save-first'));
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(
      'The Git server refused the change.',
    );
    expect(
      writes(kit, 'POST', `/api/v1/documents/${REPOSITORY}/${N2}/transitions/test-note.submit`),
    ).toBe(0);
    expect(screen.getByText('Save your changes first')).toBeInTheDocument();
  });

  it.each([
    [
      'note-rejected',
      'The Git server refused the change. Your work is kept; ask an administrator.',
    ],
    [
      'note-git-unavailable',
      'The Git server cannot be reached. Your work is kept; save again later.',
    ],
  ])('shows the refusal of a step in %s', async (state, text) => {
    await open(`workshop#${state}`, N2);
    // The restored draft is the person's own change: save it away so the step acts on a saved document.
    vi.spyOn(apiClient, 'saveDocument').mockResolvedValue({
      outcome: 'SAVED',
      at: '2026-11-26T10:00:00Z',
    } as never);
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'saved'),
    );
    await fireEvent.click(screen.getByTestId('transition-test-note.submit'));
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(text);
  });

  it('leaves for the identity provider when a step asks for step-up', async () => {
    const clean = await readOf('workshop', N2, { draft: null });
    await useProfile('workshop#note-submit-step-up', 'en', {
      [`GET /api/v1/documents/${REPOSITORY}/${N2}`]: clean,
    });
    render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N2 },
      onnavigate: vi.fn(),
    });
    await screen.findByTestId('document-sheet');
    const leave = vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    await fireEvent.click(screen.getByTestId('transition-test-note.submit'));
    await vi.waitFor(() => expect(leave).toHaveBeenCalledWith('/api/v1/auth/login?step-up=mfa'));
  });

  it('asks a local user to confirm, and shows a wrong password and too many logins in words', async () => {
    status.set({
      version: 't',
      degraded: false,
      loginProvider: 'local',
      stepUp: 'password',
      repositories: [],
    });
    await open('workshop', N3);
    // The step declares no step-up: it is sent first, and the server's demand opens the question.
    const transition = vi
      .spyOn(apiClient, 'transition')
      .mockRejectedValueOnce(new ApiError('STEP_UP_REQUIRED', 403))
      .mockRejectedValueOnce(new ApiError('INVALID_CREDENTIALS', 401))
      .mockRejectedValueOnce(new ApiError('TOO_MANY_LOGINS', 503));
    await fireEvent.click(screen.getByTestId('transition-test-note.submit'));
    expect(transition).toHaveBeenCalledTimes(1);
    const password = await screen.findByTestId('document-password');
    expect(screen.getByText('Confirm your identity')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Enter your password to confirm “Submit for review” for Backup restore test, Q4.',
      ),
    ).toBeInTheDocument();
    await fireEvent.input(password, { target: { value: 'wrong' } });
    await fireEvent.click(screen.getByTestId('document-confirm'));
    expect(
      await screen.findByText('The password is not right. Nothing was changed.'),
    ).toBeInTheDocument();
    await fireEvent.input(screen.getByTestId('document-password'), { target: { value: 'again' } });
    await fireEvent.click(screen.getByTestId('document-confirm'));
    expect(
      await screen.findByText('Many people are logging in right now. Try again in a minute.'),
    ).toBeInTheDocument();
    expect(transition).toHaveBeenCalledTimes(3);
  });

  it('does not ask a local user for the password for a step that needs none', async () => {
    status.set({
      version: 't',
      degraded: false,
      loginProvider: 'local',
      stepUp: 'password',
      repositories: [],
    });
    await open('workshop', N3);
    const transition = vi
      .spyOn(apiClient, 'transition')
      .mockRejectedValueOnce(new ApiError('REJECTED', 502));
    await fireEvent.click(screen.getByTestId('transition-test-note.submit'));
    await vi.waitFor(() => expect(transition).toHaveBeenCalledTimes(1));
    expect(transition.mock.calls[0][3]).toBeUndefined();
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');
  });

  it('shows the release of a document in review as a step the reader may not take, with the reason', async () => {
    await open('read-only', '01JZ8T5C7E9G1J3M5P7R9V1X3Z');
    const release = screen.getByTestId('transition-test-note.release');
    expect(release).toHaveAttribute('aria-disabled', 'true');
    expect(release).toHaveTextContent('Release');
    expect(screen.getByText('This step needs the approve right.')).toBeInTheDocument();
    expect(screen.queryByTestId('step-up-note')).toBeNull();
  });

  it('names a step that the person may not take, and says why', async () => {
    await open('read-only', N3);
    const submit = screen.getByTestId('transition-test-note.submit');
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('This step needs the edit right.')).toBeInTheDocument();
  });
});

describe('the earlier states', () => {
  it('lists the revisions of a document in the picker and opens one by its address', async () => {
    const kit = await open('workshop', N6);
    const picker = await screen.findByTestId('revision-select');
    await vi.waitFor(() => expect(within(picker).getAllByRole('option')).toHaveLength(6));
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Current state',
      expect.stringContaining('Released as v2 by Noor Haddad'),
      expect.stringContaining('Submitted for review by Jordan Weber'),
      expect.stringContaining('Saved by Jordan Weber'),
      expect.stringContaining('Released as v1 by Noor Haddad'),
      expect.stringContaining('Created by Jordan Weber'),
    ]);
    expect(kit.requests).toContain(`GET /api/v1/documents/${REPOSITORY}/${N6}/revisions`);
    await fireEvent.change(picker, { target: { value: 'v1' } });
    expect(kit.onnavigate).toHaveBeenCalledWith(`/categories/test-note/${N6}?at=v1`);
    await fireEvent.change(picker, { target: { value: '' } });
    expect(kit.onnavigate).toHaveBeenLastCalledWith(`/categories/test-note/${N6}`);
  });

  it('reads an earlier state typeset and read-only, says what it is and leads back', async () => {
    await open('workshop', N6, 'v1');
    expect(screen.getByTestId('revision-notice')).toHaveTextContent(
      'You are reading an earlier state',
    );
    expect(screen.getByTestId('revision-notice')).toHaveTextContent(
      'Released as v1 by Noor Haddad',
    );
    expect(screen.getByTestId('document-state')).toHaveTextContent('Released');
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'An earlier state can be read only.',
    );
    expect(screen.queryByTestId('save-everyone')).toBeNull();
    expect(screen.queryByTestId('transition-bar')).toBeNull();
    expect(within(screen.getByTestId('document-form')).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(screen.getByTestId('revision-picker')).getByRole('link')).toHaveAttribute(
      'href',
      `/categories/test-note/${N6}`,
    );
    expect(within(screen.getByTestId('revision-notice')).getByRole('link')).toHaveAttribute(
      'href',
      `/categories/test-note/${N6}`,
    );
    await vi.waitFor(() => expect(screen.getByTestId('revision-select')).toHaveValue('v1'));
  });

  it('opens a revision by commit', async () => {
    await open('workshop', N6, '4be0c3a');
    expect(screen.getByTestId('revision-notice')).toHaveTextContent(
      'Submitted for review by Jordan Weber',
    );
  });

  it('keeps a revision the list does not hold as a choice, so the picker never shows another', async () => {
    await useProfile('workshop', 'en', {
      [`GET /api/v1/documents/${REPOSITORY}/${N6}/revisions`]: {
        repository: REPOSITORY,
        id: N6,
        revisions: [],
        truncated: true,
      },
    });
    render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N6 },
      query: { at: 'v1' },
      onnavigate: vi.fn(),
    });
    const select = await screen.findByTestId('revision-select');
    await vi.waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
    expect(select).toHaveValue('v1');
    expect(await screen.findByText('Only the newest states are listed.')).toBeInTheDocument();
  });

  it('says so when the earlier states cannot be listed', async () => {
    await useProfile('workshop', 'en', {
      [`GET /api/v1/documents/${REPOSITORY}/${N6}/revisions`]: Response.json(
        { outcome: 'GIT_UNAVAILABLE' },
        { status: 503 },
      ),
    });
    render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N6 },
      onnavigate: vi.fn(),
    });
    await screen.findByTestId('document-sheet');
    expect(await screen.findByText('The earlier states could not be listed.')).toBeInTheDocument();
  });
});

describe('in German', () => {
  it('shows the sheet, the refusals and the steps with the German texts', async () => {
    await open('workshop#note-conflict', N2, undefined, 'de');
    expect(screen.getByTestId('document-sheet')).toHaveTextContent('Notiz');
    expect(screen.getByTestId('document-state')).toHaveTextContent('Entwurf');
    expect(screen.getByTestId('transition-test-note.submit')).toHaveTextContent(
      'Zur Prüfung einreichen',
    );
    expect(screen.getByTestId('save-everyone')).toHaveTextContent('Für alle speichern');
    expect(screen.getByTestId('restored-notice')).toHaveTextContent('Ihr eigener Entwurf');
  });
});
