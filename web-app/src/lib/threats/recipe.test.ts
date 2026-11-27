import { describe, expect, it } from 'vitest';
import type { JsonSchema, RecipeDraftBody, ThreatRecipeStep } from '../api/types';
import {
  createRequest,
  dataErrors,
  dataFields,
  dataOfDraft,
  draftRequest,
  dropReadOnly,
  errorsOfStep,
  firstStepWithError,
  listAt,
  memberOf,
  memberValue,
  modelErrors,
  projectName,
  startStep,
  stepKind,
  stepOfPointer,
  stepSchema,
  stepValue,
  summaryOf,
  valuesOfDraft,
} from './recipe';

/**
 * What the recipe wizard knows without a component (rest-api.adoc, The Recipes, The Recipe Draft, A New Model).
 */
const MODEL: JsonSchema = {
  type: 'object',
  required: ['otmVersion', 'project'],
  properties: {
    otmVersion: { type: 'string', readOnly: true },
    project: {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'string', readOnly: true },
        name: { type: 'string' },
      },
    },
    trustZones: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' }, slot: { type: 'string', readOnly: true } },
      },
    },
  },
};

const STEPS: ThreatRecipeStep[] = [
  { id: 'project', title: 'The service', guidance: '', fills: '/project' },
  { id: 'zones', title: 'Trust zones', guidance: '', fills: '/trustZones' },
  { id: 'threats', title: 'Threats', guidance: '', fills: '/threats' },
];

const draft = (step: number, over: Partial<RecipeDraftBody['parts']> = {}): RecipeDraftBody => ({
  step,
  at: '2026-11-26T09:20:00Z',
  parts: {
    model: { fields: { '/project': { name: 'Scheduler overview' } } },
    ...over,
  },
});

describe('the step', () => {
  it('shows the two lists in their own tables and everything else as a form', () => {
    expect(stepKind('/threats')).toBe('threats');
    expect(stepKind('/mitigations')).toBe('mitigations');
    expect(stepKind('/project')).toBe('form');
    expect(stepKind('/trustZones')).toBe('form');
  });

  it('names one member of the file by its pointer', () => {
    expect(memberOf('/project')).toBe('project');
    expect(memberOf('/a~1b')).toBe('a/b');
    expect(memberOf('/project/name')).toBeNull();
    expect(memberOf('')).toBeNull();
  });

  it('leaves out what the server writes, at every depth, and keeps the rest', () => {
    const cut = dropReadOnly(MODEL);
    const properties = cut.properties as Record<string, JsonSchema>;
    expect(Object.keys(properties)).toEqual(['project', 'trustZones']);
    const project = properties.project.properties as Record<string, JsonSchema>;
    expect(Object.keys(project)).toEqual(['name']);
    expect(properties.project.required).toEqual(['name']);
    const items = properties.trustZones.items as JsonSchema;
    expect(Object.keys(items.properties as object)).toEqual(['id']);
  });

  it('cuts the form of a step from the schema, and has none for a place the file does not have', () => {
    const form = stepSchema(MODEL, '/project');
    expect(Object.keys((form?.properties ?? {}) as object)).toEqual(['project']);
    expect(form?.required).toEqual(['project']);
    expect(stepSchema(MODEL, '/dataflows')).toBeNull();
    expect(stepSchema(MODEL, '/project/name')).toBeNull();
    expect(stepSchema({ type: 'object' }, '/project')).toBeNull();
  });

  it('hands the form its member alone and takes it back', () => {
    expect(stepValue({ '/project': { name: 'A' } }, '/project')).toEqual({
      project: { name: 'A' },
    });
    expect(stepValue({}, '/project')).toEqual({});
    expect(stepValue({ '/project': { name: 'A' } }, '/project/name')).toEqual({});
    expect(memberValue({ project: { name: 'B' } }, '/project')).toEqual({ name: 'B' });
    expect(memberValue({}, '/project/name')).toBeUndefined();
  });

  it('reads a list as it stands, empty while nothing was filled in', () => {
    expect(listAt({}, '/threats')).toEqual([]);
    expect(listAt({ '/threats': [{ id: 'T-01' }] }, '/threats')).toEqual([{ id: 'T-01' }]);
    expect(listAt({ '/threats': 'x' }, '/threats')).toEqual([]);
  });

  it('reads the name of the project, trimmed, and none where there is none', () => {
    expect(projectName({ '/project': { name: '  Scheduler  ' } })).toBe('Scheduler');
    expect(projectName({ '/project': { description: 'x' } })).toBe('');
    expect(projectName({ '/project': 'x' })).toBe('');
    expect(projectName({})).toBe('');
  });
});

