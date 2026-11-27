import { describe, expect, it } from 'vitest';
import type { DocumentDiff, JsonSchema, OtmMitigation, OtmThreat } from '../api/types';
import {
  addMonths,
  categorySlug,
  componentNames,
  daysBetween,
  describeList,
  groupModelDiff,
  isDiagramUrl,
  isUntreated,
  issuesProblem,
  issuesText,
  mitigationsOf,
  modelAddress,
  modelSchemaOf,
  newAddress,
  nextId,
  omitProperties,
  parseIssues,
  percentOf,
  pickProperties,
  releaseAddress,
  riskOf,
  rowErrors,
  saveRank,
  serviceAddress,
  splitPointer,
  threatsOf,
  treatmentOf,
} from './model';

/**
 * What the lens Threat models knows of a threat model, without a component (rest-api.adoc, Threat Model Requests).
 */
const threat = (id: string, status: OtmThreat['attributes']['status'] = 'open'): OtmThreat => ({
  id,
  name: `Name ${id}`,
  risk: { likelihood: 1, impact: 2 },
  attributes: { status },
});

const mitigation = (id: string, about: string): OtmMitigation => ({
  id,
  name: `Name ${id}`,
  riskReduction: 10,
  attributes: { threat: about },
});

describe('the addresses', () => {
  it('writes the canonical address of every page of the lens', () => {
    expect(serviceAddress('payment-api')).toBe('/threat-models/payment-api');
    expect(newAddress('payment-api')).toBe('/threat-models/payment-api/new');
    expect(newAddress('payment-api', 'stride')).toBe(
      '/threat-models/payment-api/new?recipe=stride',
    );
    expect(modelAddress('payment-api', 'checkout-flow')).toBe(
      '/threat-models/payment-api/checkout-flow',
    );
    expect(modelAddress('payment-api', 'checkout-flow', 'v2')).toBe(
      '/threat-models/payment-api/checkout-flow?at=v2',
    );
    expect(releaseAddress('payment-api', 'checkout-flow')).toBe(
      '/threat-models/payment-api/checkout-flow/release',
    );
  });
});

describe('the risk a threat became', () => {
  it('reads the reference and the address of the entry, which is in lower case', () => {
    expect(riskOf('isms-register:risk/R-009')).toEqual({ id: 'R-009', href: '/isms/risks/r-009' });
  });

  it('knows no risk in a text that is no such reference', () => {
    expect(riskOf(undefined)).toBeNull();
    expect(riskOf('isms-register:risk/')).toBeNull();
    expect(riskOf('elsewhere:risk/R-1')).toBeNull();
    expect(riskOf('isms-register:risk/R 1')).toBeNull();
  });

  it('reads no risk from an id the register does not write', () => {
    expect(riskOf('isms-register:risk/-')).toBeNull();
    expect(riskOf(`isms-register:risk/${'a'.repeat(65)}`)).toBeNull();
  });
});

