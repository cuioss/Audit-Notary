import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { ApiError } from '../../api/errors';
import type { DocumentRead } from '../../api/types';
import { categoryList } from '../../documents/categories';
import { status } from '../../stores/app';
import { scenarioFetch } from '../../test/scenarioFetch';
import { breadcrumb } from '../../stores/breadcrumb';
import DocumentReleaseView from './DocumentReleaseView.svelte';
import { N1, N2, N4, N5, REPOSITORY, resetKit, useProfile, type Kit } from './testkit';

/**
 * The release of a document of the generic lens (UC-DOC-7, UC-DOC-8; AUN-WEB-6) against the `note-release-*` states of
 * the `workshop` profile (AUN-TEST-1): the review with its diff, the release by every way of confirming, every refusal
 * with its text, the seal, and the addresses that are no release.
 */
afterEach(() => {
  resetKit();
  categoryList.set(null);
});

/**
 * Opens the release of a note.
 *
 * @param profile `name` or `name#state`
 * @param id the note
 * @param lang the language
 * @param answers answers that replace the profile's own
 * @returns the kit
 */
async function open(
  profile: string,
  id: string,
  lang: 'en' | 'de' = 'en',
  answers: Record<string, unknown> = {},
): Promise<Kit> {
  const kit = await useProfile(profile, lang, answers);
  status.set(await apiClient.getStatus());
  render(DocumentReleaseView, { params: { category: 'test-note', document: id } });
  await screen.findByTestId('release-record');
  return kit;
}

/** @returns the dialog of the confirmation */
function dialog(): HTMLDialogElement {
  return document.querySelector('dialog') as HTMLDialogElement;
}

