import { fireEvent, render, screen, within } from '@testing-library/svelte';
import fs from 'node:fs';
import path from 'node:path';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { DRAFT_DELAY_MS } from '../../documents/controller.svelte';
import { status } from '../../stores/app';
import { SCENARIO_DIR } from '../../test/scenarioFetch';
import { resetKit, useProfile, type Kit } from '../documents/testkit';
import IncidentsView from './IncidentsView.svelte';

/**
 * Working on an incident against the states of the profile `workshop` (AUN-TEST-1): the head, the clock, the tabs of the
 * stages, the form of a stage, the save of every part, the completion and the reopening of a stage with every refusal, the
 * step-up of the review, the submit, the report and the live refresh.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
});

afterEach(() => {
  resetKit();
  status.set(null);
});

const CARD = '01JZ9T4M6Q8S0V2X4B6D8F0H2K';
const STUFFING = '01JZ9V7P9S1T3W5Y7A9C1E3G5J';
const PHISHING = '01JZA2B4D6F8H0K2N4Q6S8V0X2';
const OUTAGE = '01JZ8M3N5P7R9T1V3X5Z7B9D1F';
const ARCHIVE = '01JZ8K1M3P5R7T9V1X3Z5B7D9F';
const WRONG = '01JZ6Q8S0V2X4B6D8F0H2K4M6P';
const SUSPICIOUS = '01JZA6D8F0H2K4M6P8R0T2W4Y6';

const SAVE = (id: string) => `POST /api/v1/documents/isms-incidents-2026/${id}/save`;
const COMPLETE = (id: string, stage: string) =>
  `POST /api/v1/documents/isms-incidents-2026/${id}/stages/${stage}/complete`;

/**
 * @param profile `name` or `name#state`
 * @param id the incident
 * @param query the admitted query of the address
 * @param lang the language
 * @param year the year of the incident
 * @returns the kit and the navigation spy, with the sheet open
 */
async function open(
  profile: string,
  id: string,
  query: Record<string, string> = {},
  lang: 'en' | 'de' = 'en',
  year = '2026',
): Promise<
  Kit & {
    onnavigate: ReturnType<typeof vi.fn>;
    show: (stage: string) => Promise<void>;
  }
> {
  const kit = await useProfile(profile, lang);
  status.set(await apiClient.getStatus());
  const onnavigate = vi.fn();
  const props = { route: 'incidents.incident', params: { year, incident: id }, onnavigate };
  const { rerender } = render(IncidentsView, { ...props, query });
  await screen.findByTestId('incident-sheet');
  await screen.findByTestId('stage-panel');
  return {
    ...kit,
    onnavigate,
    /** Lets the address follow the choice of a tab, as the router does after the navigation. */
    show: (stage: string) => rerender({ ...props, query: { stage } }),
  };
}

/** @returns the body of the request the page sent, `null` for none */
function bodyOf(kit: Kit, request: string): Record<string, unknown> | null {
  return (
    (kit.bodies.find((entry) => entry.request === request)?.body as Record<string, unknown>) ?? null
  );
}

/** @returns the stage the panel shows */
function shownStage(): string | null {
  return screen.getByTestId('stage-panel').getAttribute('data-stage');
}

/** @returns the tab of a stage */
function tab(stage: string): HTMLElement {
  return screen.getByTestId(`stage-tabs-${stage}`);
}

/** Chooses a tab the way the person does and lets the address follow, as the view does after the navigation. */
async function goTo(stage: string, kit: { onnavigate: ReturnType<typeof vi.fn> }) {
  await fireEvent.click(tab(stage));
  expect(kit.onnavigate).toHaveBeenLastCalledWith(expect.stringContaining(`stage=${stage}`), {
    replace: true,
  });
}