describe('the lists of the file', () => {
  it('reads the threats and the countermeasures, none for a file without them', () => {
    expect(threatsOf(undefined)).toEqual([]);
    expect(mitigationsOf({})).toEqual([]);
    expect(threatsOf({ threats: 'x' })).toEqual([]);
    expect(threatsOf({ threats: [threat('T-01') as never] }).map((entry) => entry.id)).toEqual([
      'T-01',
    ]);
    expect(mitigationsOf({ mitigations: [] })).toEqual([]);
  });

  it('chooses the next free id, two digits at least, after the highest taken', () => {
    expect(nextId('T', [])).toBe('T-01');
    expect(nextId('T', ['T-01', 'T-07', 'M-12'])).toBe('T-08');
    expect(nextId('M', ['M-09'])).toBe('M-10');
    expect(nextId('T', ['T-99'])).toBe('T-100');
    expect(nextId('T', ['T-x', 'T-', 'other'])).toBe('T-01');
  });

  it('calls a threat untreated when it is open, treated by nothing and not transferred', () => {
    const mitigations = [mitigation('M-01', 'T-01')];
    expect(isUntreated(threat('T-02'), mitigations)).toBe(true);
    expect(isUntreated(threat('T-01'), mitigations)).toBe(false);
    expect(isUntreated(threat('T-02', 'accepted'), mitigations)).toBe(false);
    const transferred = threat('T-03');
    transferred.attributes.transferred = 'isms-register:risk/R-1';
    expect(isUntreated(transferred, [])).toBe(false);
  });

  it('reads the status the application knows and takes any other for open', () => {
    expect(treatmentOf('mitigated')).toBe('mitigated');
    expect(treatmentOf('whatever')).toBe('open');
    expect(treatmentOf(undefined)).toBe('open');
  });

  it('reads the names of the components, for the text of the diagram', () => {
    expect(componentNames(undefined)).toEqual([]);
    expect(componentNames({ components: 'x' })).toEqual([]);
    expect(
      componentNames({
        components: [{ name: 'Browser' }, { name: '' }, {}, null, { name: 'API' }],
      }),
    ).toEqual(['Browser', 'API']);
  });

  it('writes the slug of the kind of a threat', () => {
    expect(categorySlug('Information Disclosure')).toBe('information-disclosure');
    expect(categorySlug('Denial of Service')).toBe('denial-of-service');
  });
});

describe('the issues of a countermeasure', () => {
  it('reads ids separated by commas, semicolons, spaces and lines, each once', () => {
    expect(parseIssues('PAY-1, PAY-2;PAY-1\n  PAY-3 ,')).toEqual(['PAY-1', 'PAY-2', 'PAY-3']);
    expect(parseIssues('')).toEqual([]);
  });

  it('writes them back as the field shows them', () => {
    expect(issuesText(['A-1', 'A-2'])).toBe('A-1, A-2');
    expect(issuesText(undefined)).toBe('');
  });

  it('finds the problem the schema would find: too many, too long', () => {
    expect(issuesProblem(['A-1'])).toBeNull();
    expect(issuesProblem(Array.from({ length: 21 }, (_, index) => `I-${index}`))).toBe('MAX_ITEMS');
    expect(issuesProblem(['x'.repeat(65)])).toBe('MAX_LENGTH');
  });

  it('reads a percentage as a whole number from 0 to 100', () => {
    expect(percentOf(' 75 ')).toBe(75);
    expect(percentOf('0')).toBe(0);
    expect(percentOf('100')).toBe(100);
    expect(percentOf('101')).toBeNull();
    expect(percentOf('-1')).toBeNull();
    expect(percentOf('1.5')).toBeNull();
    expect(percentOf('')).toBeNull();
  });
});

describe('the review date', () => {
  it.each([
    ['2026-06-01', 6, '2026-12-01'],
    ['2025-03-10', 24, '2027-03-10'],
    ['2026-11-26', 6, '2027-05-26'],
    ['2026-08-31', 6, '2027-02-28'],
    ['2024-08-31', 6, '2025-02-28'],
    ['2023-08-31', 6, '2024-02-29'],
    ['2026-12-31', 12, '2027-12-31'],
    ['2026-01-31', 1, '2026-02-28'],
  ])('adds the months to %s: %i months make %s', (date, months, expected) => {
    expect(addMonths(date, months)).toBe(expected);
  });

  it('knows no day in a text that is none', () => {
    expect(addMonths('2026-02-30', 1)).toBeNull();
    expect(addMonths('tomorrow', 1)).toBeNull();
    expect(addMonths('2026-1-1', 1)).toBeNull();
  });

  it('counts the days between two days, negative when the second is earlier', () => {
    expect(daysBetween('2026-11-26', '2026-12-01')).toBe(5);
    expect(daysBetween('2026-12-01', '2026-11-26')).toBe(-5);
    expect(daysBetween('2026-03-28', '2026-03-29')).toBe(1);
    expect(daysBetween('x', '2026-12-01')).toBeNull();
    expect(daysBetween('2026-12-01', 'y')).toBeNull();
  });
});

