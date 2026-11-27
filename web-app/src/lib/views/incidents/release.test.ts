import { fireEvent, render, screen, within } from '@testing-library/svelte';
import fs from 'node:fs';
import path from 'node:path';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { ApiError } from '../../api/errors';
import { SCENARIO_DIR } from '../../test/scenarioFetch';
import { session, status } from '../../stores/app';
import { breadcrumb } from '../../stores/breadcrumb';
import { resetKit, useProfile, type Kit } from '../documents/testkit';
import IncidentReleaseView from './IncidentReleaseView.svelte';

/**
 * The review and release of an incident (UC-IR-3, AUN-WEB-6) against the `incident-*` states of the profile `workshop`
 * (AUN-TEST-1): the changes by stage, the deadlines still open before the release, the release by its way of confirming,
 * every refusal with its text, the seal and the stopped clock, and the addresses that are no release.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
});

afterEach(resetKit);

const STUFFING = '01JZ9V7P9S1T3W5Y7A9C1E3G5J';
const READ = `GET /api/v1/incidents/2026/${STUFFING}`;
const PARAMS = { year: '2026', incident: STUFFING };

/**
 * @param profile `name` or `name#state`
 * @param lang the language
 * @param params the address of the release
 * @param answers answers that replace the profile's own
 * @returns the kit with the review open
 */
async function open(
  profile: string,
  lang: 'en' | 'de' = 'en',
  params: Record<string, string> = PARAMS,
  answers: Record<string, unknown> = {},
): Promise<Kit> {
  const kit = await useProfile(profile, lang, answers);
  status.set(await apiClient.getStatus());
  render(IncidentReleaseView, { params });
  await screen.findByTestId('release-record');
  return kit;
}

/** @returns the incident in review, with the deadlines of the test in place of its own (it has none) */
function inReviewWith(deadlines: unknown[]): Record<string, unknown> {
  const file = path.join(SCENARIO_DIR, 'data', 'incident-credential-stuffing-in-review.json');
  return { ...JSON.parse(fs.readFileSync(file, 'utf8')), deadlines };
}

/** An open deadline, and one that is missed and was never sent. */
const DUE = [
  {
    rule: 'nis2-early-warning',
    element: null,
    startedAt: '2026-11-26T08:30:00Z',
    due: '2026-11-27T08:30:00Z',
    status: 'OPEN',
    sentAt: null,
    metBy: '/notifications/nis2-early-warning',
  },
  {
    rule: 'gdpr-art33',
    element: null,
    startedAt: '2026-11-22T08:30:00Z',
    due: '2026-11-25T08:30:00Z',
    status: 'MISSED',
    sentAt: null,
    metBy: '/notifications/supervisory-authority',
  },
  {
    rule: 'nis2-notification',
    element: null,
    startedAt: '2026-11-20T08:30:00Z',
    due: '2026-11-21T08:30:00Z',
    status: 'MISSED',
    sentAt: '2026-11-22T10:20:00Z',
    metBy: '/notifications/nis2-notification',
  },
];

