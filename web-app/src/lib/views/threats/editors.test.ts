import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OtmMitigation, OtmThreat } from '../../api/types';
import { currentLocale, messagesStore } from '../../i18n';
import { mockMessages } from '../../test/scenarioFetch';
import CountermeasureEditor from './CountermeasureEditor.svelte';
import ThreatDiffValue from './ThreatDiffValue.svelte';
import ThreatTable from './ThreatTable.svelte';

/**
 * The tables of the threats and of the countermeasures on their own (AUN-TEST-1, the form kit's `DataTable` underneath):
 * what the dialogs refuse, what a refusal of the server says at a row, the limits, the order, and a list that was replaced
 * while a dialog was open.
 */
beforeEach(() => {
  currentLocale.set('en');
  messagesStore.set(mockMessages('en'));
});

afterEach(() => {
  document.body.innerHTML = '';
});

function threat(id: string, over: Partial<OtmThreat> = {}): OtmThreat {
  return {
    id,
    name: `Threat ${id}`,
    categories: ['Spoofing'],
    risk: { likelihood: 10, impact: 20 },
    attributes: { status: 'open' },
    ...over,
  };
}

function mitigation(id: string, about: string, over: Partial<OtmMitigation> = {}): OtmMitigation {
  return {
    id,
    name: `Countermeasure ${id}`,
    riskReduction: 50,
    attributes: { threat: about },
    ...over,
  };
}

const change = (testId: string, value: string) =>
  fireEvent.input(screen.getByTestId(testId), { target: { value } });