describe('the review', () => {
  it('shows what is released: the document, the changes grouped by property and the checks', async () => {
    await open('workshop', N4);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Release Supplier security questionnaire',
    );
    expect(screen.getByTestId('release-act')).toHaveTextContent(/^Release$/);
    expect(screen.getByTestId('release-facts')).toHaveTextContent('Version 1');
    expect(screen.getByTestId('release-facts')).toHaveTextContent('Jordan Weber');
    // The first release: nothing to compare with, every field is new.
    expect(screen.getByText(/The first release: everything in the document/)).toBeInTheDocument();
    const status = screen.getByTestId('record-status');
    expect(status).toHaveTextContent('Status');
    expect(status).toHaveTextContent('one change');
    // A value is read as the form reads it: the text of the option, the name of the person, never the code.
    expect(status).toHaveTextContent('Open');
    await vi.waitFor(() =>
      expect(screen.getByTestId('record-owner')).toHaveTextContent('Jordan Weber'),
    );
    expect(screen.getByTestId('record-owner')).not.toHaveTextContent('p-2b7f10');
    expect(screen.getByTestId('record-pinned')).toHaveTextContent('No');
    expect(screen.queryByTestId('release-tag')).toBeNull();
    // Nothing was before: no struck-out value.
    expect(screen.getByTestId('release-record').querySelectorAll('del')).toHaveLength(0);
    expect(screen.getByText('Every mandatory field is filled in')).toBeInTheDocument();
    expect(screen.getByText(/Submitted for review by Jordan Weber/)).toBeInTheDocument();
    expect(screen.getByText('The release is signed in your name and tagged.')).toBeInTheDocument();
    expect(
      screen.getByText('You confirm your identity once more before the release.'),
    ).toBeInTheDocument();
    expect(get(breadcrumb).map((crumb) => crumb.label)).toEqual([
      'Test notes',
      'Supplier security questionnaire',
      'Release',
    ]);
  });

  it('reads a new list row by row and field by field, with the name of a person and never the pseudonym', async () => {
    await open('workshop', N4);
    const actions = screen.getByTestId('record-actions');
    expect(actions).toHaveTextContent('Row 1');
    expect(actions).toHaveTextContent('Send the questionnaire to the three largest suppliers');
    await vi.waitFor(() => expect(actions).toHaveTextContent('Jordan Weber'));
    expect(actions).not.toHaveTextContent('p-2b7f10');
    expect(actions).not.toHaveTextContent('1 entry');
  });

  it('compares with the last release, shows the earlier value and names the row of a table', async () => {
    await open('workshop', N5);
    expect(screen.getByText('Changes since v1.')).toBeInTheDocument();
    const summary = screen.getByTestId('record-summary');
    expect(summary.querySelectorAll('del')).toHaveLength(1);
    expect(summary.querySelector('del')).toHaveTextContent('Review who has access');
    expect(summary.querySelector('ins')).toHaveTextContent('the service accounts every half year');
    // The change of one field of a row stands under the table, with the row and the field.
    expect(screen.getByTestId('record-actions')).toHaveTextContent('Row 2, Done');
    expect(screen.getByTestId('record-actions').querySelector('del')).toHaveTextContent('No');
    expect(screen.getByTestId('record-actions').querySelector('ins')).toHaveTextContent('Yes');
    // The request of the agent is read before the release.
    expect(screen.getByTestId('release-request')).toHaveTextContent('Jordan Weber asked');
    expect(screen.getByTestId('release-request')).toHaveTextContent(
      'Reviewed with the team; ready to release.',
    );
  });

  it('says that nothing changed when the diff is empty, and draws a field the schema dropped as it is', async () => {
    await open('workshop', N5, 'en', {
      'GET /api/v1/documents/test-notes/01JZ8V8D0F2H4K6N8Q0S2W4Y6A/diff': {
        repository: REPOSITORY,
        id: N5,
        from: 'notes/01JZ8V8D0F2H4K6N8Q0S2W4Y6A/v1',
        to: 'working',
        sections: [
          {
            part: 'data',
            changes: [{ pointer: '/dropped', before: 'old', after: { a: 1, b: [1, 2] } }],
          },
        ],
      },
    });
    expect(screen.getByTestId('record-dropped')).toHaveTextContent('old');
    expect(screen.getByTestId('record-dropped')).toHaveTextContent('2 fields');
  });

  it('reads a row that is gone field by field, and a row with more than plain fields in one line', async () => {
    await open('workshop', N5, 'en', {
      'GET /api/v1/documents/test-notes/01JZ8V8D0F2H4K6N8Q0S2W4Y6A/diff': {
        repository: REPOSITORY,
        id: N5,
        from: 'notes/01JZ8V8D0F2H4K6N8Q0S2W4Y6A/v1',
        to: 'working',
        sections: [
          {
            part: 'data',
            changes: [
              {
                pointer: '/actions/0',
                before: { what: 'Old task', who: 'p-2b7f10', due: '2026-12-05', done: false },
                after: null,
              },
              {
                pointer: '/actions/1',
                before: { what: 'Other task', extra: { nested: true } },
                after: null,
              },
            ],
          },
        ],
      },
    });
    const actions = screen.getByTestId('record-actions');
    expect(actions).toHaveTextContent('Row 1');
    expect(actions).toHaveTextContent('Old task');
    await vi.waitFor(() => expect(actions).toHaveTextContent('Jordan Weber'));
    expect(actions).not.toHaveTextContent('p-2b7f10');
    // A row with a member the schema does not read is told in one line, as before.
    expect(actions).toHaveTextContent('2 fields');
  });

  it('says so when nothing changed since the last release', async () => {
    await open('workshop', N5, 'en', {
      'GET /api/v1/documents/test-notes/01JZ8V8D0F2H4K6N8Q0S2W4Y6A/diff': {
        repository: REPOSITORY,
        id: N5,
        from: 'notes/01JZ8V8D0F2H4K6N8Q0S2W4Y6A/v1',
        to: 'working',
        sections: [],
      },
    });
    expect(screen.getByText('Nothing changed since v1.')).toBeInTheDocument();
  });

  it('offers the way back to the document, which writes nothing', async () => {
    const kit = await open('workshop', N4);
    expect(screen.getByTestId('release-back')).toHaveAttribute(
      'href',
      `/categories/test-note/${N4}`,
    );
    expect(screen.getByTestId('release-back')).toHaveTextContent('Back to the document');
    expect(kit.requests.filter((request) => request.startsWith('POST'))).toEqual([]);
  });

  it('is read in German with the words of the domain only', async () => {
    await open('workshop', N4, 'de');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Supplier security questionnaire freigeben',
    );
    expect(screen.getByTestId('release-act')).toHaveTextContent(/^Freigeben$/);
    expect(screen.getByText('Alle Pflichtfelder sind ausgefüllt')).toBeInTheDocument();
    expect(
      screen.getByText('Vor der Freigabe bestätigen Sie noch einmal Ihre Identität.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Die erste Freigabe: Alles im Dokument/)).toBeInTheDocument();
    expect(screen.getByTestId('record-pinned')).toHaveTextContent('Nein');
    expect(screen.getByTestId('record-actions')).toHaveTextContent('eine Änderung');
  });

  it('counts the mandatory fields that are empty and lets the server decide', async () => {
    const read = await (
      await fetchRead('workshop', `/api/v1/documents/${REPOSITORY}/${N4}`)
    ).json();
    delete read.parts.data.value.status;
    await open('workshop', N4, 'en', {
      [`GET /api/v1/documents/${REPOSITORY}/${N4}`]: read,
    });
    expect(screen.getByText('One mandatory field is empty')).toBeInTheDocument();
    expect(screen.getByTestId('release-act')).not.toHaveAttribute('aria-disabled');
  });
});

