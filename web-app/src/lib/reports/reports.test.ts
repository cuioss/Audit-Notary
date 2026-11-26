import { describe, expect, it } from 'vitest';
import type { ThreatEvaluationModel } from '../api/types';
import { dayNumber, daysBetween, placeLabels, slotOf, thinTicks } from './chart';
import {
  asOfErrorKey,
  compareAddress,
  intervalMonths,
  isAsOfText,
  isDateText,
  linkTarget,
  needRank,
  ratingTone,
  riskRegisterAddress,
  sortModels,
  statusTone,
  trendAddress,
} from './reports';

/**
 * The helpers of the lens Reports: the addresses it writes, the words of its statuses, the arithmetic of its charts and the
 * order of the threat evaluation.
 */
function model(service: string, name: string, open: number, untreated: number) {
  return {
    service: { id: service, name },
    model: `${service}-model`,
    threats: { total: open, open, untreated, transferred: 0 },
  } as ThreatEvaluationModel;
}

describe('the addresses of the reports', () => {
  it('writes the canonical address with only the names that have a value', () => {
    expect(trendAddress()).toBe('/reports/samm-trend');
    expect(trendAddress('payments')).toBe('/reports/samm-trend?scope=payments');
    expect(compareAddress()).toBe('/reports/samm-compare');
    expect(compareAddress('payments')).toBe('/reports/samm-compare?scope=payments');
    expect(compareAddress('payments', '2025-q4', '2026-q2')).toBe(
      '/reports/samm-compare?scope=payments&from=2025-q4&to=2026-q2',
    );
    // from and to are meaningless without a scope: they are left out.
    expect(compareAddress(undefined, '2025-q4', '2026-q2')).toBe('/reports/samm-compare');
    expect(riskRegisterAddress()).toBe('/reports/risk-register');
    expect(riskRegisterAddress('audit-2026-03')).toBe('/reports/risk-register?as-of=audit-2026-03');
  });

  it('refuses a value the address would not admit', () => {
    expect(() => riskRegisterAddress('no spaces')).toThrow();
  });
});

describe('the value of as-of', () => {
  it('admits a day and the name of a tag, and no other form', () => {
    expect(isAsOfText('2026-03-01')).toBe(true);
    expect(isAsOfText('risks/R-012/v2')).toBe(true);
    expect(isAsOfText('')).toBe(false);
    expect(isAsOfText('-leading')).toBe(false);
    expect(isAsOfText('two words')).toBe(false);
    expect(isAsOfText('a'.repeat(129))).toBe(false);
  });

  it('tells a day from a tag by its form', () => {
    expect(isDateText('2026-03-01')).toBe(true);
    expect(isDateText('audit-2026-03')).toBe(false);
  });

  it('words every code of the refusal', () => {
    expect(asOfErrorKey('FUTURE')).toBe('reports.risk.asof.future');
    expect(asOfErrorKey('UNKNOWN_TAG')).toBe('reports.risk.asof.unknown-tag');
    expect(asOfErrorKey('PATTERN')).toBe('reports.risk.asof.pattern');
    expect(asOfErrorKey('SOMETHING_ELSE')).toBe('reports.risk.asof.pattern');
  });
});

describe('the words of a status', () => {
  it('draws a review in date as success and the others as neutral dots', () => {
    expect(statusTone('ok')).toBe('success');
    expect(statusTone('unreleased')).toBe('neutral');
  });

  it('marks the two highest ratings and leaves the others quiet', () => {
    expect(ratingTone('critical')).toBe('danger');
    expect(ratingTone('high')).toBe('attention');
    expect(ratingTone('medium')).toBe('neutral');
    expect(ratingTone('low')).toBe('neutral');
  });

  it('reads the months of a review interval', () => {
    expect(intervalMonths('P6M')).toBe(6);
    expect(intervalMonths('P24M')).toBe(24);
    expect(intervalMonths('P1Y')).toBeNull();
    expect(intervalMonths('')).toBeNull();
  });

  it('ranks the highest protection need first', () => {
    expect(needRank('very-high')).toBeLessThan(needRank('high'));
    expect(needRank('high')).toBeLessThan(needRank('normal'));
  });
});

