import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import type { DocumentDiff, IncidentDeadline, IncidentStage, JsonSchema } from '../api/types';
import { awareSchema, newIncidentRequest } from './model';
import { groupIncidentDiff, openStagesOf, readSchemaOf, stageCounts, stillDue } from './release';

/**
 * What the release of an incident knows, without a component (rest-api.adoc, Submitting and Releasing): the diff by stage,
 * the deadlines that are still a duty, the stages a refusal names, and the first save of a new incident.
 */
const SCHEMA: JsonSchema = {
  type: 'object',
  required: ['title'],
  properties: {
    title: { type: 'string' },
    triage: {
      type: 'object',
      required: ['aware-at', 'severity'],
      properties: {
        'aware-at': { type: 'string', format: 'date-time' },
        severity: { type: 'string' },
        completion: { type: 'object' },
      },
    },
  },
};

/** @returns a deadline with the given status and sent time */
function deadline(status: IncidentDeadline['status'], sentAt: string | null): IncidentDeadline {
  return {
    rule: 'gdpr-art33',
    element: null,
    startedAt: null,
    due: null,
    status,
    sentAt,
    metBy: '/notifications/supervisory-authority',
  };
}

/** @returns a stage with the given status */
function stage(id: string, status: IncidentStage['status']): IncidentStage {
  return { id, part: id, status } as IncidentStage;
}

describe('groupIncidentDiff', () => {
  const diff: DocumentDiff = {
    repository: 'isms-incidents-2026',
    id: 'X',
    from: null,
    to: 'working',
    sections: [
      { part: 'data', changes: [{ pointer: '/title', before: null, after: 'Card data' }] },
      { part: 'triage', changes: [] },
      {
        part: 'response',
        changes: [
          { pointer: '/resolved-at', before: null, after: '2026-11-12T09:00:00Z' },
          { pointer: '/completion', before: null, after: { at: '2026-11-12T15:30:00Z' } },
        ],
      },
    ],
  };

  it('makes one group for each part that changed, in the order of the server, and drops a part without a change', () => {
    const groups = groupIncidentDiff(
      diff,
      (part) => `T:${part}`,
      (part, pointer) => `${part}${pointer}`,
    );
    expect(groups.map((group) => group.key)).toEqual(['data', 'response']);
    expect(groups.map((group) => group.title)).toEqual(['T:data', 'T:response']);
    expect(groups[1].changes.map((change) => [change.key, change.label])).toEqual([
      ['response/resolved-at', 'response/resolved-at'],
      ['response/completion', 'response/completion'],
    ]);
  });
});

describe('readSchemaOf', () => {
  it('reads the title as the title and a stage as its form, without the sign-off', () => {
    expect(Object.keys(readSchemaOf(SCHEMA, 'data').properties as object)).toEqual(['title']);
    expect(Object.keys(readSchemaOf(SCHEMA, 'triage').properties as object)).toEqual([
      'aware-at',
      'severity',
    ]);
  });
});

describe('the deadlines that are still a duty', () => {
  it('counts an open one and a missed one that was never sent, not a met one or one sent late', () => {
    expect(stillDue(deadline('OPEN', null))).toBe(true);
    expect(stillDue(deadline('MISSED', null))).toBe(true);
    expect(stillDue(deadline('MISSED', '2026-11-22T10:20:00Z'))).toBe(false);
    expect(stillDue(deadline('MET', '2026-11-20T06:55:00Z'))).toBe(false);
  });
});

describe('stageCounts', () => {
  it('counts the stages that apply, and how many of them are completed', () => {
    expect(
      stageCounts([
        stage('triage', 'completed'),
        stage('privacy-assessment', 'not-applicable'),
        stage('response', 'open'),
      ]),
    ).toEqual({ done: 1, total: 2 });
  });
});

describe('openStagesOf', () => {
  it('reads the stages of a STAGES_OPEN refusal with their missing fields', () => {
    const error = new ApiError('STAGES_OPEN', 422, [], {
      stages: [
        { stage: 'response', missing: [] },
        { stage: 'review', missing: ['/review/lessons', 3] },
        { stage: 5 },
        'nope',
        null,
      ],
    });
    expect(openStagesOf(error)).toEqual([
      { stage: 'response', missing: [] },
      { stage: 'review', missing: ['/review/lessons'] },
    ]);
  });

  it('is empty for a refusal without a list and is none for another refusal', () => {
    expect(openStagesOf(new ApiError('STAGES_OPEN', 422))).toEqual([]);
    expect(openStagesOf(new ApiError('DOCUMENT_RELEASED', 409))).toBeNull();
  });
});

describe('the first save of a new incident', () => {
  it('asks the form for the awareness only, never as a mandatory field', () => {
    const form = awareSchema(SCHEMA);
    expect(Object.keys(form.properties as object)).toEqual(['aware-at']);
    expect(form.required).toBeUndefined();
    expect(awareSchema({ type: 'object', properties: {} }).properties).toEqual({});
  });

  it('sends the trimmed title, and the awareness only when it is known', () => {
    expect(newIncidentRequest('  Card data ', null)).toEqual({
      kind: 'incident',
      parts: { data: { fields: { '/title': 'Card data' } } },
    });
    expect(newIncidentRequest('Card data', '2026-11-26T08:30:00Z').parts.triage).toEqual({
      fields: { '/aware-at': '2026-11-26T08:30:00Z' },
    });
  });
});