describe('the head and the tabs', () => {
  it('shows the title, the state, the facts and the five stages with their status in words', async () => {
    await open('workshop', CARD);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Card data exposed in the checkout log',
    );
    expect(screen.getByTestId('document-state')).toHaveTextContent('Draft');
    expect(screen.getByTestId('incident-sheet')).toHaveTextContent('Became aware');
    const tabs = within(
      screen.getByRole('tablist', { name: 'Stages of the incident' }),
    ).getAllByRole('tab');
    expect(tabs.map((entry) => entry.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Triage Completed',
      'Privacy assessment Open',
      'Response Open',
      'Notifications Open',
      'Review Open',
    ]);
  });

  it('opens the first stage that is open and not waiting, and the stage the address names', async () => {
    await open('workshop', CARD);
    expect(shownStage()).toBe('privacy-assessment');
    expect(tab('privacy-assessment')).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the tab of the address', async () => {
    await open('workshop', CARD, { stage: 'notifications' });
    expect(shownStage()).toBe('notifications');
  });

  it('opens the default stage for an address that names no stage of the incident', async () => {
    await open('workshop', CARD, { stage: 'nope' });
    expect(shownStage()).toBe('privacy-assessment');
  });

  it('asks the address to follow when the person chooses another tab, without a new place in the history', async () => {
    const kit = await open('workshop', CARD);
    await goTo('review', kit);
    expect(kit.onnavigate).toHaveBeenLastCalledWith(`/incidents/2026/${CARD}?stage=review`, {
      replace: true,
    });
  });

  it('greys a stage that does not apply, with the condition, and keeps its form', async () => {
    await open('workshop', SUSPICIOUS);
    const greyed = tab('privacy-assessment');
    expect(greyed).toHaveAttribute('data-status', 'not-applicable');
    expect(greyed).toHaveTextContent('Not answered yet: applies when personal data is affected');
    await fireEvent.click(greyed);
  });

  it('shows the note of a stage that does not apply in its panel, and offers no act on it', async () => {
    await open('workshop', SUSPICIOUS, { stage: 'privacy-assessment' });
    expect(screen.getByTestId('stage-not-applicable')).toHaveTextContent(
      'Not answered yet: applies when personal data is affected',
    );
    expect(screen.getByTestId('stage-not-applicable')).toHaveTextContent(
      'What was entered here stays in the record.',
    );
    expect(screen.queryByTestId('stage-bar')).toBeNull();
  });

  it('marks a stage that was signed off before an earlier stage was reopened', async () => {
    await open('workshop', WRONG, { stage: 'response' });
    expect(tab('response')).toHaveTextContent('Signed off before an earlier stage was reopened');
    expect(screen.getByTestId('stage-predecessor-reopened')).toHaveTextContent(
      'Signed off before an earlier stage was reopened',
    );
    expect(tab('triage')).toHaveTextContent('Open');
  });

  it('names who completed a stage, and when', async () => {
    await open('workshop', CARD, { stage: 'triage' });
    expect(screen.getByTestId('stage-completion')).toHaveTextContent('Completed by Alex Example');
  });

  it('shows the derived protection needs of the triage with the service that decides each', async () => {
    await open('workshop', CARD, { stage: 'triage' });
    const needs = await screen.findByTestId('protection-needs');
    expect(within(needs).getByTestId('protection-confidentiality')).toHaveTextContent('Very high');
    expect(within(needs).getByTestId('protection-availability')).toHaveTextContent('High');
    await vi.waitFor(() =>
      expect(within(needs).getByTestId('protection-confidentiality')).toHaveTextContent(
        'decided by Payment API',
      ),
    );
  });

  it('says that no protection need is derived without an affected service, on an incident without one', async () => {
    await useProfile('workshop');
    render(IncidentsView, {
      route: 'incidents.incident',
      params: { year: '2026', incident: SUSPICIOUS },
      query: { stage: 'triage' },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('protection-needs')).toBeInTheDocument();
  });
});

describe('the deadline clock', () => {
  it('lists every deadline with its state: a missed one, one sent late, one met, one open', async () => {
    await open('workshop', CARD);
    const clock = screen.getByTestId('deadline-clock');
    expect(within(clock).getAllByRole('listitem')).toHaveLength(4);
    const missed = screen.getByTestId('deadline-clock-gdpr-art33-');
    expect(missed).toHaveAttribute('data-status', 'MISSED');
    expect(missed).toHaveTextContent('Notice to the supervisory authority');
    expect(missed).toHaveTextContent('GDPR Art. 33: 72 hours after becoming aware');
    expect(missed).toHaveTextContent('Overdue by 4 days');
    const late = screen.getByTestId('deadline-clock-nis2-notification-');
    expect(late).toHaveAttribute('data-status', 'MISSED');
    expect(late).toHaveTextContent('3 hours late');
    expect(screen.getByTestId('deadline-clock-nis2-early-warning-')).toHaveTextContent('Met');
    const open_ = screen.getByTestId('deadline-clock-nis2-final-report-');
    expect(open_).toHaveAttribute('data-status', 'OPEN');
    expect(open_).toHaveTextContent('Due in 26 days');
  });

  it('draws only a deadline that needs the person as a box', async () => {
    await open('workshop', CARD);
    expect(
      screen.getByTestId('deadline-clock-gdpr-art33-').querySelector('.reason'),
    ).not.toBeNull();
    expect(
      screen.getByTestId('deadline-clock-nis2-notification-').querySelector('.reason'),
    ).toBeNull();
  });

  it('says that no deadline applies, for an incident that has none', async () => {
    await open('workshop', STUFFING);
    expect(screen.getByTestId('clock-none')).toHaveTextContent('No notification deadline applies.');
    expect(screen.queryByTestId('deadline-clock')).toBeNull();
  });

  it('asks the questions the deadlines follow from while they are not answered', async () => {
    await open('workshop', SUSPICIOUS);
    expect(screen.getByTestId('clock-none')).toHaveTextContent(
      'Answer the questions about personal data and NIS2',
    );
  });

  it('keeps an open deadline without a date as one whose clock has not started', async () => {
    await open('workshop', ARCHIVE);
    const row = screen.getByTestId('deadline-clock-nis2-final-report-after-handling-');
    expect(row).toHaveAttribute('data-status', 'OPEN');
    expect(row).toHaveTextContent('The clock starts when the time it depends on is recorded.');
    expect(row.querySelector('time')).toBeNull();
    // The final report was met by the progress report.
    expect(screen.getByTestId('deadline-clock-nis2-final-report-')).toHaveTextContent('Met');
  });

  it('stops the clock of a released incident at its release and says so', async () => {
    await open('workshop', OUTAGE);
    expect(screen.getByTestId('clock-stopped')).toHaveTextContent('The clock stopped at');
    expect(screen.getByTestId('deadline-clock-nis2-intermediate-report-0')).toHaveTextContent(
      'NIS2 intermediate report, no. 1',
    );
    expect(screen.getByTestId('deadline-clock-nis2-intermediate-report-0')).toHaveTextContent(
      'Met',
    );
  });

  it('reads an open deadline the page has passed as missed before the server says so', async () => {
    vi.setSystemTime(new Date('2026-11-27T10:00:00Z'));
    await open('workshop', PHISHING);
    const row = screen.getByTestId('deadline-clock-gdpr-art33-');
    expect(row).toHaveTextContent('Missed');
    expect(row).toHaveTextContent('Overdue by 50 minutes');
  });

  it('follows the clock in the state where it has advanced', async () => {
    vi.setSystemTime(new Date('2026-11-27T10:00:00Z'));
    await open('workshop#incident-clock-advanced', PHISHING);
    expect(screen.getByTestId('deadline-clock-gdpr-art33-')).toHaveAttribute(
      'data-status',
      'MISSED',
    );
  });

  it('is written in German', async () => {
    await open('workshop', CARD, {}, 'de');
    const missed = screen.getByTestId('deadline-clock-gdpr-art33-');
    expect(missed).toHaveTextContent('Meldung an die Aufsichtsbehörde');
    expect(missed).toHaveTextContent('DSGVO Art. 33: 72 Stunden nach Kenntnis');
    expect(missed).toHaveTextContent('Versäumt');
    expect(missed).toHaveTextContent('Seit 4 Tage überfällig');
  });
});

