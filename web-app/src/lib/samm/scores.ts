/**
 * The SAMM scores as the OWASP SAMM toolbox computes them (AUN-SAMM-5), for the live display in a workshop.
 *
 * An answer's value comes from the model's answer set; an unanswered question counts 0. A stream score is the sum of
 * its three answers (0 to 3); a practice score the average of its two streams; a business function the average of
 * its practices; the overall score the average of the business functions. Nothing is rounded here: a view formats.
 * The server's `ScoreCalculator` is the authority for a released assessment; this module only keeps a workshop's
 * figures current while answers change.
 */
import type { SammAnswer, SammModel, SammPractice, SammTarget } from '../api/types';

/** The answers of an assessment: per practice id, per question id. */
export type Answers = Record<string, Record<string, SammAnswer>>;

/** The scores of one practice. */
export interface PracticeScore {
  id: string;
  /** The practice score, 0 to 3. */
  score: number;
  /** The scores of stream A and stream B, 0 to 3 each. */
  streams: [number, number];
  /** How many of its questions are answered. */
  answered: number;
  /** How many questions it has. */
  questions: number;
}

/** The scores of one business function. */
export interface FunctionScore {
  id: string;
  score: number;
  practices: PracticeScore[];
}

/** The scores of an assessment. */
export interface AssessmentScore {
  overall: number;
  functions: FunctionScore[];
  answered: number;
  questions: number;
}

/**
 * @param answers the answers
 * @param practice the practice
 * @returns its scores and how far it is answered
 */
export function practiceScore(answers: Answers, practice: SammPractice): PracticeScore {
  const own = answers[practice.id] ?? {};
  let answered = 0;
  let questions = 0;
  const streams = practice.streams.map((stream) =>
    stream.questions.reduce((sum, question) => {
      questions += 1;
      const value = own[question.id]?.answer;
      if (typeof value === 'number') {
        answered += 1;
        return sum + value;
      }
      return sum;
    }, 0),
  );
  const a = streams[0] ?? 0;
  const b = streams[1] ?? 0;
  return { id: practice.id, score: (a + b) / 2, streams: [a, b], answered, questions };
}

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * @param model the model the assessment was taken with
 * @param answers its answers
 * @returns every score of the assessment
 */
export function assessmentScore(model: SammModel, answers: Answers): AssessmentScore {
  let answered = 0;
  let questions = 0;
  const functions = model.functions.map((fn) => {
    const practices = fn.practices.map((practice) => {
      const score = practiceScore(answers, practice);
      answered += score.answered;
      questions += score.questions;
      return score;
    });
    return { id: fn.id, score: average(practices.map((p) => p.score)), practices };
  });
  return { overall: average(functions.map((fn) => fn.score)), functions, answered, questions };
}

/** A practice whose released score is below its target (AUN-SAMM-6). */
export interface Gap {
  practice: string;
  score: number;
  target: number;
  /** How far below the target, always positive. */
  missing: number;
  due?: string;
}

/**
 * @param score the scores of an assessment
 * @param targets the targets of its scope
 * @returns the practices below their target, the widest gap first
 */
export function gapsOf(score: AssessmentScore, targets: Record<string, SammTarget>): Gap[] {
  const gaps: Gap[] = [];
  for (const fn of score.functions) {
    for (const practice of fn.practices) {
      const target = targets[practice.id];
      if (target && practice.score < target.target) {
        gaps.push({
          practice: practice.id,
          score: practice.score,
          target: target.target,
          missing: target.target - practice.score,
          due: target.due,
        });
      }
    }
  }
  return gaps.sort((a, b) => b.missing - a.missing || a.practice.localeCompare(b.practice));
}

/**
 * @param model the model
 * @param id a practice id
 * @returns the practice and its business function, or `null` for an id the model lacks
 */
export function findPractice(
  model: SammModel,
  id: string,
): { practice: SammPractice; fn: SammModel['functions'][number]; index: number } | null {
  let index = 0;
  for (const fn of model.functions) {
    for (const practice of fn.practices) {
      if (practice.id === id) return { practice, fn, index };
      index += 1;
    }
  }
  return null;
}

/**
 * @param model the model
 * @returns every practice in model order, with its business function's position (0 to 4)
 */
export function practicesInOrder(model: SammModel): { practice: SammPractice; fnIndex: number }[] {
  return model.functions.flatMap((fn, fnIndex) =>
    fn.practices.map((practice) => ({ practice, fnIndex })),
  );
}

/**
 * Formats a score for display: at most two decimals, the locale's separator. The value itself stays unrounded.
 *
 * @param value a score
 * @param locale the language
 * @returns the text
 */
export function formatScore(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formats a score difference with its sign.
 *
 * @param value a difference
 * @param locale the language
 * @returns the text, `±0` for no change
 */
export function formatDelta(value: number, locale: string): string {
  if (Math.abs(value) < 1e-9) return '±0';
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    signDisplay: 'always',
  }).format(value);
}
