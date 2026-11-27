import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { ApiError } from '../../api/errors';
import { session, status } from '../../stores/app';
import { resetKit, useProfile, type Kit } from '../documents/testkit';
import IncidentsView from './IncidentsView.svelte';

/**
 * The form of a new incident (UC-IR-1) against the profiles of the mock (AUN-TEST-1): the title and the awareness, the
 * create that moves the page to the new incident, the refusals where the fields are, the confirmation a create may ask
 * for, and the states of a person without the right or of a year that is not the current one.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
});

afterEach(resetKit);

const CREATE = 'POST /api/v1/documents/isms-incidents-2026';
const NEW_ID = '01JZA8F0H2K4M6P8R0T2W4Y6A8';

/**
 * @param profile `name` or `name#state`
 * @param year the year of the address
 * @param lang the language
 * @returns the kit and the navigation spy, with the form open
 */
async function open(
  profile = 'workshop',
  year = '2026',
  lang: 'en' | 'de' = 'en',
): Promise<Kit & { onnavigate: ReturnType<typeof vi.fn> }> {
  const kit = await useProfile(profile, lang);
  status.set(await apiClient.getStatus());
  const onnavigate = vi.fn();
  render(IncidentsView, { route: 'incidents.new', params: { year }, onnavigate });
  return { ...kit, onnavigate };
}

/** Types the title the way the person does. */
async function typeTitle(text: string) {
  await fireEvent.input(await screen.findByLabelText(/^Title/), { target: { value: text } });
}

describe('the form', () => {
  it('is a sheet beside the list of the year, with the title and the awareness asked for', async () => {
    await open();
    await screen.findByTestId('new-incident-sheet');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New incident');
    expect(screen.getByText(/An incident of 2026/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Became aware at/)).toBeInTheDocument();
    // The chain is years, the year, the new incident: the sheet is the last level.
    expect(screen.getByTestId('incidents-view')).toBeInTheDocument();
  });

  it('asks for the title first and says why the act waits, without a technical word', async () => {
    await open();
    const act = await screen.findByTestId('create-incident');
    expect(act).toHaveTextContent('Create incident');
    expect(act).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Enter a title first.')).toBeInTheDocument();
    await typeTitle('Suspicious logins from the VPN gateway');
    expect(screen.getByTestId('create-incident')).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('save-state')).toHaveTextContent('Not saved yet.');
  });

  it('is not a change again when the awareness was typed and cleared', async () => {
    await open();
    const aware = await screen.findByLabelText(/Became aware at/);
    await fireEvent.input(aware, { target: { value: '2026-11-26T09:30' } });
    expect(screen.getByTestId('save-state')).toHaveTextContent('Your text stays on this page');
    await fireEvent.input(aware, { target: { value: '' } });
    expect(screen.getByTestId('save-state')).toHaveTextContent('Nothing is kept until');
  });

  it('is read in German', async () => {
    await open('workshop', '2026', 'de');
    expect(await screen.findByTestId('create-incident')).toHaveTextContent('Vorfall anlegen');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Neuer Vorfall');
    expect(screen.getByText('Geben Sie zuerst einen Titel ein.')).toBeInTheDocument();
  });
});