describe('the notices sent', () => {
  it('lists every notice with the time, the recipient, the channel and the deadline it meets', async () => {
    await open('workshop', CARD, { stage: 'notifications' });
    const table = screen.getByTestId('notifications-table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    const warning = screen.getByTestId('notification-nis2-early-warning');
    expect(warning).toHaveTextContent('NIS2 early warning');
    expect(warning).toHaveTextContent('Joint reporting office BSI and BBK');
    expect(warning).toHaveTextContent('Reporting portal');
    expect(warning).toHaveTextContent('Reference BSI-2026-4417');
    expect(warning).toHaveTextContent('Met');
    // Sent after its time: the notice says so and stays a missed deadline.
    expect(screen.getByTestId('notification-nis2-notification')).toHaveTextContent('Sent late');
  });

  it('lists the entries of a list as notices of their own, with the comment', async () => {
    await open('workshop', OUTAGE, { stage: 'notifications' });
    expect(screen.getByTestId('notification-nis2-intermediate-reports-0')).toHaveTextContent(
      'No. 1',
    );
    const others = screen.getByTestId('notification-others-0');
    expect(others).toHaveTextContent("Affected customers' administrators");
    expect(others).toHaveTextContent('Service status and the expected time of recovery.');
    expect(others).toHaveTextContent('No deadline');
  });

  it('says that nothing has been sent yet', async () => {
    await open('workshop', PHISHING, { stage: 'notifications' });
    expect(screen.getByTestId('notifications-none')).toHaveTextContent(
      'Nothing has been sent yet.',
    );
  });

  it('gives the form of the notices under the table, with the words of each notice', async () => {
    await open('workshop', PHISHING, { stage: 'notifications' });
    expect(screen.getByTestId('stage-form-section')).toHaveTextContent('Record a notice');
    expect(screen.getByTestId('stage-form-section')).toHaveTextContent(
      'Name an office or an organisation as the recipient, never a person.',
    );
    expect(screen.getByTestId('stage-form')).toHaveTextContent(
      'Supervisory authority (GDPR Art. 33)',
    );
  });

  it('is written in German', async () => {
    await open('workshop', CARD, { stage: 'notifications' }, 'de');
    const warning = screen.getByTestId('notification-nis2-early-warning');
    expect(warning).toHaveTextContent('NIS2-Frühwarnung');
    expect(warning).toHaveTextContent('Meldeportal');
    expect(warning).toHaveTextContent('Aktenzeichen BSI-2026-4417');
    expect(screen.getByTestId('notification-nis2-notification')).toHaveTextContent(
      'Zu spät gesendet',
    );
  });
});

describe('the form of a stage', () => {
  it('shows the guidance and the fields of the stage in the words of the catalogue', async () => {
    await open('workshop', CARD);
    expect(screen.getByTestId('stage-guidance')).toHaveTextContent('Describe who is affected');
    const form = screen.getByTestId('stage-form');
    expect(form).toHaveTextContent('Risk to the data subjects');
    expect(form).toHaveTextContent('Risk assessment');
    expect(form).toHaveTextContent('Notify the supervisory authority');
  });

  it('offers no field for the completion, which only the acts write', async () => {
    await open('workshop', CARD);
    expect(screen.getByTestId('stage-form')).not.toHaveTextContent('completion');
  });

  it('reads a completed stage as it is: no control until it is reopened', async () => {
    await open('workshop', CARD, { stage: 'triage' });
    const form = screen.getByTestId('stage-form');
    expect(within(form).queryByRole('textbox')).toBeNull();
    expect(within(form).queryByRole('checkbox')).toBeNull();
    expect(form).toHaveTextContent('Became aware at');
  });

  it('edits the title in the triage, which is no stage and stays open to change', async () => {
    await open('workshop', CARD, { stage: 'triage' });
    const title = within(screen.getByTestId('title-form')).getByRole('textbox');
    expect(title).toHaveValue('Card data exposed in the checkout log');
    expect(title).not.toBeDisabled();
  });
});

describe('saving a part', () => {
  it('keeps the change as a draft for the person, then saves the part of the stage for everyone', async () => {
    const kit = await open('workshop', CARD);
    expect(screen.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.input(screen.getByLabelText(/Records affected, approximate/), {
      target: { value: '1800' },
    });
    expect(screen.getByTestId('save-state')).toHaveTextContent('Changed. Keeping it for you…');
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 50);
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'draft'),
    );
    expect(bodyOf(kit, `PUT /api/v1/drafts/isms-incidents-2026/${CARD}`)?.parts).toHaveProperty(
      'privacy-assessment',
    );
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent(/Saved for everyone at/),
    );
    const body = bodyOf(kit, SAVE(CARD)) as {
      parts: Record<string, { blob: string; fields: Record<string, unknown> }>;
    };
    expect(Object.keys(body.parts)).toEqual(['privacy-assessment']);
    expect(body.parts['privacy-assessment'].blob).toBe('4f7623b');
    expect(body.parts['privacy-assessment'].fields).toEqual({ '/records-approximate': 1800 });
  });

  it('keeps the changes of a stage when the person looks at another tab and back', async () => {
    const kit = await open('workshop', CARD);
    await fireEvent.input(screen.getByLabelText(/Records affected, approximate/), {
      target: { value: '1800' },
    });
    await kit.show('triage');
    expect(shownStage()).toBe('triage');
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'changed');
    await kit.show('privacy-assessment');
    expect(screen.getByLabelText(/Records affected, approximate/)).toHaveValue(1800);
  });

  it('saves the title as the part data and the stage as its own part, one signed commit for each', async () => {
    const kit = await open('workshop', CARD, { stage: 'triage' });
    await fireEvent.input(within(screen.getByTestId('title-form')).getByRole('textbox'), {
      target: { value: 'Card data in the checkout log' },
    });
    await kit.show('privacy-assessment');
    await fireEvent.input(screen.getByLabelText(/Records affected, approximate/), {
      target: { value: '1900' },
    });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() =>
      expect(kit.bodies.filter((entry) => entry.request === SAVE(CARD))).toHaveLength(2),
    );
    const parts = kit.bodies
      .filter((entry) => entry.request === SAVE(CARD))
      .map((entry) => Object.keys((entry.body as { parts: object }).parts));
    expect(parts).toEqual([['data'], ['privacy-assessment']]);
    expect(bodyOf(kit, SAVE(CARD))).toMatchObject({
      parts: { data: { fields: { '/title': 'Card data in the checkout log' } } },
    });
  });

  it('reads the incident again after a save', async () => {
    const kit = await open('workshop', CARD);
    const reads = () =>
      kit.requests.filter((r) => r === `GET /api/v1/incidents/2026/${CARD}`).length;
    const before = reads();
    await fireEvent.input(screen.getByLabelText(/Records affected, approximate/), {
      target: { value: '1800' },
    });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() => expect(reads()).toBe(before + 1));
  });

  it('flags the tab of a stage whose part is in conflict, and asks to decide before the next save', async () => {
    const kit = await open('workshop#incident-saved-by-other', CARD, { stage: 'notifications' });
    await fireEvent.input(control('/supervisory-authority/recipient'), {
      target: { value: 'State data protection authority' },
    });
    await fireEvent.input(control('/supervisory-authority/sent-at'), {
      target: { value: '2026-11-26T09:45' },
    });
    await fireEvent.change(control('/supervisory-authority/channel'), { target: { value: '0' } });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() => expect(tab('notifications')).toHaveTextContent('Conflict'));
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'conflict');
    expect(screen.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('save-everyone')).toHaveTextContent('Save for everyone');
    const panel = screen.getByTestId('conflict-panel');
    expect(panel).toHaveTextContent('Supervisory authority (GDPR Art. 33)');
    expect(bodyOf(kit, SAVE(CARD))).toMatchObject({
      parts: { notifications: { blob: '65fe94d' } },
    });
    // The conflict of a part belongs to the stage of the part: the other tabs say nothing of it.
    expect(tab('triage')).not.toHaveTextContent('Conflict');
  });

  it('refuses a save over a stage that was completed meanwhile, keeps the changes and reads the incident again', async () => {
    const kit = await open('workshop#incident-stage-locked', CARD);
    const reads = () =>
      kit.requests.filter((r) => r === `GET /api/v1/incidents/2026/${CARD}`).length;
    const before = reads();
    await fireEvent.input(screen.getByLabelText(/Records affected, approximate/), {
      target: { value: '1800' },
    });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByTestId('stage-failure')).toHaveTextContent(
      'A stage you changed was completed meanwhile',
    );
    await vi.waitFor(() => expect(reads()).toBe(before + 1));
    expect(screen.getByLabelText(/Records affected, approximate/)).toHaveValue(1800);
  });

  it('puts the errors of a refused save at the fields of their part', async () => {
    await open('workshop#incident-invalid', CARD, { stage: 'notifications' });
    await fireEvent.input(control('/supervisory-authority/recipient'), {
      target: { value: 'State data protection authority' },
    });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'failed'),
    );
    expect(screen.getByTestId('save-state')).toHaveTextContent('Some entries need a correction.');
  });

  it('keeps the changes and says that the Git server cannot be reached', async () => {
    await open('workshop#incident-git-unavailable', CARD);
    await fireEvent.input(screen.getByLabelText(/Records affected, approximate/), {
      target: { value: '1800' },
    });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByTestId('stage-failure')).toHaveTextContent(/Git/);
    expect(screen.getByLabelText(/Records affected, approximate/)).toHaveValue(1800);
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
  });
});