describe('the review', () => {
  it('shows what is released: the incident, its facts, the changes by stage and the checks', async () => {
    await open('workshop#incident-submitted');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Release Credential stuffing against the login form',
    );
    expect(screen.getByTestId('release-act')).toHaveTextContent(/^Release$/);
    const facts = screen.getByTestId('release-facts');
    expect(facts).toHaveTextContent('Credential stuffing against the login form');
    expect(facts).toHaveTextContent('3 of 3 completed');
    expect(facts).toHaveTextContent('No deadline applies');
    expect(screen.getByText(/The first release/)).toBeInTheDocument();
    expect(get(breadcrumb).map((crumb) => crumb.label)).toEqual([
      'Incidents of 2026',
      'Credential stuffing against the login form',
      'Release',
    ]);
  });

  it('groups the changes by stage, one group for the title and one for each stage that applies', async () => {
    await open('workshop#incident-submitted');
    const record = screen.getByTestId('release-record');
    const titles = Array.from(record.querySelectorAll('.record__name')).map(
      (element) => element.textContent,
    );
    expect(titles).toEqual(['Title', 'Triage', 'Response', 'Review']);
    expect(screen.getByTestId('record-data')).toHaveTextContent('Credential stuffing');
    // The stages that do not apply are not in the record.
    expect(screen.queryByTestId('record-privacy-assessment')).toBeNull();
    expect(screen.queryByTestId('record-notifications')).toBeNull();
  });

  it('reads a field as the form reads it: the words of the field and of its value, never a code', async () => {
    await open('workshop#incident-submitted');
    const triage = screen.getByTestId('record-triage');
    expect(triage).toHaveTextContent('Severity');
    expect(triage).toHaveTextContent('Medium');
    expect(triage).toHaveTextContent('Became aware at');
    expect(triage).not.toHaveTextContent('p-4c1a9e');
    expect(triage.querySelectorAll('del')).toHaveLength(0);
  });

  it('reads a list of plain values value by value, with no row number that says nothing', async () => {
    await open('workshop#incident-submitted');
    const triage = screen.getByTestId('record-triage');
    expect(triage).toHaveTextContent('Security incident');
    expect(triage).toHaveTextContent('SEC-2188');
    expect(triage).not.toHaveTextContent('Row 1');
    // A list of rows that hold fields is still read row by row.
    expect(screen.getByTestId('record-response')).toHaveTextContent('Row 1');
  });

  it('reads a row that holds a list field by field: the role by its name, the issues one by one', async () => {
    await open('workshop#incident-submitted');
    const response = screen.getByTestId('record-response');
    await vi.waitFor(() => expect(response).not.toHaveTextContent('role:developer'));
    expect(response).toHaveTextContent('Role');
    expect(response).toHaveTextContent('Tickets');
    expect(response).toHaveTextContent('ID-901');
    expect(response).not.toHaveTextContent('entries');
  });

  it('reads the same row in German with the German name of the role', async () => {
    await open('workshop#incident-submitted', 'de');
    const response = screen.getByTestId('record-response');
    await vi.waitFor(() => expect(response).not.toHaveTextContent('role:developer'));
    expect(response).toHaveTextContent('Rolle');
  });

  it('reads the sign-off of a stage as the person and the time, not the pseudonym', async () => {
    await open('workshop#incident-submitted');
    const triage = screen.getByTestId('record-triage');
    const signed = within(triage).getByTestId('release-completion');
    expect(signed).toHaveTextContent('Alex Example');
    expect(triage).toHaveTextContent('Stage signed off');
  });

  it('checks the stages and who submitted the incident before the release', async () => {
    await open('workshop#incident-submitted');
    expect(screen.getByText('Every stage that applies is completed')).toBeInTheDocument();
    expect(screen.getByText(/Submitted for review by Alex Example/)).toBeInTheDocument();
    expect(
      screen.getByText('You confirm your identity once more before the release.'),
    ).toBeInTheDocument();
    expect(screen.getByText('The release is signed in your name and tagged.')).toBeInTheDocument();
    expect(screen.queryByTestId('release-deadlines')).toBeNull();
  });

  it('offers the way back to the incident, which writes nothing', async () => {
    const kit = await open('workshop#incident-submitted');
    expect(screen.getByTestId('release-back')).toHaveAttribute(
      'href',
      `/incidents/2026/${STUFFING}`,
    );
    expect(kit.requests.filter((request) => request.startsWith('POST'))).toHaveLength(0);
  });

  it('is read in German with the words of the domain only', async () => {
    await open('workshop#incident-submitted', 'de');
    expect(screen.getByTestId('release-act')).toHaveTextContent(/^Freigeben$/);
    expect(screen.getByTestId('record-triage')).toHaveTextContent('Ersteinschätzung');
    expect(screen.getByTestId('record-triage')).toHaveTextContent('Schweregrad');
    expect(screen.getByTestId('record-review')).toHaveTextContent('Phase bestätigt');
    expect(screen.getByText('Jede Phase, die gilt, ist abgeschlossen')).toBeInTheDocument();
    expect(screen.getByTestId('release-back')).toHaveTextContent('Zurück zum Vorfall');
  });
});