/** @returns the answer of a profile to a request, to change it */
async function fetchRead(profile: string, path: string): Promise<Response> {
  const { scenarioFetch } = await import('../../test/scenarioFetch');
  return scenarioFetch(profile).fetch(path);
}

describe('the release', () => {
  it('steps up with the identity provider first, then presses the seal', async () => {
    const kit = await open('workshop#note-release-step-up', N4);
    const stepUp = vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    await fireEvent.click(screen.getByTestId('release-act'));
    await vi.waitFor(() => expect(stepUp).toHaveBeenCalledWith('/api/v1/auth/login?step-up=mfa'));
    expect(kit.scenario.state()).toBe('note-release-stepped-up');
    expect(screen.queryByTestId('release-done')).toBeNull();
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByTestId('release-done')).toHaveTextContent('Released as v1');
    expect(kit.scenario.state()).toBe('note-release-done');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Supplier security questionnaire is released',
    );
    const seal = screen.getByTestId('release-seal');
    expect(seal).toHaveAttribute('data-sealed', 'v1');
    expect(within(seal).getByRole('img')).toHaveAccessibleName(
      'Seal of the release of Supplier security questionnaire: v1',
    );
    expect(screen.getByText('Released by Alex Example', { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId('release-tag')).toHaveTextContent('notes/');
    expect(screen.getByTestId('release-open')).toHaveAttribute(
      'href',
      `/categories/test-note/${N4}`,
    );
    expect(screen.getByTestId('release-open')).toHaveTextContent('Open the released document');
    expect(screen.queryByTestId('release-act')).toBeNull();
  });

  it('asks a local user for the password, refuses an empty one and releases with it', async () => {
    const kit = await open('workshop#note-release-password', N4);
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(dialog()).toHaveAttribute('open');
    expect(within(dialog()).getByText('Confirm your identity')).toBeInTheDocument();
    expect(
      within(dialog()).getByText('Enter your password to release Supplier security questionnaire.'),
    ).toBeInTheDocument();
    await fireEvent.click(within(dialog()).getByTestId('release-confirm'));
    expect(within(dialog()).getByText('Fill in this field.')).toBeInTheDocument();
    await fireEvent.input(within(dialog()).getByTestId('release-password'), {
      target: { value: 'secret' },
    });
    await fireEvent.click(within(dialog()).getByTestId('release-confirm'));
    expect(await screen.findByTestId('release-done')).toBeInTheDocument();
    expect(kit.bodies).toContainEqual({
      request: `POST /api/v1/releases/${REPOSITORY}/${N4}`,
      body: { password: 'secret' },
    });
    expect(dialog()).not.toHaveAttribute('open');
  });

  it('says when the password is not right and writes nothing', async () => {
    await open('workshop#note-release-wrong-password', N4);
    await fireEvent.click(screen.getByTestId('release-act'));
    await fireEvent.input(within(dialog()).getByTestId('release-password'), {
      target: { value: 'wrong' },
    });
    await fireEvent.click(within(dialog()).getByTestId('release-confirm'));
    expect(
      await within(dialog()).findByText('The password is not right. Nothing was changed.'),
    ).toBeInTheDocument();
    expect(dialog()).toHaveAttribute('open');
    expect(screen.queryByTestId('release-done')).toBeNull();
  });

  it('says that many people are logging in and keeps the review as it was', async () => {
    await open('workshop#note-release-too-many-logins', N4);
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Many people are logging in right now. Try again in a minute.',
    );
    expect(screen.queryByTestId('release-done')).toBeNull();
    expect(screen.getByTestId('release-act')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('release-record')).toBeInTheDocument();
  });

  it('reads the review again when someone saved meanwhile, then releases what was shown', async () => {
    const kit = await open('workshop#note-release-changed', N4);
    expect(screen.getByTestId('record-summary')).toHaveTextContent('in January');
    vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(
      await screen.findByText(
        'Someone saved after you opened the release. Check the changes again.',
      ),
    ).toBeInTheDocument();
    // The diff was read again: that read is the review of the mock.
    await vi.waitFor(() => expect(kit.scenario.state()).toBe('note-release-changed-reviewed'));
    expect(screen.queryByTestId('release-done')).toBeNull();
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByTestId('release-done')).toBeInTheDocument();
    expect(kit.scenario.state()).toBe('note-release-changed-done');
    expect(
      kit.requests.filter((request) => request.includes('/diff')).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('sends one release for two presses, and keeps the act busy while the review is read again', async () => {
    const kit = await open('workshop#note-release-changed', N4);
    vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    const act = screen.getByTestId('release-act');
    await fireEvent.click(act);
    await fireEvent.click(act);
    expect(
      await screen.findByText(/Someone saved after you opened the release/),
    ).toBeInTheDocument();
    // Pressed again before the record is read anew, the act sends nothing: the person has not seen the new changes.
    await fireEvent.click(act);
    await vi.waitFor(() => expect(act).not.toHaveAttribute('aria-busy'));
    expect(
      kit.requests.filter((request) => request.startsWith('POST /api/v1/releases/')),
    ).toHaveLength(1);
  });

  it('lists the mandatory fields the server found empty, by their words', async () => {
    await open('workshop#note-release-incomplete', N4);
    await fireEvent.click(screen.getByTestId('release-act'));
    const notice = await screen.findByText('Some mandatory fields are empty.');
    expect(notice).toBeInTheDocument();
    expect(
      screen.getByText('Fill in Owner, then release again. Nothing was changed.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('release-done')).toBeNull();
  });

  it('shows the document as released when someone released it meanwhile, and writes nothing', async () => {
    // The state reads N4 as released from the start: the first read is the review as it was when it was opened.
    const inReview = (await (
      await fetchRead('workshop', `/api/v1/documents/${REPOSITORY}/${N4}`)
    ).json()) as DocumentRead;
    vi.spyOn(apiClient, 'getDocument').mockResolvedValueOnce(inReview);
    const kit = await open('workshop#note-release-released-meanwhile', N4);
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(
      await screen.findByText(
        'Someone released this document while you were reviewing it. Nothing was changed.',
      ),
    ).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(screen.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true'),
    );
    expect(screen.getByText('This document is released already.')).toBeInTheDocument();
    expect(screen.queryByTestId('release-done')).toBeNull();
    expect(kit.requests.filter((request) => request.startsWith('POST'))).toHaveLength(1);
  });

  it('tells a release the Git server refused and one it cannot reach', async () => {
    await open('workshop#note-rejected', N4);
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Git server refused the change.',
    );
    resetKit();
    document.body.innerHTML = '';
    await open('workshop#note-git-unavailable', N4);
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByRole('alert')).toHaveTextContent('The Git server cannot be reached.');
    expect(screen.queryByTestId('release-done')).toBeNull();
  });

  it('shows any other failure as a notice and keeps the review', async () => {
    await open('workshop', N4);
    vi.spyOn(apiClient, 'release').mockRejectedValueOnce(new TypeError('boom'));
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    vi.spyOn(apiClient, 'release').mockRejectedValueOnce(new ApiError('FORBIDDEN', 403));
    await fireEvent.click(screen.getByTestId('release-act'));
    await vi.waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('You have no right for this action.'),
    );
  });

  it('releases the document of a request and the release goes to the repository of its type', async () => {
    const kit = await open('workshop#note-release-request', N5);
    vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByTestId('release-done')).toHaveTextContent('Released as v2');
    expect(kit.requests).toContain(`POST /api/v1/releases/${REPOSITORY}/${N5}`);
  });
});