/** @returns the control of the field at a pointer of the form of the stage */
function control(pointer: string): HTMLElement {
  const holder = document.querySelector(`[data-pointer="${pointer}"]`);
  const found = holder?.querySelector<HTMLElement>('input, select, textarea');
  if (!found) throw new Error(`no field at ${pointer}`);
  return found;
}

describe('completing a stage', () => {
  it('lists the mandatory fields that are missing, each as a way to the field, and keeps the form as it is', async () => {
    const kit = await open('workshop', SUSPICIOUS, { stage: 'triage' });
    await fireEvent.click(screen.getByTestId('stage-complete'));
    const list = await screen.findByTestId('missing-fields');
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.textContent?.trim()),
    ).toEqual(['Go to Severity', 'Go to Personal data affected', 'Go to Significant under NIS2']);
    expect(screen.getByText('Triage cannot be completed yet')).toBeInTheDocument();
    // The part was never changed by the refusal; the request named the blob the form loaded.
    expect(bodyOf(kit, COMPLETE(SUSPICIOUS, 'triage'))).toEqual({ blob: '87e9254' });
    await fireEvent.click(within(list).getByRole('button', { name: 'Go to Severity' }));
    expect(control('/severity')).toHaveFocus();
    await fireEvent.click(screen.getByTestId('back-to-editing'));
    expect(screen.queryByTestId('stage-refusal')).toBeNull();
  });

  it('marks the mandatory fields of the refused stage as required in the form', async () => {
    await open('workshop', SUSPICIOUS, { stage: 'triage' });
    await fireEvent.click(screen.getByTestId('stage-complete'));
    await screen.findByTestId('stage-refusal');
    expect(screen.getByTestId('stage-form')).toHaveTextContent('Severity');
  });

  it('names the stage that must be completed first, as a link to its tab, and disables the act with the reason', async () => {
    await open('workshop', SUSPICIOUS, { stage: 'response' });
    const act = screen.getByTestId('stage-complete');
    expect(act).toHaveAttribute('aria-disabled', 'true');
    expect(
      within(screen.getByTestId('stage-bar')).getByText('Complete Triage first.'),
    ).toBeInTheDocument();
  });

  it('tells the stages that are still open before a stage, from the refusal of the server', async () => {
    // The act is disabled for a stage that waits; a refusal for open predecessors alone still comes from the server.
    const kit = await open('workshop', PHISHING, { stage: 'response' });
    await fireEvent.click(screen.getByTestId('stage-complete'));
    const list = await screen.findByTestId('missing-fields');
    expect(list).toHaveTextContent('Go to Resolved at');
    expect(screen.queryByTestId('stage-open-before')).toBeNull();
    expect(bodyOf(kit, COMPLETE(PHISHING, 'response'))).toEqual({ blob: expect.any(String) });
  });

  it('completes a stage and tells that it is done, reads the incident again and shows the stage as completed', async () => {
    const kit = await open('workshop', STUFFING, { stage: 'review' });
    expect(tab('review')).toHaveTextContent('Open');
    await fireEvent.click(screen.getByTestId('stage-complete'));
    await vi.waitFor(() => expect(tab('review')).toHaveTextContent('Completed'));
    expect(bodyOf(kit, COMPLETE(STUFFING, 'review'))).toEqual({ blob: expect.any(String) });
    expect(screen.getByText('Stage Review is completed.')).toBeInTheDocument();
    expect(screen.getByTestId('stage-completion')).toHaveTextContent('Completed by Alex Example');
    expect(screen.getByTestId('stage-reopen')).toHaveTextContent('Reopen stage');
    expect(screen.getByTestId('stage-form')).not.toContainElement(screen.queryByRole('textbox'));
  });

  it('reopens a completed stage and marks the stages signed off after it', async () => {
    await open('workshop', STUFFING, { stage: 'triage' });
    expect(tab('response')).not.toHaveTextContent('Signed off before');
    await fireEvent.click(screen.getByTestId('stage-reopen'));
    await vi.waitFor(() => expect(tab('triage')).toHaveTextContent('Open'));
    expect(screen.getByText('Stage Triage is open again.')).toBeInTheDocument();
    expect(tab('response')).toHaveTextContent('Signed off before an earlier stage was reopened');
    expect(screen.getByTestId('stage-complete')).toBeInTheDocument();
  });

  it('completes again a stage that was reopened, and the markers of the stages after it go', async () => {
    await open('workshop#incident-triage-recompleted', WRONG, { stage: 'triage' });
    expect(tab('triage')).toHaveTextContent('Completed');
    expect(tab('response')).not.toHaveTextContent('Signed off before');
  });

  it('asks to save first when the person has changes in the stage, and completes after the save', async () => {
    const kit = await open('workshop', CARD, { stage: 'privacy-assessment' });
    await fireEvent.input(screen.getByLabelText(/Records affected, approximate/), {
      target: { value: '1800' },
    });
    await fireEvent.click(screen.getByTestId('stage-complete'));
    expect(kit.requests).not.toContain(COMPLETE(CARD, 'privacy-assessment'));
    const notice = await screen.findByText('Save your changes first');
    expect(notice).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('stage-save-first'));
    await vi.waitFor(() =>
      expect(kit.bodies.some((e) => e.request === COMPLETE(CARD, 'privacy-assessment'))).toBe(true),
    );
    // The sign-off names the blob the save left, not the one read before it.
    expect(bodyOf(kit, COMPLETE(CARD, 'privacy-assessment'))).toEqual({ blob: expect.any(String) });
    expect(kit.requests.indexOf(SAVE(CARD))).toBeLessThan(
      kit.requests.indexOf(COMPLETE(CARD, 'privacy-assessment')),
    );
  });

  it('tells a stage someone saved since the form was read, reads it again and signs nothing off', async () => {
    const kit = await open('workshop#incident-complete-changed', PHISHING, {
      stage: 'privacy-assessment',
    });
    const reads = () =>
      kit.requests.filter((r) => r === `GET /api/v1/incidents/2026/${PHISHING}`).length;
    const before = reads();
    await fireEvent.click(screen.getByTestId('stage-complete'));
    expect(await screen.findByTestId('stage-failure')).toHaveTextContent(
      'Someone saved this stage since you opened it',
    );
    await vi.waitFor(() => expect(reads()).toBe(before + 1));
  });

  it('tells that the Git server cannot be reached, and keeps the stage open', async () => {
    await open('workshop#incident-git-unavailable', SUSPICIOUS, { stage: 'triage' });
    await fireEvent.click(screen.getByTestId('stage-complete'));
    expect(await screen.findByTestId('stage-failure')).toHaveTextContent(/Git/);
    expect(tab('triage')).toHaveTextContent('Open');
  });

  it('offers no act to a person who may only read, nor on an earlier state or a released incident', async () => {
    await open('read-only', CARD);
    expect(screen.queryByTestId('stage-bar')).toBeNull();
    expect(screen.getByTestId('save-state')).toHaveTextContent('Editing needs the edit right.');
  });

  it('offers no act on a released incident', async () => {
    await open('workshop', OUTAGE, { stage: 'review' });
    expect(screen.queryByTestId('stage-bar')).toBeNull();
    expect(screen.getByTestId('released-notice')).toHaveTextContent('Released as v1');
    expect(screen.getByTestId('save-state')).toHaveTextContent('Released and frozen.');
  });
});

