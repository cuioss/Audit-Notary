import { render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetKit, useProfile, type Kit } from '../documents/testkit';
import IncidentsView from './IncidentsView.svelte';

/**
 * The lens Incidents against the profiles of the mock (AUN-TEST-1): the years as the first column, the incidents of a
 * year, the sheet of an incident, an earlier state, and the states of a person without the right to read or to edit.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
});

afterEach(resetKit);

const CARD = '01JZ9T4M6Q8S0V2X4B6D8F0H2K';
const STUFFING = '01JZ9V7P9S1T3W5Y7A9C1E3G5J';
const PHISHING = '01JZA2B4D6F8H0K2N4Q6S8V0X2';
const OUTAGE = '01JZ8M3N5P7R9T1V3X5Z7B9D1F';
const SUSPICIOUS = '01JZA6D8F0H2K4M6P8R0T2W4Y6';
const LAPTOP = '01JZ2A4C6E8G0J2M4P6R8T0W2Y';

/**
 * @param profile `name` or `name#state`
 * @param route the route id
 * @param params the values of the address
 * @param query the admitted query
 * @param lang the language
 * @returns the kit and the navigation spy
 */
async function open(
  profile: string,
  route: string,
  params: Record<string, string> = {},
  query: Record<string, string> = {},
  lang: 'en' | 'de' = 'en',
  answers: Record<string, unknown> = {},
): Promise<Kit & { onnavigate: ReturnType<typeof vi.fn> }> {
  const kit = await useProfile(profile, lang, answers);
  const onnavigate = vi.fn();
  render(IncidentsView, { route, params, query, onnavigate });
  return { ...kit, onnavigate };
}