describe('the order of the threat evaluation', () => {
  const rows = [model('b', 'Beta', 2, 1), model('a', 'alpha', 5, 0), model('c', 'Gamma', 5, 4)];

  it('keeps the order of the server for the review due', () => {
    expect(sortModels(rows, 'due', 'en').map((row) => row.service.id)).toEqual(['b', 'a', 'c']);
  });

  it('orders by the name of the service without regard to case', () => {
    expect(sortModels(rows, 'service', 'en').map((row) => row.service.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders by the most open threats, then the name', () => {
    expect(sortModels(rows, 'open', 'en').map((row) => row.service.id)).toEqual(['a', 'c', 'b']);
  });

  it('orders by the most untreated threats', () => {
    expect(sortModels(rows, 'untreated', 'en').map((row) => row.service.id)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('does not change the list it was given', () => {
    const before = rows.map((row) => row.service.id);
    sortModels(rows, 'service', 'en');
    expect(rows.map((row) => row.service.id)).toEqual(before);
  });
});

describe('the arithmetic of the charts', () => {
  it('gives five slots and none to a sixth series', () => {
    expect([0, 1, 2, 3, 4].map(slotOf)).toEqual([1, 2, 3, 4, 5]);
    expect(slotOf(5)).toBeNull();
    expect(slotOf(-1)).toBeNull();
  });

  it('counts days without the time zone', () => {
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(daysBetween('2026-11-26', '2026-12-01')).toBe(5);
    expect(daysBetween('2026-12-01', '2026-11-26')).toBe(-5);
  });

  it('keeps the labels that fit, the first and the last before the rest', () => {
    const ticks = [0, 1, 2, 3, 4].map((x) => ({ x, label: 'Q1 2026' }));
    // 100 px apart: every label of 7 characters fits.
    expect(thinTicks(ticks, (x) => x * 100)).toHaveLength(5);
    // 30 px apart: only labels whose centres are 56 px apart or more stay, the ends first.
    const thin = thinTicks(ticks, (x) => x * 30);
    expect(thin[0]).toBe(ticks[0]);
    expect(thin.at(-1)).toBe(ticks[4]);
    expect(thin.length).toBeLessThan(5);
  });

  it('gives way with the last label when the ends clash', () => {
    const ticks = [0, 1, 2].map((x) => ({ x, label: 'a long label' }));
    expect(thinTicks(ticks, (x) => x * 5)).toEqual([ticks[0]]);
  });

  it('measures a label that would leave the figure where it is drawn, at the edge', () => {
    // Centres 80 px apart clear each other (labels of 62 px and a gap of 12), unless the edge pushes the last inwards.
    const ticks = [
      { x: 0, label: 'abcdefghij' },
      { x: 1, label: 'abcdefghij' },
      { x: 2, label: 'abcdefghij' },
    ];
    const position = (x: number) => 40 + x * 80;
    expect(thinTicks(ticks, position)).toHaveLength(3);
    expect(thinTicks(ticks, position, 210).map((tick) => tick.x)).toEqual([0, 2]);
  });

  it('leaves one or two labels alone', () => {
    const ticks = [{ x: 0, label: 'a' }];
    expect(thinTicks(ticks, () => 0)).toBe(ticks);
  });

  it('moves labels that stand close together apart and leaves the others', () => {
    // Two at the same place, one far away in x, one far away in y.
    const placed = placeLabels([
      { x: 100, y: 50 },
      { x: 100, y: 52 },
      { x: 300, y: 51 },
      { x: 100, y: 120 },
    ]);
    expect(placed[0]).toBe(50);
    expect(placed[1]).toBe(63);
    expect(placed[2]).toBe(51);
    expect(placed[3]).toBe(120);
  });

  it('moves a cascade that would leave the room up instead of down', () => {
    const placed = placeLabels(
      [
        { x: 100, y: 180 },
        { x: 100, y: 182 },
        { x: 100, y: 184 },
        { x: 100, y: 186 },
      ],
      13,
      40,
      192,
    );
    expect(placed).toEqual([153, 166, 179, 192]);
  });

  it('keeps the order of the labels it was given', () => {
    const placed = placeLabels([
      { x: 0, y: 90 },
      { x: 0, y: 10 },
    ]);
    expect(placed).toEqual([90, 10]);
  });
});

describe('linkTarget', () => {
  it('keeps the addresses of the app, with the revision of an entry', () => {
    expect(linkTarget('/isms/risks/r-004?at=v1')).toBe('/isms/risks/r-004?at=v1');
    expect(linkTarget('/reports/risk-register?as-of=2026-03-01')).toBe(
      '/reports/risk-register?as-of=2026-03-01',
    );
  });

  it('refuses what is not an address of the app', () => {
    for (const bad of [
      'javascript:alert(1)',
      'https://example.org/isms/risks/r-004',
      '//example.org/isms/risks/r-004',
      '/isms/risks/r-004?at=<script>',
      '/isms/risks/r-004?next=https://example.org',
      '',
      null,
      undefined,
    ]) {
      expect(linkTarget(bad)).toBeNull();
    }
  });
});