describe('the step-up of the review', () => {
  it('leaves for the confirmation of the provider when the server asks for it', async () => {
    const kit = await open('workshop#incident-review-step-up', STUFFING, { stage: 'review' });
    const stepUp = vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    expect(screen.getByTestId('stage-step-up-note')).toHaveTextContent(
      'You confirm your identity once more before this stage is completed.',
    );
    await fireEvent.click(screen.getByTestId('stage-complete'));
    await vi.waitFor(() => expect(stepUp).toHaveBeenCalledWith('/api/v1/auth/login?step-up=mfa'));
    expect(kit.requests.filter((r) => r === COMPLETE(STUFFING, 'review'))).toHaveLength(1);
    expect(tab('review')).toHaveTextContent('Open');
  });

  it('asks a local user for the password before the review is completed, and sends it with the request', async () => {
    const kit = await open('workshop#incident-review-stepped-up', STUFFING, { stage: 'review' });
    status.set({ ...get(status)!, stepUp: 'password' });
    await fireEvent.click(screen.getByTestId('stage-complete'));
    const password = await screen.findByTestId('document-password');
    expect(kit.requests).not.toContain(COMPLETE(STUFFING, 'review'));
    await fireEvent.input(password, { target: { value: 'secret' } });
    await fireEvent.click(screen.getByTestId('document-confirm'));
    await vi.waitFor(() => expect(tab('review')).toHaveTextContent('Completed'));
    expect(bodyOf(kit, COMPLETE(STUFFING, 'review'))).toMatchObject({ password: 'secret' });
  });

  it('says nothing of a confirmation where the installation asks for none', async () => {
    await open('local', STUFFING, { stage: 'review' });
    expect(screen.queryByTestId('stage-step-up-note')).toBeNull();
  });

  it('asks for the confirmation of no other stage', async () => {
    await open('workshop', STUFFING, { stage: 'triage' });
    expect(screen.queryByTestId('stage-step-up-note')).toBeNull();
  });
});