describe('the draft', () => {
  it('opens on the step of the draft, kept within the steps and the last page', () => {
    expect(startStep(4, null)).toBe(0);
    expect(startStep(4, draft(2))).toBe(2);
    expect(startStep(4, draft(4))).toBe(4);
    expect(startStep(4, draft(9))).toBe(4);
    expect(startStep(4, draft(-3))).toBe(0);
    expect(startStep(4, { ...draft(1), step: 1.5 })).toBe(0);
  });

  it('takes the fields of the part model as a copy, and none from a draft without it', () => {
    const read = draft(1);
    const values = valuesOfDraft(read);
    expect(values).toEqual({ '/project': { name: 'Scheduler overview' } });
    values['/x'] = 1;
    expect(read.parts.model?.fields['/x']).toBeUndefined();
    expect(valuesOfDraft(null)).toEqual({});
    expect(valuesOfDraft({ ...read, parts: {} })).toEqual({});
  });

  it('prefills the review date with today and takes the owner and the date of a draft', () => {
    expect(dataOfDraft(null, '2026-11-26')).toEqual({ 'last-review': '2026-11-26' });
    expect(
      dataOfDraft(
        draft(4, {
          data: { fields: { '/owner': 'role:service-owner', '/last-review': '2026-11-01' } },
        }),
        '2026-11-26',
      ),
    ).toEqual({ owner: 'role:service-owner', 'last-review': '2026-11-01' });
    expect(dataOfDraft(draft(4, { data: { fields: { '/owner': '' } } }), '2026-11-26')).toEqual({
      'last-review': '2026-11-26',
    });
  });

  it('writes the fields of the part data by pointer and leaves an empty one out', () => {
    expect(dataFields({ owner: 'role:a', 'last-review': '2026-11-26' })).toEqual({
      '/owner': 'role:a',
      '/last-review': '2026-11-26',
    });
    expect(dataFields({ 'last-review': '2026-11-26' })).toEqual({ '/last-review': '2026-11-26' });
    expect(dataFields({})).toEqual({});
  });

  it('sends the whole draft with the step the person goes on to, the part data only where it was filled', () => {
    expect(draftRequest(2, { '/project': { name: 'A' } }, null)).toEqual({
      step: 2,
      parts: { model: { fields: { '/project': { name: 'A' } } } },
    });
    expect(draftRequest(4, {}, { 'last-review': '2026-11-26' })).toEqual({
      step: 4,
      parts: { model: { fields: {} }, data: { fields: { '/last-review': '2026-11-26' } } },
    });
    expect(draftRequest(4, {}, {}).parts.data).toBeUndefined();
  });

  it('creates from the recipe and both parts', () => {
    expect(
      createRequest(
        'stride',
        { '/project': { name: 'A' } },
        { owner: 'role:a', 'last-review': '2026-11-26' },
      ),
    ).toEqual({
      recipe: 'stride',
      parts: {
        data: { fields: { '/owner': 'role:a', '/last-review': '2026-11-26' } },
        model: { fields: { '/project': { name: 'A' } } },
      },
    });
  });
});

describe('the refusals', () => {
  it('finds the step that fills a place, inside it or at it', () => {
    expect(stepOfPointer(STEPS, '/project/name')).toBe(0);
    expect(stepOfPointer(STEPS, '/trustZones')).toBe(1);
    expect(stepOfPointer(STEPS, '/trustZones/0/risk/trustRating')).toBe(1);
    // A pointer that only begins like a step's place is not inside it.
    expect(stepOfPointer(STEPS, '/projectX')).toBe(-1);
    expect(stepOfPointer(STEPS, '/dataflows/0')).toBe(-1);
  });

  it('splits the errors of the file of the model from those of the part data', () => {
    const errors = [
      { part: 'model', pointer: '/project/name', code: 'REQUIRED' },
      { pointer: '/trustZones/0/id', code: 'PATTERN' },
      { part: 'data', pointer: '/owner', code: 'REFERENCE_NOT_FOUND' },
    ];
    expect(modelErrors(errors).map((error) => error.pointer)).toEqual([
      '/project/name',
      '/trustZones/0/id',
    ]);
    expect(dataErrors(errors).map((error) => error.pointer)).toEqual(['/owner']);
    expect(modelErrors(null)).toEqual([]);
    expect(dataErrors(null)).toEqual([]);
    expect(errorsOfStep(modelErrors(errors), '/trustZones')).toHaveLength(1);
  });

  it('goes to the step of the first refused field of the file, and to none for the other part', () => {
    expect(
      firstStepWithError(STEPS, [
        { part: 'data', pointer: '/owner', code: 'X' },
        { part: 'model', pointer: '/trustZones/0/id', code: 'PATTERN' },
        { part: 'model', pointer: '/project/name', code: 'REQUIRED' },
      ]),
    ).toBe(1);
    expect(firstStepWithError(STEPS, [{ part: 'data', pointer: '/owner', code: 'X' }])).toBe(-1);
    expect(firstStepWithError(STEPS, [])).toBe(-1);
  });
});

describe('the summary of the last page', () => {
  it('says the name of an object, the number of the entries of a list, and that a step is empty', () => {
    expect(summaryOf('/project', { '/project': { name: ' A ' } })).toEqual({
      kind: 'name',
      text: 'A',
    });
    expect(summaryOf('/project', { '/project': { description: 'x' } })).toEqual({
      kind: 'count',
      count: 1,
    });
    expect(summaryOf('/project', { '/project': {} })).toEqual({ kind: 'none' });
    expect(summaryOf('/trustZones', { '/trustZones': [{}, {}] })).toEqual({
      kind: 'count',
      count: 2,
    });
    expect(summaryOf('/trustZones', { '/trustZones': [] })).toEqual({ kind: 'none' });
    expect(summaryOf('/trustZones', {})).toEqual({ kind: 'none' });
    expect(summaryOf('/trustZones', { '/trustZones': 'x' })).toEqual({ kind: 'none' });
  });
});