describe('when the release cannot be taken', () => {
  it('says why without the approve right, and sends nothing', async () => {
    const kit = await open('read-only', N4);
    const act = screen.getByTestId('release-act');
    expect(act).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Releasing needs the approve right.')).toBeInTheDocument();
    // The margin states the facts of the review and promises no release that cannot be taken.
    expect(screen.getByText('Every mandatory field is filled in')).toBeInTheDocument();
    expect(screen.queryByText('The release is signed in your name and tagged.')).toBeNull();
    expect(
      screen.queryByText('You confirm your identity once more before the release.'),
    ).toBeNull();
    await fireEvent.click(act);
    expect(kit.requests.filter((request) => request.startsWith('POST'))).toEqual([]);
  });

  it('asks for the submit first for a draft, and says that a released document is released already', async () => {
    await open('workshop', N2);
    expect(screen.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Submit the document for review first.')).toBeInTheDocument();
    expect(screen.getByTestId('release-request')).toHaveTextContent('Alex Example asked');
    resetKit();
    document.body.innerHTML = '';
    await open('workshop', N1);
    expect(screen.getByText('This document is released already.')).toBeInTheDocument();
  });

  it('lets the workflow decide: a release it offers from a draft, and none it does not offer in review', async () => {
    const read = async (id: string): Promise<DocumentRead> =>
      (await (
        await scenarioFetch('workshop').fetch(`/api/v1/documents/${REPOSITORY}/${id}`)
      ).json()) as DocumentRead;
    const offered = await read(N2);
    offered.transitions = [
      { id: 'release', to: 'released', right: 'approve', stepUp: false, release: true },
    ];
    await open('workshop', N2, 'en', { [`GET /api/v1/documents/${REPOSITORY}/${N2}`]: offered });
    expect(screen.getByTestId('release-act')).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByText('Submit the document for review first.')).toBeNull();
    resetKit();
    document.body.innerHTML = '';
    const withheld = await read(N4);
    withheld.transitions = [];
    await open('workshop', N4, 'en', { [`GET /api/v1/documents/${REPOSITORY}/${N4}`]: withheld });
    expect(screen.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText('This document cannot be released in its current state.'),
    ).toBeInTheDocument();
  });

  it('offers no release for a category that is switched off, which stays readable', async () => {
    const kit = await open('workshop', N4, 'en', {
      'GET /api/v1/categories': {
        categories: [
          {
            id: 'test-note',
            generic: true,
            enabled: false,
            kinds: [{ id: 'note', repository: REPOSITORY }],
          },
        ],
      },
    });
    expect(screen.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText('This category is switched off. Its documents can be read only.'),
    ).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(kit.requests.filter((request) => request.startsWith('POST'))).toEqual([]);
  });
});