describe('where an error of a refused save belongs', () => {
  it('reads the first error of every member of every row, and of the list', () => {
    const errors = [
      { pointer: '/mitigations/1/attributes/threat', code: 'REFERENCE_NOT_FOUND', part: 'model' },
      { pointer: '/mitigations/1/attributes/status', code: 'ENUM', part: 'model' },
      { pointer: '/mitigations/0', code: 'REQUIRED', part: 'model' },
      { pointer: '/mitigations', code: 'MAX_ITEMS', part: 'model' },
      { pointer: '/mitigations/x/name', code: 'REQUIRED', part: 'model' },
      { pointer: '/mitigations/-1/name', code: 'REQUIRED', part: 'model' },
      { pointer: '/threats/0/risk/impact', code: 'MAXIMUM', part: 'model' },
    ];
    expect(rowErrors(errors, '/mitigations')).toEqual({
      1: { attributes: 'REFERENCE_NOT_FOUND' },
      0: { row: 'REQUIRED' },
      [-1]: { list: 'MAX_ITEMS' },
    });
    expect(rowErrors(errors, '/threats')).toEqual({ 0: { risk: 'MAXIMUM' } });
    expect(rowErrors(null, '/threats')).toEqual({});
  });
});

describe('the schema of the parts', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['service', 'owner', 'model'],
    properties: {
      service: { type: 'string' },
      owner: { type: 'string' },
      'last-review': { type: 'string' },
      model: {
        type: 'object',
        properties: { threats: { type: 'array' }, project: { type: 'object' } },
      },
    },
  };

  it('takes the schema of the file of the model out of the kind', () => {
    expect(modelSchemaOf(schema)?.properties).toHaveProperty('threats');
    expect(modelSchemaOf({ type: 'object' })).toBeNull();
  });

  it('picks and leaves out properties, with the mandatory ones they keep', () => {
    const picked = pickProperties(schema, ['owner', 'last-review']);
    expect(Object.keys(picked.properties as object)).toEqual(['owner', 'last-review']);
    expect(picked.required).toEqual(['owner']);
    const rest = omitProperties(modelSchemaOf(schema) as JsonSchema, ['threats']);
    expect(Object.keys(rest.properties as object)).toEqual(['project']);
    expect(pickProperties({ type: 'object' }, ['a']).properties).toEqual({});
  });

  it('splits the pointer of a refusal of a step into the part and the place in it', () => {
    expect(splitPointer('/model/project/name')).toEqual({
      part: 'model',
      pointer: '/project/name',
    });
    expect(splitPointer('/model')).toEqual({ part: 'model', pointer: '' });
    expect(splitPointer('/owner')).toEqual({ part: 'data', pointer: '/owner' });
    expect(splitPointer('/modeling')).toEqual({ part: 'data', pointer: '/modeling' });
  });
});

describe('the words of a conflict over a list', () => {
  const t = (key: string, params?: Record<string, string | number>) =>
    `${key}${params ? JSON.stringify(params) : ''}`;

  it('names the threats by id, name and status and the countermeasures by their threat', () => {
    expect(describeList('/threats', [threat('T-01')], t)).toContain(
      'Name T-01 (threats.status.open)',
    );
    expect(describeList('/mitigations', [mitigation('M-01', 'T-01')], t)).toContain(
      'M-01: Name M-01 (T-01)',
    );
    expect(describeList('/threats', [], t)).toBe('documents.value.entries{"count":0}');
  });

  it('leaves every other field to the generic reading', () => {
    expect(describeList('/project', [], t)).toBeNull();
    expect(describeList('/threats', 'x', t)).toBeNull();
  });
});