describe('the create', () => {
  it('sends the title with the awareness, then lands on the new incident without a place in the history', async () => {
    const kit = await open();
    await typeTitle('  Suspicious logins from the VPN gateway ');
    await fireEvent.input(screen.getByLabelText(/Became aware at/), {
      target: { value: '2026-11-26T09:30' },
    });
    await fireEvent.click(screen.getByTestId('create-incident'));
    await vi.waitFor(() =>
      expect(kit.onnavigate).toHaveBeenCalledWith(`/incidents/2026/${NEW_ID}`, { replace: true }),
    );
    const sent = kit.bodies.find((entry) => entry.request === CREATE)?.body as {
      kind: string;
      parts: Record<string, { fields: Record<string, string> }>;
    };
    expect(sent.kind).toBe('incident');
    expect(sent.parts.data.fields).toEqual({ '/title': 'Suspicious logins from the VPN gateway' });
    expect(sent.parts.triage.fields['/aware-at']).toMatch(/^2026-11-26T\d\d:\d\d:00Z$/);
    expect(kit.scenario.state()).toBe('incident-created');
  });

  it('sends the title alone when the awareness is not known yet', async () => {
    const kit = await open();
    await typeTitle('Laptop with customer extracts lost');
    await fireEvent.click(screen.getByTestId('create-incident'));
    await vi.waitFor(() => expect(kit.onnavigate).toHaveBeenCalled());
    const sent = kit.bodies.find((entry) => entry.request === CREATE)?.body as {
      parts: Record<string, unknown>;
    };
    expect(Object.keys(sent.parts)).toEqual(['data']);
  });

  it('reads the year and the years again, so that the new incident is in the list', async () => {
    const kit = await open();
    await screen.findByTestId('new-incident-sheet');
    await typeTitle('Suspicious logins from the VPN gateway');
    await fireEvent.click(screen.getByTestId('create-incident'));
    await vi.waitFor(() => expect(kit.onnavigate).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(
        kit.requests.filter((request) => request === 'GET /api/v1/incidents/2026'),
      ).toHaveLength(2),
    );
    await vi.waitFor(() =>
      expect(kit.requests.filter((request) => request === 'GET /api/v1/incidents')).toHaveLength(2),
    );
  });

  it('keeps what was typed and says where it is wrong when the server refuses the fields', async () => {
    const kit = await open('workshop#incident-create-invalid');
    await typeTitle('Suspicious logins from the VPN gateway');
    await fireEvent.click(screen.getByTestId('create-incident'));
    expect(await screen.findByText('Fill in this field.')).toBeInTheDocument();
    // The status and the field say it; no third sentence stands above the form.
    expect(screen.queryByText('Some entries are not valid. Correct the marked fields.')).toBeNull();
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Suspicious logins from the VPN gateway');
    expect(kit.onnavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('save-state')).toHaveTextContent('Some entries need a correction');
  });

  it('says at the field that the awareness is not in the year of the repository', async () => {
    const kit = await open();
    vi.spyOn(apiClient, 'createDocument').mockRejectedValueOnce(
      new ApiError('VALIDATION', 422, [
        { part: 'triage', pointer: '/aware-at', code: 'OUT_OF_YEAR' },
      ]),
    );
    await typeTitle('Card data exposed');
    await fireEvent.input(screen.getByLabelText(/Became aware at/), {
      target: { value: '2025-12-31T23:30' },
    });
    await fireEvent.click(screen.getByTestId('create-incident'));
    expect(
      await screen.findByText(
        'This time is not in the year of the incident. Choose a time within that year.',
      ),
    ).toBeInTheDocument();
    expect(kit.onnavigate).not.toHaveBeenCalled();
  });

  it('tells a create the Git server cannot take, and keeps the text', async () => {
    await open();
    vi.spyOn(apiClient, 'createDocument').mockRejectedValueOnce(
      new ApiError('GIT_UNAVAILABLE', 503),
    );
    await typeTitle('Card data exposed');
    await fireEvent.click(screen.getByTestId('create-incident'));
    expect(await screen.findByText(/The Git server cannot be reached/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Card data exposed');
  });

  it('asks the local user for the password when the server asks, and sends the same create with it', async () => {
    const kit = await open();
    const create = vi
      .spyOn(apiClient, 'createDocument')
      .mockRejectedValueOnce(new ApiError('STEP_UP_REQUIRED', 403))
      .mockResolvedValueOnce({
        outcome: 'CREATED',
        id: NEW_ID,
        repository: 'isms-incidents-2026',
        address: `/incidents/2026/${NEW_ID}`,
        state: 'draft',
        version: 1,
        at: '2026-11-26T09:41:00Z',
        parts: {},
      });
    status.update((held) => (held ? { ...held, stepUp: 'password' } : held));
    await typeTitle('Card data exposed');
    await fireEvent.click(screen.getByTestId('create-incident'));
    await fireEvent.input(await screen.findByTestId('create-password'), {
      target: { value: 'secret' },
    });
    await fireEvent.click(screen.getByTestId('create-confirm'));
    await vi.waitFor(() =>
      expect(kit.onnavigate).toHaveBeenCalledWith(`/incidents/2026/${NEW_ID}`, { replace: true }),
    );
    expect(create).toHaveBeenLastCalledWith(
      'isms-incidents-2026',
      expect.objectContaining({ kind: 'incident' }),
      'secret',
    );
  });
});

describe('when a new incident cannot be made', () => {
  it('tells a person who may only read, and offers the way back to the year', async () => {
    const kit = await open('read-only');
    expect(await screen.findByTestId('new-incident-blocked')).toHaveTextContent(
      'Creating an incident needs the right to edit the incident reports of this year',
    );
    expect(screen.getByTestId('new-incident-back')).toHaveAttribute('href', '/incidents/2026');
    expect(screen.queryByTestId('create-incident')).toBeNull();
    expect(kit.requests.filter((request) => request.startsWith('POST'))).toHaveLength(0);
  });

  it('tells that a new incident is made in the current year, for a year that is not', async () => {
    await useProfile('workshop');
    status.set(await apiClient.getStatus());
    session.update((held) =>
      held
        ? {
            ...held,
            rights: held.rights.map((right) =>
              right.repository === 'isms-incidents-2025'
                ? { ...right, actions: ['read', 'edit'] }
                : right,
            ),
          }
        : held,
    );
    render(IncidentsView, {
      route: 'incidents.new',
      params: { year: '2025' },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('new-incident-blocked')).toHaveTextContent(
      'A new incident is made in the current year',
    );
  });

  it('is the not-found view for a year that has no repository', async () => {
    await open('workshop#incident-year-missing');
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('is the not-found view for a person with no right on the year', async () => {
    await open('release');
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });
});
