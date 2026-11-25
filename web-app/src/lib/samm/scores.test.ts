import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { SammModel } from '../api/types';
import { SCENARIO_DIR } from '../test/scenarioFetch';
import {
  assessmentScore,
  findPractice,
  formatDelta,
  formatScore,
  gapsOf,
  practiceScore,
  practicesInOrder,
} from './scores';

/**
 * The scores of AUN-SAMM-5 against the model of the mock (OWASP SAMM v2.2.0) and the fixtures the mock serves.
 */
const model = JSON.parse(
  fs.readFileSync(path.join(SCENARIO_DIR, 'data', 'samm-model-v2.2.0.json'), 'utf8'),
) as SammModel;

const sm = findPractice(model, 'sm')!.practice;

describe('practiceScore', () => {
  it('sums each stream and averages the two streams, an unanswered question counting 0', () => {
    const [a1, a2, a3] = sm.streams[0].questions;
    const [b1] = sm.streams[1].questions;
    const score = practiceScore(
      {
        sm: {
          [a1.id]: { answer: 1 },
          [a2.id]: { answer: 0.5 },
          [a3.id]: { answer: 0.25 },
          [b1.id]: { answer: 0.25 },
        },
      },
      sm,
    );
    expect(score.streams).toEqual([1.75, 0.25]);
    expect(score.score).toBe(1);
    expect(score.answered).toBe(4);
    expect(score.questions).toBe(6);
  });

  it('scores a practice without answers 0', () => {
    expect(practiceScore({}, sm)).toMatchObject({ score: 0, answered: 0, streams: [0, 0] });
  });
});

describe('assessmentScore', () => {
  it('averages practices into functions and functions into the overall score, unrounded', () => {
    const answers: Record<string, Record<string, { answer: number }>> = {};
    for (const { practice } of practicesInOrder(model)) {
      answers[practice.id] = Object.fromEntries(
        practice.streams.flatMap((stream) =>
          stream.questions.map((question) => [question.id, { answer: 1 }]),
        ),
      );
    }
    // One practice of Governance at stream score 1 + 1 instead of 3 + 3.
    for (const question of sm.streams.flatMap((stream) => stream.questions).slice(0, 2)) {
      answers.sm[question.id] = { answer: 0 };
    }
    answers.sm[sm.streams[1].questions[0].id] = { answer: 0 };
    answers.sm[sm.streams[1].questions[1].id] = { answer: 0 };
    const score = assessmentScore(model, answers);
    expect(score.questions).toBe(90);
    expect(score.answered).toBe(90);
    expect(score.functions[0].practices[0].score).toBe(1);
    expect(score.functions[0].score).toBeCloseTo((1 + 3 + 3) / 3, 12);
    expect(score.overall).toBeCloseTo(((1 + 3 + 3) / 3 + 3 * 4) / 5, 12);
  });

  it('matches the comparison the mock serves for the released and the reviewed assessment', () => {
    const read = (name: string) =>
      JSON.parse(fs.readFileSync(path.join(SCENARIO_DIR, 'data', name), 'utf8'));
    const comparison = read('samm-compare-payments.json');
    const from = assessmentScore(model, read('samm-assessment-payments-2026-q2.json').answers);
    const to = assessmentScore(
      model,
      read('samm-assessment-payments-2026-q4-in-review.json').answers,
    );
    expect(from.overall).toBeCloseTo(comparison.overall.from, 12);
    expect(to.overall).toBeCloseTo(comparison.overall.to, 12);
  });
});

describe('gapsOf', () => {
  it('lists the practices below target, the widest first', () => {
    const score = assessmentScore(model, {});
    const gaps = gapsOf(score, { sm: { target: 2 }, ta: { target: 2.5, due: '2027-03-31' } });
    expect(gaps.map((gap) => gap.practice)).toEqual(['ta', 'sm']);
    expect(gaps[0]).toMatchObject({ missing: 2.5, due: '2027-03-31' });
  });
});

describe('findPractice', () => {
  it('finds a practice with its function and position', () => {
    expect(findPractice(model, 'ta')).toMatchObject({ fn: { id: 'design' }, index: 3 });
    expect(findPractice(model, 'nope')).toBeNull();
  });
});

describe('formatting', () => {
  it('shows at most two decimals in the locale and signs a difference', () => {
    expect(formatScore(1.375, 'en')).toBe('1.38');
    expect(formatScore(2, 'de')).toBe('2');
    expect(formatScore(1.5, 'de')).toBe('1,5');
    expect(formatDelta(0.25, 'en')).toBe('+0.25');
    expect(formatDelta(-0.5, 'en')).toBe('-0.5');
    expect(formatDelta(0, 'en')).toBe('±0');
  });
});
