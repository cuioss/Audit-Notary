import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DeadlineClock, { type ClockRow } from './DeadlineClock.svelte';
import StageTabs, { toneOf, type StageTab } from './StageTabs.svelte';

/**
 * The two components of a staged document with deadlines (doc/concepts/visual-design.adoc, Stage tabs and the deadline clock):
 * the tabs of the stages and the clock of the notification deadlines.
 */
const TABS: StageTab[] = [
  {
    id: 'triage',
    label: 'Triage',
    status: 'completed',
    statusLabel: 'Completed',
    note: null,
    marker: null,
    flag: null,
  },
  {
    id: 'privacy',
    label: 'Privacy',
    status: 'not-applicable',
    statusLabel: 'Does not apply',
    note: 'Applies when personal data is affected',
    marker: null,
    flag: null,
  },
  {
    id: 'response',
    label: 'Response',
    status: 'completed',
    statusLabel: 'Completed',
    note: null,
    marker: 'Signed off before an earlier stage was reopened',
    flag: 'Conflict',
  },
  {
    id: 'review',
    label: 'Review',
    status: 'open',
    statusLabel: 'Open',
    note: null,
    marker: null,
    flag: null,
  },
];

describe('StageTabs', () => {
  function show(selected = 'triage', onselect = vi.fn()) {
    render(StageTabs, {
      label: 'Stages',
      tabs: TABS,
      selected,
      panel: 'panel',
      onselect,
      testId: 'tabs',
    });
    return onselect;
  }

  it('is a list of tabs with the selected one in the tab order, each naming its panel', () => {
    show('response');
    const list = screen.getByRole('tablist', { name: 'Stages' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '-1', '0', '-1']);
    expect(tabs[0]).toHaveAttribute('aria-controls', 'panel');
    expect(tabs[0]).toHaveAttribute('id', 'stage-tab-triage');
  });

  it('says the status of every stage in words, the condition of one that does not apply, the marker and the flag', () => {
    show();
    expect(screen.getByTestId('tabs-triage')).toHaveTextContent('Triage Completed');
    const greyed = screen.getByTestId('tabs-privacy');
    expect(greyed).toHaveAttribute('data-status', 'not-applicable');
    expect(greyed).toHaveTextContent('Does not apply');
    expect(greyed).toHaveTextContent('Applies when personal data is affected');
    const reopened = screen.getByTestId('tabs-response');
    expect(reopened).toHaveTextContent('Signed off before an earlier stage was reopened');
    expect(reopened).toHaveTextContent('Conflict');
  });

  it('chooses a stage with a click, and a stage that does not apply too, so its kept data can be read', async () => {
    const onselect = show();
    await fireEvent.click(screen.getByTestId('tabs-privacy'));
    expect(onselect).toHaveBeenCalledWith('privacy');
  });

  it('moves the focus with the arrow keys, Home and End, and chooses nothing until the person does', async () => {
    const onselect = show('triage');
    const first = screen.getByTestId('tabs-triage');
    first.focus();
    await fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByTestId('tabs-privacy')).toHaveFocus();
    await fireEvent.keyDown(screen.getByTestId('tabs-privacy'), { key: 'End' });
    expect(screen.getByTestId('tabs-review')).toHaveFocus();
    await fireEvent.keyDown(screen.getByTestId('tabs-review'), { key: 'ArrowRight' });
    expect(first).toHaveFocus();
    await fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(screen.getByTestId('tabs-review')).toHaveFocus();
    await fireEvent.keyDown(screen.getByTestId('tabs-review'), { key: 'Home' });
    expect(first).toHaveFocus();
    await fireEvent.keyDown(first, { key: 'x' });
    expect(first).toHaveFocus();
    expect(onselect).not.toHaveBeenCalled();
  });

  it('gives every status its tone', () => {
    expect([toneOf('completed'), toneOf('open'), toneOf('not-applicable')]).toEqual([
      'success',
      'running',
      'neutral',
    ]);
  });
});

describe('DeadlineClock', () => {
  const ROWS: ClockRow[] = [
    {
      key: 'gdpr-art33/',
      name: 'Notice to the authority',
      basis: 'GDPR Art. 33',
      status: 'MISSED',
      statusLabel: 'Missed',
      needsYou: true,
      due: '2026-11-22T07:40:00Z',
      dueText: '22 Nov 07:40',
      detail: 'Overdue by 4 days',
    },
    {
      key: 'nis2-early-warning/',
      name: 'Early warning',
      basis: 'NIS2',
      status: 'MET',
      statusLabel: 'Met',
      needsYou: false,
      due: '2026-11-20T07:40:00Z',
      dueText: '20 Nov 07:40',
      detail: 'Sent 20 Nov 06:55',
    },
    {
      key: 'nis2-final-report/',
      name: 'Final report',
      basis: 'NIS2',
      status: 'OPEN',
      statusLabel: 'Open',
      needsYou: false,
      due: null,
      dueText: null,
      detail: 'The clock starts when the time it depends on is recorded.',
    },
  ];

  it('lists every deadline with its name, its basis, its state and what is known of the time', () => {
    render(DeadlineClock, { label: 'Deadlines', rows: ROWS, testId: 'clock' });
    const list = screen.getByRole('list', { name: 'Deadlines' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    const missed = screen.getByTestId('clock-gdpr-art33-');
    expect(missed).toHaveAttribute('data-status', 'MISSED');
    expect(missed).toHaveTextContent('Notice to the authority');
    expect(missed).toHaveTextContent('GDPR Art. 33');
    expect(missed).toHaveTextContent('Overdue by 4 days');
    expect(missed.querySelector('time')).toHaveAttribute('datetime', '2026-11-22T07:40:00Z');
  });

  it('draws a deadline that needs the person as a box and the others as a dot with the word', () => {
    render(DeadlineClock, { label: 'Deadlines', rows: ROWS, testId: 'clock' });
    expect(screen.getByTestId('clock-gdpr-art33-').querySelector('.reason')).not.toBeNull();
    expect(screen.getByTestId('clock-nis2-early-warning-').querySelector('.reason')).toBeNull();
    expect(screen.getByTestId('clock-nis2-early-warning-')).toHaveTextContent('Met');
  });

  it('shows no time for a clock that has not started', () => {
    render(DeadlineClock, { label: 'Deadlines', rows: ROWS, testId: 'clock' });
    const row = screen.getByTestId('clock-nis2-final-report-');
    expect(row.querySelector('time')).toBeNull();
    expect(row).toHaveTextContent('The clock starts when the time it depends on is recorded.');
  });

  it('carries no mascot, no seal and no picture: it is sober; only a box has its alert mark', () => {
    const { container } = render(DeadlineClock, { label: 'Deadlines', rows: ROWS });
    expect(container.querySelector('.mascot, svg, img, .seal')).toBeNull();
    expect(container.querySelectorAll('[data-icon]')).toHaveLength(1);
  });
});
