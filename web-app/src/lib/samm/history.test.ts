import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { HistoryLine, SammModel } from '../api/types';
import { translate } from '../i18n';
import { SCENARIO_DIR } from '../test/scenarioFetch';
import { historyEntries } from './history';

const model = JSON.parse(
  fs.readFileSync(path.join(SCENARIO_DIR, 'data', 'samm-model-v2.2.0.json'), 'utf8'),
) as SammModel;

const NOW = new Date('2026-11-25T12:00:00Z');
const by = { pseudonym: 'p-1', name: 'Alex Example' };

describe('historyEntries', () => {
  it('words each kind of line and names the practice from the model', () => {
    const lines: HistoryLine[] = [
      { at: '2026-11-25T11:00:00Z', by, kind: 'save', part: 'sm', count: 2 },
      { at: '2026-11-24T08:00:00Z', by, kind: 'release', tag: 'assessments/payments/v1' },
      { at: '2026-11-20T08:00:00Z', by, kind: 'submit' },
      { at: '2026-11-01T08:00:00Z', by, kind: 'create' },
    ];
    const entries = historyEntries(lines, model, translate, 'en', NOW);
    expect(entries.map((entry) => entry.what)).toEqual([
      'Saved 2 answers in Strategy and Metrics',
      'Released it as v1',
      'Submitted it for review',
      'Started the assessment',
    ]);
    expect(entries[0]).toMatchObject({ who: 'Alex Example', when: '1 hour ago', release: false });
    expect(entries[1].release).toBe(true);
    expect(entries[2].when).toContain('2026');
    expect(entries[0].key).toBe('2026-11-25T11:00:00Z-0');
  });

  it('keeps the part id without a model or for an unknown practice', () => {
    const lines: HistoryLine[] = [
      { at: '2026-11-25T11:00:00Z', by, kind: 'save', part: 'nope' },
      { at: '2026-11-25T11:00:00Z', by, kind: 'save', part: 'sm', count: 1 },
      { at: '2026-11-25T11:00:00Z', by, kind: 'save' },
      { at: '2026-11-25T11:00:00Z', by, kind: 'release' },
    ];
    const entries = historyEntries(lines.slice(0, 1), model, translate, 'en', NOW);
    expect(entries[0].what).toBe('Saved 0 answers in nope');
    const bare = historyEntries(lines.slice(1), null, translate, 'en', NOW);
    expect(bare.map((entry) => entry.what)).toEqual([
      'Saved one answer in sm',
      'Saved 0 answers in ',
      'Released it as ',
    ]);
  });
});