describe('submitting the incident', () => {
  it('disables Submit with the stages that are not completed as the reason', async () => {
    await open('workshop', CARD);
    const submit = screen.getByTestId('transition-incident.submit');
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('transition-bar')).toHaveTextContent(
      'Complete these stages first: Privacy assessment, Response, Notifications, Review.',
    );
  });

  it('submits an incident whose stages are all completed, and shows it in review with the way to the release', async () => {
    const kit = await open('workshop#incident-review-completed', STUFFING);
    const submit = screen.getByTestId('transition-incident.submit');
    expect(submit).not.toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(submit);
    await vi.waitFor(() =>
      expect(screen.getByTestId('document-state')).toHaveTextContent('In review'),
    );
    expect(kit.requests).toContain(
      `POST /api/v1/documents/isms-incidents-2026/${STUFFING}/transitions/incident.submit`,
    );
    const release = await screen.findByTestId('transition-incident.release');
    expect(release).toHaveTextContent('Release');
    expect(release).toHaveAttribute('href', `/incidents/2026/${STUFFING}/release`);
  });

  it('asks to save first when the person has changes, then submits', async () => {
    const kit = await open('workshop#incident-review-completed', STUFFING, { stage: 'triage' });
    await fireEvent.input(within(screen.getByTestId('title-form')).getByRole('textbox'), {
      target: { value: 'Credential stuffing against the sign-in form' },
    });
    await fireEvent.click(screen.getByTestId('transition-incident.submit'));
    expect(await screen.findByText('Save your changes first')).toBeInTheDocument();
    expect(kit.requests).not.toContain(
      `POST /api/v1/documents/isms-incidents-2026/${STUFFING}/transitions/incident.submit`,
    );
    await fireEvent.click(screen.getByTestId('save-first'));
    await vi.waitFor(() =>
      expect(kit.requests).toContain(
        `POST /api/v1/documents/isms-incidents-2026/${STUFFING}/transitions/incident.submit`,
      ),
    );
    expect(kit.requests.indexOf(SAVE(STUFFING))).toBeLessThan(
      kit.requests.indexOf(
        `POST /api/v1/documents/isms-incidents-2026/${STUFFING}/transitions/incident.submit`,
      ),
    );
  });
});