describe('addresses that are no release', () => {
  it('is the not-found view for a category that is not generic or unknown', async () => {
    await useProfile('workshop');
    render(DocumentReleaseView, { params: { category: 'samm', document: N4 } });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
    expect(get(breadcrumb)).toEqual([]);
  });

  it('is the not-found view for a document that does not exist', async () => {
    await useProfile('workshop');
    render(DocumentReleaseView, {
      params: { category: 'test-note', document: '01JZZZZZZZZZZZZZZZZZZZZZZZ' },
    });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('is the not-found view for a document type whose schema the server does not serve', async () => {
    await useProfile('workshop', 'en', {
      'GET /api/v1/categories/test-note/schema': { category: 'test-note', kinds: [] },
    });
    render(DocumentReleaseView, { params: { category: 'test-note', document: N4 } });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('shows a failure to read as a notice', async () => {
    await useProfile('workshop', 'en', {
      [`GET /api/v1/documents/${REPOSITORY}/${N4}/diff`]: new Response(
        JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }),
        { status: 503 },
      ),
    });
    render(DocumentReleaseView, { params: { category: 'test-note', document: N4 } });
    expect(await screen.findByRole('alert')).toHaveTextContent('The Git server cannot be reached.');
  });

  it('shows a failure to read the categories as a notice', async () => {
    await useProfile('workshop', 'en', {
      'GET /api/v1/categories': new Response('{}', { status: 500 }),
    });
    render(DocumentReleaseView, { params: { category: 'test-note', document: N4 } });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