describe('the deadlines that are still open', () => {
  it('lists them before the release, with the reminder that the incident is frozen afterwards', async () => {
    await open('workshop#incident-submitted', 'en', PARAMS, { [READ]: inReviewWith(DUE) });
    const clock = screen.getByTestId('release-deadlines');
    // The open one and the one missed and never sent are a duty; the one sent late is a fact.
    expect(within(clock).getAllByRole('listitem')).toHaveLength(2);
    expect(clock).toHaveTextContent('NIS2 early warning');
    expect(clock).toHaveTextContent('Due in 23 hours');
    expect(clock).toHaveTextContent('Overdue by 26 hours');
    expect(clock).not.toHaveTextContent('Sent');
    expect(screen.getByText(/can no longer be recorded afterwards/)).toBeInTheDocument();
    expect(screen.getByText('2 deadlines are still open')).toBeInTheDocument();
    expect(screen.getByTestId('release-record-notice')).toHaveAttribute(
      'href',
      `/incidents/2026/${STUFFING}?stage=notifications`,
    );
  });

  it('does not refuse the release for an open deadline: the act stays available', async () => {
    await open('workshop#incident-submitted', 'en', PARAMS, { [READ]: inReviewWith(DUE) });
    expect(screen.getByTestId('release-act')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('says that no deadline is open when every one is met or sent', async () => {
    await open('workshop#incident-submitted', 'en', PARAMS, {
      [READ]: inReviewWith([DUE[2]]),
    });
    expect(screen.queryByTestId('release-deadlines')).toBeNull();
    expect(screen.getByText('No deadline is open')).toBeInTheDocument();
  });

  it('stops the clock with the release and keeps the open deadlines in the record of it', async () => {
    await open('workshop#incident-submitted', 'en', PARAMS, { [READ]: inReviewWith(DUE) });
    vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    vi.spyOn(apiClient, 'release').mockResolvedValue({
      outcome: 'RELEASED',
      tag: `incidents/${STUFFING}/v1`,
      at: '2026-11-26T10:05:00Z',
    });
    await fireEvent.click(screen.getByTestId('release-act'));
    await screen.findByTestId('release-done');
    expect(screen.getByTestId('release-clock-stopped')).toHaveTextContent(
      'The clock stopped at Nov 26, 2026',
    );
    expect(screen.queryByTestId('release-record-notice')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Deadlines at the release' })).toBeInTheDocument();
    // Told against the release, not against the page.
    expect(screen.getByTestId('release-deadlines')).toHaveTextContent('Due in 22 hours');
    // The notary stands beside the seal of a release; never where a deadline is open.
    expect(document.querySelector('.mascot')).toBeNull();
  });
});

describe('the release', () => {
  it('steps up with the identity provider first, then presses the seal', async () => {
    const kit = await open('workshop#incident-release-step-up');
    const stepUp = vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    await fireEvent.click(screen.getByTestId('release-act'));
    await vi.waitFor(() => expect(stepUp).toHaveBeenCalled());
    expect(kit.scenario.state()).toBe('incident-release-stepped-up');
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByTestId('release-done')).toHaveTextContent('Released as v1');
    expect(kit.scenario.state()).toBe('incident-released');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Credential stuffing against the login form is released',
    );
    const seal = screen.getByTestId('release-seal');
    expect(seal).toHaveAttribute('data-sealed', 'v1');
    expect(within(seal).getByRole('img')).toHaveAccessibleName(
      'Seal of the release of Credential stuffing against the login form: v1',
    );
    expect(screen.getByTestId('release-tag')).toHaveTextContent(`incidents/${STUFFING}/v1`);
    expect(screen.getByTestId('release-open')).toHaveAttribute(
      'href',
      `/incidents/2026/${STUFFING}`,
    );
    expect(screen.queryByTestId('release-act')).toBeNull();
    expect(screen.queryByTestId('release-deadlines')).toBeNull();
  });

  it('releases with a password for a local user, who is asked before the request is sent', async () => {
    await open('workshop#incident-submitted');
    status.update((held) => (held ? { ...held, stepUp: 'password' } : held));
    const release = vi.spyOn(apiClient, 'release').mockResolvedValue({
      outcome: 'RELEASED',
      tag: `incidents/${STUFFING}/v1`,
      at: '2026-11-26T10:05:00Z',
    });
    await fireEvent.click(screen.getByTestId('release-act'));
    const field = await screen.findByTestId('release-password');
    expect(
      screen.getByText(
        'Enter your password to release Credential stuffing against the login form.',
      ),
    ).toBeInTheDocument();
    await fireEvent.input(field, { target: { value: 'secret' } });
    await fireEvent.click(screen.getByTestId('release-confirm'));
    expect(await screen.findByTestId('release-done')).toBeInTheDocument();
    expect(release).toHaveBeenCalledWith('isms-incidents-2026', STUFFING, 'secret');
  });

  it('reads the review again when someone saved meanwhile, then releases what was shown', async () => {
    const kit = await open('workshop#incident-release-changed');
    vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(
      await screen.findByText(
        'Someone saved after you opened the release. Check the changes again.',
      ),
    ).toBeInTheDocument();
    await vi.waitFor(() => expect(kit.scenario.state()).toBe('incident-release-changed-reviewed'));
    expect(screen.queryByTestId('release-done')).toBeNull();
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByTestId('release-done')).toBeInTheDocument();
  });

  it('shows that someone released the incident meanwhile, and writes nothing more', async () => {
    const kit = await open('workshop#incident-submitted');
    vi.spyOn(apiClient, 'release').mockRejectedValueOnce(
      new ApiError('DOCUMENT_RELEASED', 409, [], { tag: `incidents/${STUFFING}/v1` }),
    );
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(
      await screen.findByText(
        'Someone released this document while you were reviewing it. Nothing was changed.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('release-done')).toBeNull();
    await vi.waitFor(() =>
      expect(kit.requests.filter((request) => request === READ).length).toBeGreaterThanOrEqual(2),
    );
  });

  it('tells a release the Git server cannot take, and keeps the review', async () => {
    await open('workshop#incident-submitted');
    vi.spyOn(apiClient, 'release').mockRejectedValueOnce(new ApiError('GIT_UNAVAILABLE', 503));
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Git server cannot be reached. Nothing was released; release again later.',
    );
    expect(screen.getByTestId('release-record')).toBeInTheDocument();
  });

  it('names the stages to complete as links to their tabs when the server refuses with STAGES_OPEN', async () => {
    const kit = await open('workshop#incident-submitted');
    vi.spyOn(apiClient, 'release').mockRejectedValueOnce(
      new ApiError('STAGES_OPEN', 422, [], {
        stages: [
          { stage: 'response', missing: [] },
          { stage: 'review', missing: ['/review/root-causes', '/review/lessons'] },
        ],
      }),
    );
    await fireEvent.click(screen.getByTestId('release-act'));
    const refusal = await screen.findByTestId('release-refusal');
    expect(refusal).toHaveTextContent('The incident cannot be released yet');
    expect(refusal).toHaveTextContent('Nothing was released.');
    expect(screen.getByTestId('release-refusal-response')).toHaveAttribute(
      'href',
      `/incidents/2026/${STUFFING}?stage=response`,
    );
    expect(screen.getByTestId('release-refusal-review')).toHaveTextContent('Open Review');
    expect(screen.getByTestId('release-refusal-review')).toHaveAttribute(
      'href',
      `/incidents/2026/${STUFFING}?stage=review`,
    );
    expect(screen.queryByTestId('release-done')).toBeNull();
    // What the person reviews may have changed with the stages: the incident is read again.
    await vi.waitFor(() =>
      expect(kit.requests.filter((request) => request === READ).length).toBeGreaterThanOrEqual(2),
    );
  });

  it('tells the stage that was reopened meanwhile (the state of the mock) and offers the way to its tab', async () => {
    const kit = await open('workshop#incident-release-stages-open');
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByTestId('release-refusal')).toHaveTextContent(
      'The incident cannot be released yet',
    );
    expect(screen.getByTestId('release-refusal-review')).toHaveAttribute(
      'href',
      `/incidents/2026/${STUFFING}?stage=review`,
    );
    expect(kit.scenario.state()).toBe('incident-release-stages-open');
    expect(screen.queryByTestId('release-done')).toBeNull();
  });

  it('lists the mandatory fields the server found empty, by their words', async () => {
    await open('workshop#incident-submitted');
    vi.spyOn(apiClient, 'release').mockRejectedValueOnce(
      new ApiError('MANDATORY_FIELDS_MISSING', 422, [], {
        missing: ['/triage/severity', '/data/title'],
      }),
    );
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(
      await screen.findByText('Fill in Severity, Title, then release again. Nothing was changed.'),
    ).toBeInTheDocument();
  });
});

describe('when the release cannot be taken', () => {
  it('says why without the approve right, and sends nothing', async () => {
    const kit = await useProfile('workshop#incident-submitted');
    status.set(await apiClient.getStatus());
    session.update((held) =>
      held
        ? {
            ...held,
            rights: held.rights.map((right) =>
              right.repository === 'isms-incidents-2026'
                ? { ...right, actions: ['read', 'edit'] }
                : right,
            ),
          }
        : held,
    );
    render(IncidentReleaseView, { params: PARAMS });
    await screen.findByTestId('release-record');
    expect(screen.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Releasing needs the approve right.')).toBeInTheDocument();
    expect(screen.queryByText('The release is signed in your name and tagged.')).toBeNull();
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(kit.requests.filter((request) => request.startsWith('POST'))).toHaveLength(0);
  });

  it('asks for the submit first for a draft', async () => {
    await open('workshop');
    expect(screen.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Submit the document for review first.')).toBeInTheDocument();
  });

  it('says that a released incident is released already, and shows its stopped clock', async () => {
    await open('workshop#incident-released');
    expect(screen.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('This document is released already.')).toBeInTheDocument();
    expect(screen.getByText(/Nothing changed since v1/)).toBeInTheDocument();
    expect(screen.queryByText('The release is signed in your name and tagged.')).toBeNull();
  });

  it('shows the clock of a released incident as stopped, never running', async () => {
    await open('workshop#incident-released', 'en', PARAMS, {
      [READ]: {
        ...inReviewWith(DUE),
        state: 'released',
        frozen: true,
        transitions: [],
        asOf: '2026-11-26T10:05:00Z',
        release: {
          tag: `incidents/${STUFFING}/v1`,
          at: '2026-11-26T10:05:00Z',
          by: { pseudonym: 'p-noor', name: 'Noor Haddad' },
        },
      },
    });
    expect(screen.getByTestId('release-clock-stopped')).toBeInTheDocument();
    expect(screen.queryByTestId('release-record-notice')).toBeNull();
  });
});

describe('addresses that are no release', () => {
  it('is the not-found view for an incident that does not exist', async () => {
    await useProfile('workshop');
    render(IncidentReleaseView, { params: { year: '2026', incident: 'nope' } });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('is the not-found view when the year has no repository', async () => {
    await useProfile('workshop#incident-year-missing');
    render(IncidentReleaseView, { params: PARAMS });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('shows a failure to read as a notice', async () => {
    await useProfile('workshop', 'en', {
      [READ]: new Response('{}', { status: 503 }),
    });
    render(IncidentReleaseView, { params: PARAMS });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // An error is no loading: the page does not read "Release Loading…".
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Release$/);
    expect(screen.queryByText('Loading…')).toBeNull();
  });
});