describe('the diagram', () => {
  it('draws a base64 vector image and nothing else', () => {
    expect(isDiagramUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(true);
    expect(isDiagramUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4')).toBe(true);
    expect(isDiagramUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isDiagramUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isDiagramUrl('data:image/svg+xml;base64,')).toBe(false);
    expect(isDiagramUrl('data:image/svg+xml;base64,<svg>')).toBe(false);
    expect(isDiagramUrl('data:image/svg+xml;base64,AAAA===')).toBe(false);
    expect(isDiagramUrl('https://evil.example/x.svg')).toBe(false);
    expect(isDiagramUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('the changes of a release', () => {
  const label = (_part: string, pointer: string) => `label:${pointer}`;
  const diff = (sections: DocumentDiff['sections']): DocumentDiff => ({
    repository: 'threat-models',
    id: 'x',
    from: 'models/x/v1',
    to: 'working',
    sections,
  });

  it('is one change per threat or countermeasure that is new, gone or changed, by its id', () => {
    const before = [threat('T-01'), threat('T-02'), threat('T-03')];
    const after = [threat('T-01'), threat('T-02', 'accepted'), threat('T-04')];
    const groups = groupModelDiff(
      diff([
        {
          part: 'model',
          changes: [
            { pointer: '/threats', before, after },
            { pointer: '/mitigations', before: [], after: [mitigation('M-01', 'T-04')] },
          ],
        },
      ]),
      label,
    );
    expect(groups.map((group) => group.title)).toEqual(['label:/threats', 'label:/mitigations']);
    const threats = groups[0].changes;
    expect(threats.map((change) => [change.label, change.pointer])).toEqual([
      ['T-02', '/threats/T-02'],
      ['T-04', '/threats/T-04'],
      ['T-03', '/threats/T-03'],
    ]);
    expect(threats[0].before).toEqual(before[1]);
    expect(threats[0].after).toEqual(after[1]);
    // New: nothing before. Gone: nothing after.
    expect(threats[1].before).toBeNull();
    expect(threats[2].after).toBeNull();
    expect(groups[1].changes[0]).toMatchObject({ pointer: '/mitigations/M-01', before: null });
  });

  it('keeps the other properties as they are, with the words of the field below a property', () => {
    const groups = groupModelDiff(
      diff([
        {
          part: 'data',
          changes: [{ pointer: '/last-review', before: '2026-06-01', after: '2026-11-26' }],
        },
        {
          part: 'model',
          changes: [
            { pointer: '/project/name', before: 'A', after: 'B' },
            { pointer: '/project/description', before: 'a', after: 'b' },
            { pointer: '', before: null, after: {} },
          ],
        },
      ]),
      label,
    );
    expect(groups.map((group) => group.key)).toEqual([
      'data:last-review',
      'model:project',
      'model:',
    ]);
    expect(groups[0].changes[0]).toMatchObject({
      part: 'data',
      label: '',
      pointer: '/last-review',
    });
    expect(groups[1].changes.map((change) => change.label)).toEqual([
      'label:/project/name',
      'label:/project/description',
    ]);
    expect(groups[2].title).toBe('model');
  });

  it('leaves out a list whose entries are all as they were, and an entry without an id', () => {
    const same = [threat('T-01')];
    const groups = groupModelDiff(
      diff([
        {
          part: 'model',
          changes: [
            { pointer: '/threats', before: same, after: same },
            { pointer: '/mitigations', before: 'x', after: [{ name: 'no id' }] },
          ],
        },
      ]),
      label,
    );
    expect(groups).toEqual([]);
  });
});

describe('the state of the work over two controllers', () => {
  it('ranks the state that tells the person more higher', () => {
    expect(saveRank('saving')).toBeGreaterThan(saveRank('failed'));
    expect(saveRank('failed')).toBeGreaterThan(saveRank('conflict'));
    expect(saveRank('conflict')).toBeGreaterThan(saveRank('changed'));
    expect(saveRank('changed')).toBeGreaterThan(saveRank('draft'));
    expect(saveRank('draft')).toBeGreaterThan(saveRank('clean'));
  });
});