describe('the report', () => {
  it('is read on the page, section by section, only when the person asks, and says that it is a preview in English', async () => {
    const kit = await open('workshop', STUFFING);
    expect(kit.requests).not.toContain(`GET /api/v1/incidents/2026/${STUFFING}/report`);
    await fireEvent.click(screen.getByTestId('report-toggle'));
    const preview = await screen.findByTestId('report-preview');
    await vi.waitFor(() =>
      expect(within(preview).getAllByTestId('report-section').length).toBeGreaterThan(5),
    );
    expect(screen.getByTestId('report-source')).toHaveTextContent(
      'A preview generated from the saved state',
    );
    expect(screen.getByTestId('report-english')).toHaveTextContent(
      'The report is written in English, whatever language the app shows.',
    );
    // Every section is a request of its own to the render request, never the whole report in one.
    const renders = kit.bodies.filter((entry) => entry.request === 'POST /api/v1/render/asciidoc');
    expect(renders.length).toBeGreaterThan(5);
    expect(
      renders.every((entry) => !(entry.body as { source: string }).source.startsWith('= ')),
    ).toBe(true);
    await fireEvent.click(screen.getByTestId('report-toggle'));
    expect(screen.queryByTestId('report-preview')).toBeNull();
  });

  it('says that the report of a released incident is the one the release committed, and is no download', async () => {
    await open('workshop', OUTAGE);
    await fireEvent.click(screen.getByTestId('report-toggle'));
    expect(await screen.findByTestId('report-source')).toHaveTextContent(
      'The report that the release committed',
    );
    expect(screen.getAllByTestId('report-section').length).toBeGreaterThan(0);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('reads the report of an earlier state at that state', async () => {
    const kit = await open('workshop', OUTAGE, { at: 'v1' });
    await fireEvent.click(screen.getByTestId('report-toggle'));
    await screen.findByTestId('report-source');
    expect(kit.requests).toContain(`GET /api/v1/incidents/2026/${OUTAGE}/report?at=v1`);
  });

  it('tells that the report could not be read', async () => {
    await open('workshop', STUFFING);
    vi.spyOn(apiClient, 'getIncidentReport').mockRejectedValue(new Error('x'));
    await fireEvent.click(screen.getByTestId('report-toggle'));
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
  });

  it('is introduced in German', async () => {
    await open('workshop', STUFFING, {}, 'de');
    expect(screen.getByTestId('report-block')).toHaveTextContent(
      'Der Bericht wird aus den gespeicherten Daten erzeugt.',
    );
    await fireEvent.click(screen.getByTestId('report-toggle'));
    expect(await screen.findByTestId('report-english')).toHaveTextContent('auf Englisch verfasst');
  });
});

describe('an earlier state', () => {
  it('is read as it was, with no act, no step of the workflow and a way back', async () => {
    await open('workshop', OUTAGE, { at: 'v1' });
    expect(screen.getByTestId('revision-notice')).toHaveTextContent(
      'You are reading an earlier state',
    );
    expect(screen.getByTestId('revision-notice')).toHaveTextContent('Released as v1');
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'An earlier state can be read only.',
    );
    expect(screen.queryByTestId('save-everyone')).toBeNull();
    expect(screen.queryByTestId('transition-bar')).toBeNull();
    expect(screen.queryByTestId('stage-bar')).toBeNull();
    expect(screen.queryByTestId('released-notice')).toBeNull();
    expect(screen.getByTestId('clock-stopped')).toBeInTheDocument();
    expect(within(screen.getByTestId('revision-notice')).getByRole('link')).toHaveAttribute(
      'href',
      `/incidents/2026/${OUTAGE}`,
    );
  });

  it('offers the releases and the saves of the incident, which read at their own address', async () => {
    const kit = await open('workshop', STUFFING, { stage: 'review' });
    const picker = await screen.findByTestId('revision-select');
    expect(picker).toBeInTheDocument();
    expect(kit.requests).toContain(
      `GET /api/v1/documents/isms-incidents-2026/${STUFFING}/revisions`,
    );
    expect(screen.getByTestId('document-history')).toHaveTextContent('Completed the stage Triage');
    expect(screen.getByTestId('document-history')).toHaveTextContent(/Saved \d+ fields? of Review/);
  });
});

describe('the margin and the live refresh', () => {
  it('names the release in the margin with its tag, and the person who released', async () => {
    await open('workshop', OUTAGE);
    expect(screen.getByTestId('release-block')).toHaveTextContent('Released by Noor Haddad');
    expect(screen.getByTestId('release-block')).toHaveTextContent(`incidents/${OUTAGE}/v1`);
    expect(screen.getByTestId('document-state')).toHaveTextContent('Released as v1');
  });

  it('reads the incident again when the stream names it, and keeps what the person typed', async () => {
    const kit = await open('workshop', CARD);
    const reads = () =>
      kit.requests.filter((r) => r === `GET /api/v1/incidents/2026/${CARD}`).length;
    const before = reads();
    await fireEvent.input(screen.getByLabelText(/Records affected, approximate/), {
      target: { value: '1800' },
    });
    kit.emit('document-saved', {
      repository: 'isms-incidents-2026',
      id: CARD,
      part: 'notifications',
      fields: [],
      by: { pseudonym: 'p-2b7f10', name: 'Jordan Weber' },
    });
    await vi.waitFor(() => expect(reads()).toBe(before + 1));
    expect(screen.getByLabelText(/Records affected, approximate/)).toHaveValue(1800);
  });

  it('reads the incident again after a step of the workflow of someone else, and ignores another incident', async () => {
    const kit = await open('workshop', CARD);
    const reads = () =>
      kit.requests.filter((r) => r === `GET /api/v1/incidents/2026/${CARD}`).length;
    const before = reads();
    kit.emit('document-saved', { repository: 'isms-incidents-2026', id: STUFFING, fields: [] });
    expect(reads()).toBe(before);
    kit.emit('document-transitioned', {
      repository: 'isms-incidents-2026',
      id: CARD,
      state: 'in-review',
      version: 1,
      by: { pseudonym: 'p-2b7f10', name: 'Jordan Weber' },
    });
    await vi.waitFor(() => expect(reads()).toBe(before + 1));
  });

  it('tells that someone else saved a part, when the blob that comes back is not the own', async () => {
    const kit = await open('workshop', CARD);
    const url = `/api/v1/incidents/2026/${CARD}`;
    const read = await (await fetch(url)).json();
    read.parts['privacy-assessment'] = {
      ...read.parts['privacy-assessment'],
      blob: 'aaaaaaa',
      savedBy: { pseudonym: 'p-2b7f10', name: 'Jordan Weber' },
    };
    vi.spyOn(apiClient, 'getIncident').mockResolvedValue(read);
    kit.emit('document-saved', { repository: 'isms-incidents-2026', id: CARD, fields: [] });
    expect(await screen.findByTestId('remote-notice')).toHaveTextContent(
      'Jordan Weber saved this document.',
    );
  });
});

describe('the draft of the person', () => {
  it('brings back the own draft of a part, with the time it was kept', async () => {
    const draft = {
      at: '2026-11-26T09:30:00Z',
      parts: {
        'privacy-assessment': { blob: '4f7623b', fields: { '/records-approximate': 1700 } },
      },
    };
    const read = JSON.parse(
      fs.readFileSync(path.join(SCENARIO_DIR, 'data', 'incident-card-data.json'), 'utf8'),
    );
    await useProfile('workshop', 'en', {
      [`GET /api/v1/incidents/2026/${CARD}`]: { ...read, draft },
    });
    status.set(await apiClient.getStatus());
    render(IncidentsView, {
      route: 'incidents.incident',
      params: { year: '2026', incident: CARD },
      query: {},
      onnavigate: vi.fn(),
    });
    await screen.findByTestId('incident-sheet');
    expect(screen.getByTestId('restored-notice')).toHaveTextContent('Your own draft from');
    expect(screen.getByLabelText(/Records affected, approximate/)).toHaveValue(1700);
    expect(screen.queryByTestId('stale-notice')).toBeNull();
  });

  it('says that a draft started from an older version of the part', async () => {
    const draft = {
      at: '2026-11-26T09:30:00Z',
      parts: {
        'privacy-assessment': { blob: '0000000', fields: { '/records-approximate': 1700 } },
      },
    };
    const read = JSON.parse(
      fs.readFileSync(path.join(SCENARIO_DIR, 'data', 'incident-card-data.json'), 'utf8'),
    );
    await useProfile('workshop', 'en', {
      [`GET /api/v1/incidents/2026/${CARD}`]: { ...read, draft },
    });
    render(IncidentsView, {
      route: 'incidents.incident',
      params: { year: '2026', incident: CARD },
      query: {},
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('stale-notice')).toBeInTheDocument();
  });
});

describe('the sheet in German', () => {
  it('words the tabs, the act of the stage and the refusal in German', async () => {
    await open('workshop', SUSPICIOUS, { stage: 'triage' }, 'de');
    expect(tab('triage')).toHaveTextContent('Ersteinschätzung');
    expect(tab('privacy-assessment')).toHaveTextContent(
      'Noch nicht beantwortet: gilt, wenn personenbezogene Daten betroffen sind',
    );
    const act = screen.getByTestId('stage-complete');
    expect(act).toHaveTextContent('Phase abschließen');
    await fireEvent.click(act);
    expect(
      await screen.findByText('Ersteinschätzung lässt sich noch nicht abschließen'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('missing-fields')).toHaveTextContent('Zu Schweregrad');
  });

  it('words the submit reason and the report in German', async () => {
    await open('workshop', CARD, {}, 'de');
    expect(screen.getByTestId('transition-bar')).toHaveTextContent(
      'Schließen Sie zuerst diese Phasen ab: Datenschutzbewertung, Reaktion, Meldungen, Auswertung.',
    );
  });
});