describe('the years, the first column', () => {
  it('lists the years the person may read with their counts, their missed deadlines and their retention', async () => {
    await open('workshop', 'incidents');
    const list = await screen.findByTestId('year-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    const current = screen.getByTestId('year-2026');
    expect(current).toHaveAttribute('href', '/incidents/2026');
    expect(current).toHaveTextContent('Current year');
    expect(current).toHaveTextContent('7 incidents, 6 not released');
    expect(current).toHaveTextContent('One incident with a missed deadline');
    expect(current).toHaveTextContent('Kept until Dec 31, 2031');
    const older = screen.getByTestId('year-2025');
    expect(older).toHaveTextContent('2 incidents, 0 not released');
    expect(older).not.toHaveTextContent('Current year');
  });

  it('draws a missed deadline as a box where an incident is still open, and as a fact where every one is released', async () => {
    await open('workshop', 'incidents');
    const current = await screen.findByTestId('year-2026');
    expect(current.querySelector('.reason')).not.toBeNull();
    expect(screen.getByTestId('year-2025').querySelector('.reason')).toBeNull();
    expect(screen.getByTestId('year-2025')).toHaveTextContent(
      'One incident with a missed deadline',
    );
  });

  it('says in the second column that a year is selected', async () => {
    await open('workshop', 'incidents.year', { year: '2026' });
    await screen.findByTestId('incident-list');
    expect(screen.getByTestId('year-2026')).toHaveAttribute('aria-current', 'page');
  });

  it('tells a person with no incident repository to ask for one', async () => {
    await open('release', 'incidents');
    expect(await screen.findByTestId('years-none')).toHaveTextContent(
      'No incident reports are open to you',
    );
    expect(screen.queryByTestId('year-list')).toBeNull();
  });

  it('tells an installation without an incident repository the same', async () => {
    await open('empty', 'incidents');
    expect(await screen.findByTestId('years-none')).toBeInTheDocument();
  });

  it('tells that the repository of the current year is not set up, and the older years stay readable', async () => {
    await open('workshop#incident-year-missing', 'incidents');
    expect(await screen.findByTestId('year-missing')).toHaveTextContent(
      'The repository of 2026 is not set up',
    );
    expect(screen.getByTestId('year-2025')).toBeInTheDocument();
  });

  it('is written in German', async () => {
    await open('workshop', 'incidents', {}, {}, 'de');
    const current = await screen.findByTestId('year-2026');
    expect(current).toHaveTextContent('Laufendes Jahr');
    expect(current).toHaveTextContent('7 Vorfälle, 6 nicht freigegeben');
    expect(current).toHaveTextContent('Ein Vorfall mit versäumter Frist');
    expect(current).toHaveTextContent('Aufbewahrt bis 31.12.2031');
  });
});

describe('the incidents of a year, the second column', () => {
  it('lists the incidents newest awareness first with the state, the stages and the deadlines of each', async () => {
    await open('workshop', 'incidents.year', { year: '2026' });
    const list = await screen.findByTestId('incident-list');
    const rows = within(list)
      .getAllByRole('link')
      .map((row) => row.getAttribute('data-testid'));
    expect(rows).toEqual([
      `incident-${SUSPICIOUS}`,
      `incident-${PHISHING}`,
      `incident-${CARD}`,
      `incident-${STUFFING}`,
      `incident-${OUTAGE}`,
      'incident-01JZ8K1M3P5R7T9V1X3Z5B7D9F',
      'incident-01JZ6Q8S0V2X4B6D8F0H2K4M6P',
    ]);
    const card = screen.getByTestId(`incident-${CARD}`);
    expect(card).toHaveAttribute('href', `/incidents/2026/${CARD}`);
    expect(card).toHaveTextContent('Card data exposed in the checkout log');
    expect(card).toHaveTextContent('Draft');
    expect(card).toHaveTextContent('Severity: High');
    expect(card).toHaveTextContent('2 deadlines missed');
    expect(card).toHaveTextContent('1 open, 1 met');
    expect(card).toHaveTextContent('Next: NIS2 final report, Dec 22, 2026');
    expect(card).toHaveTextContent('Aware since Nov 19, 2026');
  });

  it('tells the status of every stage in words, for a screen reader as well', async () => {
    await open('workshop', 'incidents.year', { year: '2026' });
    const card = await screen.findByTestId(`incident-${CARD}`);
    const stages = within(card).getByRole('list', { name: 'Stages' });
    const items = within(stages).getAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('data-status'))).toEqual([
      'completed',
      'open',
      'open',
      'open',
      'open',
    ]);
    expect(items[0]).toHaveTextContent('Triage');
    expect(items[0]).toHaveTextContent('Completed');
    const suspicious = screen.getByTestId(`incident-${SUSPICIOUS}`);
    expect(
      within(suspicious)
        .getAllByRole('listitem')
        .filter((item) => item.getAttribute('data-status') === 'not-applicable'),
    ).toHaveLength(2);
    expect(suspicious).toHaveTextContent('No deadline applies');
    expect(suspicious).not.toHaveTextContent('Severity');
  });

  it('draws the missed deadlines of a released incident as a fact, and of one that is open as a box', async () => {
    await open('workshop', 'incidents.year', { year: '2025' });
    const newsletter = await screen.findByTestId('incident-01JZ3B5D7F9H1K3N5Q7S9V1X3Z');
    expect(newsletter).toHaveTextContent('One deadline missed');
    expect(newsletter.querySelector('.reason')).toBeNull();
    resetKit();
    document.body.innerHTML = '';
    await open('workshop', 'incidents.year', { year: '2026' });
    expect((await screen.findByTestId(`incident-${CARD}`)).querySelector('.reason')).not.toBeNull();
  });

  it('shows a released incident as released, with no deadline open', async () => {
    await open('workshop', 'incidents.year', { year: '2026' });
    const outage = await screen.findByTestId(`incident-${OUTAGE}`);
    expect(outage).toHaveTextContent('Released as v1');
    expect(outage).toHaveTextContent('0 open, 4 met');
  });

  it('offers New incident to a person who may edit the current year', async () => {
    await open('workshop', 'incidents.year', { year: '2026' });
    const link = await screen.findByTestId('new-incident-link');
    expect(link).toHaveTextContent('New incident');
    expect(link).toHaveAttribute('href', '/incidents/2026/new');
  });

  it('offers it to nobody for an earlier year, nor to a person who may only read', async () => {
    await open('workshop', 'incidents.year', { year: '2025' });
    await screen.findByTestId('incident-list');
    expect(screen.queryByTestId('new-incident-link')).toBeNull();
  });

  it('leaves the act out for a person who may only read', async () => {
    await open('read-only', 'incidents.year', { year: '2026' });
    await screen.findByTestId('incident-list');
    expect(screen.queryByTestId('new-incident-link')).toBeNull();
  });

  it('is the not-found view for a year that has no repository', async () => {
    await open('workshop', 'incidents.year', { year: '2024' });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('is the not-found view for a year the person has no right on: the register answers 404', async () => {
    await open('release', 'incidents.year', { year: '2026' });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('tells a person whose right was withdrawn meanwhile, in place of the list', async () => {
    await open('workshop', 'incidents.year', { year: '2026' }, {}, 'en', {
      'GET /api/v1/incidents/2026': Response.json({ outcome: 'FORBIDDEN' }, { status: 403 }),
    });
    expect(await screen.findByTestId('incidents-forbidden')).toHaveTextContent(
      'This year is not open to you',
    );
    expect(screen.queryByTestId('incident-list')).toBeNull();
  });

  it('shows the incidents the person has made since the list was read, when the stream names one', async () => {
    const kit = await open('workshop', 'incidents.year', { year: '2026' });
    await screen.findByTestId('incident-list');
    const before = kit.requests.filter(
      (request) => request === 'GET /api/v1/incidents/2026',
    ).length;
    kit.emit('document-created', { repository: 'isms-incidents-2026', id: 'X', kind: 'incident' });
    await vi.waitFor(() =>
      expect(
        kit.requests.filter((request) => request === 'GET /api/v1/incidents/2026'),
      ).toHaveLength(before + 1),
    );
    expect(kit.requests.filter((request) => request === 'GET /api/v1/incidents')).toHaveLength(2);
  });

  it('ignores the stream of another repository', async () => {
    const kit = await open('workshop', 'incidents.year', { year: '2026' });
    await screen.findByTestId('incident-list');
    const before = kit.requests.length;
    kit.emit('document-saved', { repository: 'threat-models', id: 'X', fields: [] });
    kit.emit('catalog-changed', {});
    expect(kit.requests).toHaveLength(before);
  });

  it('follows the clock: the deadline missed in a later state is counted', async () => {
    await open('workshop#incident-clock-advanced', 'incidents', {});
    expect(await screen.findByTestId('year-2026')).toHaveTextContent(
      '2 incidents with a missed deadline',
    );
  });
});

describe('the address of an incident', () => {
  it('is the not-found view for an incident that does not exist', async () => {
    await open('workshop', 'incidents.incident', { year: '2026', incident: 'nope' });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('is the not-found view for an earlier state that does not exist, and for one that is no revision', async () => {
    await open('workshop', 'incidents.incident', { year: '2026', incident: OUTAGE }, { at: 'v9' });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('is the not-found view for an incident the person has no right on', async () => {
    await open('release', 'incidents.incident', { year: '2026', incident: CARD });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('tells a person whose right was withdrawn meanwhile, in place of the sheet', async () => {
    await open('workshop', 'incidents.incident', { year: '2026', incident: CARD }, {}, 'en', {
      [`GET /api/v1/incidents/2026/${CARD}`]: Response.json(
        { outcome: 'FORBIDDEN' },
        { status: 403 },
      ),
    });
    expect(await screen.findByTestId('incidents-forbidden')).toBeInTheDocument();
    expect(screen.queryByTestId('incident-sheet')).toBeNull();
  });

  it('leaves the not-found view when the address goes back to a state that exists', async () => {
    await useProfile('workshop', 'en');
    const params = { year: '2026', incident: OUTAGE };
    const { rerender } = render(IncidentsView, {
      route: 'incidents.incident',
      params,
      query: { at: 'v9' },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
    await rerender({ route: 'incidents.incident', params, query: {}, onnavigate: vi.fn() });
    expect(await screen.findByTestId('incident-sheet')).toBeInTheDocument();
    expect(screen.queryByTestId('not-found-view')).toBeNull();
  });

  it('opens the sheet of an earlier year, which is read only for a person with the read right', async () => {
    await open('workshop', 'incidents.incident', { year: '2025', incident: LAPTOP });
    expect(await screen.findByTestId('incident-sheet')).toHaveTextContent(
      'Laptop with customer extracts lost',
    );
    expect(screen.getByTestId('document-state')).toHaveTextContent('Released as v1');
    expect(screen.queryByTestId('save-everyone')).toBeNull();
  });
});