describe('ThreatTable', () => {
  it('says that there is no threat and offers the first one', () => {
    render(ThreatTable, { threats: [], mitigations: [] });
    expect(screen.getByText('No threat yet. Add the first one.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a threat' })).toBeInTheDocument();
  });

  it('shows the threats as read when it is read only: the words of the status, no act', () => {
    render(ThreatTable, {
      threats: [threat('T-01', { attributes: { status: 'mitigated' } })],
      mitigations: [mitigation('M-01', 'T-01')],
      readonly: true,
    });
    expect(screen.getByTestId('threat-status-T-01')).toHaveTextContent('Mitigated');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('One countermeasure')).toBeInTheDocument();
  });

  it('names a transferred threat and shows no link for a reference the app does not know', () => {
    render(ThreatTable, {
      threats: [
        threat('T-01', {
          attributes: { status: 'accepted', transferred: 'isms-register:risk/R-9' },
        }),
        threat('T-02', { attributes: { status: 'accepted', transferred: 'somewhere:else' } }),
      ],
      mitigations: [],
      readonly: true,
    });
    expect(within(screen.getByTestId('threat-transferred-T-01')).getByRole('link')).toHaveAttribute(
      'href',
      '/isms/risks/r-9',
    );
    expect(screen.getByTestId('threat-transferred-T-02')).toHaveTextContent('Transferred to risk');
    expect(within(screen.getByTestId('threat-transferred-T-02')).queryByRole('link')).toBeNull();
    // Transferred, treated by nothing and not open: nothing needs the person.
    expect(screen.queryByTestId('threat-untreated-T-01')).toBeNull();
  });

  it('keeps the status it was given and ignores an empty choice', async () => {
    const onchange = vi.fn();
    render(ThreatTable, { threats: [threat('T-01')], mitigations: [], onchange });
    await fireEvent.change(screen.getByTestId('threat-status-T-01'), { target: { value: '' } });
    await fireEvent.change(screen.getByTestId('threat-status-T-01'), { target: { value: 'open' } });
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.change(screen.getByTestId('threat-status-T-01'), {
      target: { value: 'accepted' },
    });
    expect(onchange).toHaveBeenCalledWith(
      [expect.objectContaining({ attributes: { status: 'accepted' } })],
      [],
    );
  });

  it('refuses a name and a number that the schema would refuse, and says which', async () => {
    const onchange = vi.fn();
    render(ThreatTable, { threats: [], mitigations: [], onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Add a threat' }));
    await change('threats-field-name', 'x'.repeat(201));
    await change('threats-field-description', 'y'.repeat(2001));
    await change('threats-field-likelihood', '-1');
    await fireEvent.click(screen.getByTestId('threats-apply'));
    expect(screen.getAllByText('This text is too long.')).toHaveLength(2);
    expect(screen.getAllByText('Enter a whole number from 0 to 100.')).toHaveLength(1);
    expect(onchange).not.toHaveBeenCalled();
  });

  it('removes the description that was emptied and keeps the kinds in the order of the six', async () => {
    const onchange = vi.fn();
    render(ThreatTable, {
      threats: [threat('T-01', { description: 'Old', categories: ['Tampering', 'Spoofing'] })],
      mitigations: [],
      onchange,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit T-01' }));
    await change('threats-field-description', '   ');
    await fireEvent.click(screen.getByTestId('threats-category-repudiation'));
    await fireEvent.click(screen.getByTestId('threats-category-tampering'));
    await fireEvent.click(screen.getByTestId('threats-apply'));
    const [threats] = onchange.mock.calls[0];
    expect(threats[0]).not.toHaveProperty('description');
    expect(threats[0].categories).toEqual(['Spoofing', 'Repudiation']);
  });

  it('says so, and applies nothing, when the threat was removed by someone else while the dialog was open', async () => {
    const onchange = vi.fn();
    const { rerender } = render(ThreatTable, {
      threats: [threat('T-01'), threat('T-02')],
      mitigations: [],
      onchange,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit T-02' }));
    await rerender({ threats: [threat('T-01')], mitigations: [], onchange });
    await fireEvent.click(screen.getByTestId('threats-apply'));
    expect(screen.getByTestId('threats-dialog-note')).toHaveTextContent(
      'Someone else removed this threat',
    );
    expect(onchange).not.toHaveBeenCalled();
  });

  it('follows a threat that moved while the dialog was open, by its id', async () => {
    const onchange = vi.fn();
    const { rerender } = render(ThreatTable, {
      threats: [threat('T-01'), threat('T-02')],
      mitigations: [],
      onchange,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit T-02' }));
    await rerender({ threats: [threat('T-02'), threat('T-01')], mitigations: [], onchange });
    await change('threats-field-name', 'Renamed');
    await fireEvent.click(screen.getByTestId('threats-apply'));
    expect(onchange.mock.calls[0][0].map((entry: OtmThreat) => entry.name)).toEqual([
      'Renamed',
      'Threat T-01',
    ]);
  });

  it('refuses a new threat when the model holds the most it may', async () => {
    const full = Array.from({ length: 200 }, (_, index) => threat(`T-${index + 1}`));
    render(ThreatTable, { threats: full, mitigations: [] });
    expect(screen.getByText('At most 200 rows.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a threat' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('refuses a new threat that the list filled up for while the dialog was open', async () => {
    const onchange = vi.fn();
    const full = Array.from({ length: 200 }, (_, index) => threat(`T-${index + 1}`));
    const { rerender } = render(ThreatTable, { threats: full.slice(1), mitigations: [], onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Add a threat' }));
    await change('threats-field-name', 'One too many');
    await rerender({ threats: full, mitigations: [], onchange });
    await fireEvent.click(screen.getByTestId('threats-apply'));
    expect(screen.getByTestId('threats-dialog-note')).toHaveTextContent('At most 200 rows.');
    expect(onchange).not.toHaveBeenCalled();
  });

  it('moves a threat up and down, and a move drops the row numbers of an old refusal', async () => {
    const onchange = vi.fn();
    render(ThreatTable, {
      threats: [threat('T-01'), threat('T-02')],
      mitigations: [],
      errors: { 0: { name: 'REQUIRED' } },
      onchange,
    });
    expect(screen.getByTestId('threats-errors')).toHaveTextContent('Row 1: Fill in this field.');
    await fireEvent.click(screen.getByRole('button', { name: 'Move down, T-01' }));
    expect(onchange.mock.calls[0][0].map((entry: OtmThreat) => entry.id)).toEqual(['T-02', 'T-01']);
    expect(screen.queryByTestId('threats-errors')).toBeNull();
  });

  it('shows the refusal of the list itself under the table', () => {
    render(ThreatTable, {
      threats: [threat('T-01')],
      mitigations: [],
      errors: { [-1]: { list: 'MAX_ITEMS' } },
    });
    expect(screen.getByText('There are too many entries.')).toBeInTheDocument();
  });

  it('ignores the removal of a threat that is already gone', async () => {
    const onchange = vi.fn();
    const { rerender } = render(ThreatTable, {
      threats: [threat('T-01')],
      mitigations: [],
      onchange,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove T-01' }));
    await rerender({ threats: [], mitigations: [], onchange });
    await fireEvent.click(screen.getByTestId('threats-remove-confirm'));
    expect(onchange).not.toHaveBeenCalled();
  });
});

describe('CountermeasureEditor', () => {
  it('says that there is no countermeasure, and that a threat comes first when there is none', () => {
    render(CountermeasureEditor, { mitigations: [], threats: [] });
    expect(screen.getByText(/No countermeasure yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a countermeasure' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(
      screen.getByText('Add a threat first: a countermeasure belongs to one threat.'),
    ).toBeInTheDocument();
  });

  it('marks a countermeasure whose threat is not in the model', () => {
    render(CountermeasureEditor, {
      mitigations: [mitigation('M-01', 'T-99')],
      threats: [threat('T-01')],
      readonly: true,
    });
    expect(screen.getByTestId('mitigation-unknown-M-01')).toHaveTextContent('Unknown threat');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows what a countermeasure says: planned or not stated, the reduction, no issue named', () => {
    render(CountermeasureEditor, {
      mitigations: [
        mitigation('M-01', 'T-01'),
        mitigation('M-02', 'T-01', {
          description: 'Done in the filter.',
          attributes: { threat: 'T-01', status: 'implemented', issues: ['A-1'] },
        }),
      ],
      threats: [threat('T-01')],
      readonly: true,
    });
    const first = screen.getByTestId('mitigation-M-01').closest('tr') as HTMLElement;
    expect(first).toHaveTextContent('Not stated');
    expect(first).toHaveTextContent('No issue named');
    expect(first).toHaveTextContent('Risk reduction 50');
    const second = screen.getByTestId('mitigation-M-02').closest('tr') as HTMLElement;
    expect(second).toHaveTextContent('Implemented');
    expect(second).toHaveTextContent('Done in the filter.');
    expect(second).toHaveTextContent('A-1');
  });

  it('refuses what the schema would refuse, and says which field', async () => {
    const onchange = vi.fn();
    render(CountermeasureEditor, { mitigations: [], threats: [threat('T-01')], onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Add a countermeasure' }));
    await change('mitigations-field-name', 'x'.repeat(201));
    await change('mitigations-field-description', 'y'.repeat(2001));
    await change('mitigations-field-reduction', 'many');
    await change(
      'mitigations-field-issues',
      Array.from({ length: 21 }, (_, index) => `I-${index}`).join(' '),
    );
    await fireEvent.click(screen.getByTestId('mitigations-apply'));
    expect(screen.getAllByText('This text is too long.')).toHaveLength(2);
    expect(screen.getAllByText('Fill in this field.').length).toBeGreaterThan(0);
    expect(screen.getByText('At most 20 issues.')).toBeInTheDocument();
    expect(onchange).not.toHaveBeenCalled();
    await change('mitigations-field-issues', 'x'.repeat(65));
    expect(screen.getAllByText('This text is too long.').length).toBeGreaterThan(2);
  });

  it('keeps the unknown members of a countermeasure and drops the status and the issues that were emptied', async () => {
    const onchange = vi.fn();
    render(CountermeasureEditor, {
      mitigations: [
        mitigation('M-01', 'T-01', {
          description: 'Old',
          attributes: { threat: 'T-01', status: 'planned', issues: ['A-1'] },
        }),
      ],
      threats: [threat('T-01')],
      onchange,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit M-01' }));
    await fireEvent.change(screen.getByTestId('mitigations-field-status'), {
      target: { value: '' },
    });
    await change('mitigations-field-issues', '');
    await change('mitigations-field-description', '');
    await fireEvent.click(screen.getByTestId('mitigations-apply'));
    const [list] = onchange.mock.calls[0];
    expect(list[0]).toEqual({
      id: 'M-01',
      name: 'Countermeasure M-01',
      riskReduction: 50,
      attributes: { threat: 'T-01' },
    });
  });

  it('says so when the countermeasure or its threat was removed while the dialog was open', async () => {
    const onchange = vi.fn();
    const { rerender } = render(CountermeasureEditor, {
      mitigations: [mitigation('M-01', 'T-01')],
      threats: [threat('T-01')],
      onchange,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit M-01' }));
    await rerender({ mitigations: [], threats: [threat('T-01')], onchange });
    await fireEvent.click(screen.getByTestId('mitigations-apply'));
    expect(screen.getByTestId('mitigations-dialog-note')).toHaveTextContent(
      'Someone else removed this countermeasure',
    );
    await fireEvent.click(screen.getByTestId('mitigations-cancel'));

    await fireEvent.click(screen.getByRole('button', { name: 'Add a countermeasure' }));
    await change('mitigations-field-name', 'New');
    await fireEvent.change(screen.getByTestId('mitigations-field-threat'), {
      target: { value: 'T-01' },
    });
    await rerender({ mitigations: [], threats: [threat('T-02')], onchange });
    await fireEvent.click(screen.getByTestId('mitigations-apply'));
    expect(screen.getByTestId('mitigations-dialog-note')).toHaveTextContent(
      'Someone else removed the threat you chose',
    );
    expect(onchange).not.toHaveBeenCalled();
  });

  it('moves, removes after asking, and shows the refusal at the row', async () => {
    const onchange = vi.fn();
    render(CountermeasureEditor, {
      mitigations: [mitigation('M-01', 'T-01'), mitigation('M-02', 'T-01')],
      threats: [threat('T-01')],
      errors: { 1: { attributes: 'REFERENCE_NOT_FOUND' } },
      onchange,
    });
    expect(screen.getByTestId('mitigations-errors')).toHaveTextContent(
      'Row 2: This reference leads nowhere.',
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Remove M-02' }));
    expect(screen.getByText(/M-02, Countermeasure M-02, leaves this model/)).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('mitigations-remove-cancel'));
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Remove M-02' }));
    await fireEvent.click(screen.getByTestId('mitigations-remove-confirm'));
    expect(onchange.mock.calls[0][0].map((entry: OtmMitigation) => entry.id)).toEqual(['M-01']);
  });

  it('moves a countermeasure down', async () => {
    const onchange = vi.fn();
    render(CountermeasureEditor, {
      mitigations: [mitigation('M-01', 'T-01'), mitigation('M-02', 'T-01')],
      threats: [threat('T-01')],
      onchange,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Move down, M-01' }));
    expect(onchange.mock.calls[0][0].map((entry: OtmMitigation) => entry.id)).toEqual([
      'M-02',
      'M-01',
    ]);
  });
});

describe('ThreatDiffValue', () => {
  it('reads a threat as the approver wants it: the name, the status, the numbers, the kinds and the risk', () => {
    render(ThreatDiffValue, {
      list: 'threats',
      entry: threat('T-07', {
        categories: ['Spoofing', 'Information Disclosure'],
        attributes: { status: 'accepted', transferred: 'isms-register:risk/R-009' },
      }),
    });
    const entry = screen.getByTestId('diff-entry');
    expect(entry).toHaveTextContent('Threat T-07');
    expect(entry).toHaveTextContent('Accepted');
    expect(entry).toHaveTextContent('Likelihood: 10, Impact: 20');
    expect(entry).toHaveTextContent('Spoofing, Information disclosure');
    expect(entry).toHaveTextContent('Transferred to risk R-009');
  });

  it('reads a countermeasure with its threat, its status and its issues', () => {
    render(ThreatDiffValue, {
      list: 'mitigations',
      entry: mitigation('M-01', 'T-03', {
        attributes: { threat: 'T-03', status: 'planned', issues: ['A-1', 'A-2'] },
      }),
    });
    const entry = screen.getByTestId('diff-entry');
    expect(entry).toHaveTextContent('Treats T-03');
    expect(entry).toHaveTextContent('Planned');
    expect(entry).toHaveTextContent('Issues: A-1, A-2');
  });

  it('reads a countermeasure without a status, and an entry that is gone', () => {
    const { unmount } = render(ThreatDiffValue, {
      list: 'mitigations',
      entry: mitigation('M-01', 'T-03'),
    });
    expect(screen.getByTestId('diff-entry')).toHaveTextContent('Not stated');
    unmount();
    render(ThreatDiffValue, { list: 'threats', entry: null });
    expect(screen.getByTestId('diff-entry')).toHaveTextContent('Removed in this version');
  });
});

describe('the table of the form kit, named by its page', () => {
  it('names the acts of a row by its id and the act that adds one by its words', async () => {
    const { default: DataTable } = await import('../../forms/DataTable.svelte');
    const { createRawSnippet } = await import('svelte');
    render(DataTable, {
      caption: 'Things',
      columns: [{ key: 'a', label: 'A' }],
      rowCount: 2,
      empty: 'None',
      addLabel: 'Add a thing',
      rowName: (row: number) => `Thing ${row + 1}`,
      cell: createRawSnippet(() => ({ render: () => '<span>x</span>' })),
    });
    for (const name of [
      'Add a thing',
      'Edit Thing 1',
      'Remove Thing 2',
      'Move down, Thing 1',
      'Move up, Thing 2',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });
});
