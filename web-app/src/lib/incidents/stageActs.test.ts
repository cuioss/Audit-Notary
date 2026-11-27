import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { IncidentStage } from '../api/types';
import { StepUpHandler } from '../stepup/stepUp';
import { StageActs } from './stageActs.svelte';

/**
 * Completing and reopening a stage (rest-api.adoc, Completing and Reopening a Stage): what the request sends, what every
 * refusal comes to, and the step-up of the review.
 */
const stage = (own: Partial<IncidentStage> = {}): IncidentStage => ({
  id: 'response',
  part: 'response',
  after: ['triage'],
  when: null,
  narrative: [],
  stepUp: false,
  status: 'open',
  unanswered: false,
  completion: null,
  predecessorReopened: false,
  missing: [],
  blockedBy: [],
  ...own,
});

const DONE = {
  outcome: 'COMPLETED',
  stage: 'response',
  status: 'completed',
  at: '2026-11-26T10:20:00Z',
  parts: {},
  stages: [],
};

/** @returns the acts over a client that answers as told, with the step-up method `method` */
function setup(
  complete: () => Promise<unknown>,
  method: 'off' | 'password' | 'mfa' = 'off',
  reopen: () => Promise<unknown> = () => Promise.resolve({ ...DONE, outcome: 'REOPENED' }),
) {
  const client = {
    completeStage: vi.fn(complete),
    reopenStage: vi.fn(reopen),
    stepUp: vi.fn(),
  } as unknown as ApiClient;
  const onchanged = vi.fn();
  const stepUp = new StepUpHandler(client, () => method);
  const acts = new StageActs({
    repository: 'isms-incidents-2026',
    document: 'D1',
    stepUp,
    client,
    onchanged,
  });
  return { acts, client, onchanged, stepUp };
}

describe('completing a stage', () => {
  it('sends the blob of the part the form loaded, tells what was done and asks for a new read', async () => {
    const { acts, client, onchanged } = setup(() => Promise.resolve(DONE));
    expect(await acts.complete(stage(), 'abc1234')).toBe(true);
    expect(client.completeStage).toHaveBeenCalledWith(
      'isms-incidents-2026',
      'D1',
      'response',
      { blob: 'abc1234' },
      undefined,
    );
    expect(acts.done).toEqual({ stage: 'response', act: 'complete' });
    expect(acts.busy).toBeNull();
    expect(onchanged).toHaveBeenCalledTimes(1);
  });

  it('sends no blob for a part that was never saved', async () => {
    const { acts, client } = setup(() => Promise.resolve(DONE));
    await acts.complete(stage(), null);
    expect(client.completeStage).toHaveBeenCalledWith(
      'isms-incidents-2026',
      'D1',
      'response',
      {},
      undefined,
    );
  });

  it('keeps the mandatory fields that are missing and the stages still open, and reads nothing again', async () => {
    const { acts, onchanged } = setup(() =>
      Promise.reject(
        new ApiError('STAGE_NOT_COMPLETABLE', 422, [], {
          outcome: 'STAGE_NOT_COMPLETABLE',
          stage: 'response',
          missing: ['/response/actions', '/response/resolved-at'],
          open: ['triage'],
        }),
      ),
    );
    expect(await acts.complete(stage(), 'abc1234')).toBe(false);
    expect(acts.refusal).toEqual({
      stage: 'response',
      missing: ['/response/actions', '/response/resolved-at'],
      open: ['triage'],
    });
    expect(acts.failure).toBeNull();
    expect(onchanged).not.toHaveBeenCalled();
    acts.clear();
    expect(acts.refusal).toBeNull();
  });

  it('reads a refusal without lists as two empty lists', async () => {
    const { acts } = setup(() => Promise.reject(new ApiError('STAGE_NOT_COMPLETABLE', 422)));
    await acts.complete(stage(), null);
    expect(acts.refusal).toEqual({ stage: 'response', missing: [], open: [] });
  });

  it('tells a stage someone saved since the form was loaded, and reads the incident again', async () => {
    const { acts, onchanged } = setup(() =>
      Promise.reject(new ApiError('CHANGED_SINCE_REVIEW', 409)),
    );
    expect(await acts.complete(stage(), 'old')).toBe(false);
    expect(acts.failure).toBe('incidents.stage.changed');
    expect(onchanged).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['STAGE_STATE', 'error.stage-state'],
    ['STAGE_NOT_APPLICABLE', 'error.stage-not-applicable'],
    ['DOCUMENT_RELEASED', 'error.document-released'],
  ] as const)('tells %s and reads the incident again', async (outcome, key) => {
    const { acts, onchanged } = setup(() => Promise.reject(new ApiError(outcome, 409)));
    await acts.complete(stage(), null);
    expect(acts.failure).toBe(key);
    expect(onchanged).toHaveBeenCalledTimes(1);
  });

  it('tells any other refusal and reads nothing again', async () => {
    const { acts, onchanged } = setup(() => Promise.reject(new ApiError('GIT_UNAVAILABLE', 503)));
    await acts.complete(stage(), null);
    expect(acts.failure).toBe('error.git-unavailable');
    expect(onchanged).not.toHaveBeenCalled();
  });

  it('sends nothing while another request runs', async () => {
    let finish: (value: unknown) => void = () => {};
    const { acts, client } = setup(() => new Promise((resolve) => (finish = resolve)));
    const first = acts.complete(stage(), null);
    expect(acts.busy).toBe('response');
    expect(await acts.complete(stage({ id: 'review' }), null)).toBe(false);
    finish(DONE);
    await first;
    expect(client.completeStage).toHaveBeenCalledTimes(1);
  });
});

describe('the step-up of the review', () => {
  it('opens the question first for a stage that asks, and sends the password with the request', async () => {
    const { acts, client, stepUp } = setup(() => Promise.resolve(DONE), 'password');
    const done = acts.complete(stage({ id: 'review', stepUp: true }), 'abc1234');
    await vi.waitFor(() => {
      let asking = false;
      stepUp.state.subscribe((state) => (asking = state.asking))();
      expect(asking).toBe(true);
    });
    expect(client.completeStage).not.toHaveBeenCalled();
    await stepUp.submit('secret');
    expect(await done).toBe(true);
    expect(client.completeStage).toHaveBeenCalledWith(
      'isms-incidents-2026',
      'D1',
      'review',
      { blob: 'abc1234' },
      'secret',
    );
  });

  it('leaves for the address the server names with the confirmation of the provider, and tells nothing', async () => {
    const { acts, client, onchanged } = setup(
      () =>
        Promise.reject(
          new ApiError('STEP_UP_REQUIRED', 403, [], { stepUp: '/api/v1/auth/login?step-up=mfa' }),
        ),
      'mfa',
    );
    expect(await acts.complete(stage({ id: 'review', stepUp: true }), null)).toBe(false);
    expect(client.stepUp).toHaveBeenCalledWith('/api/v1/auth/login?step-up=mfa');
    expect(acts.failure).toBeNull();
    expect(onchanged).not.toHaveBeenCalled();
  });

  it('does not ask for a stage that asks for nothing', async () => {
    const { acts, client } = setup(() => Promise.resolve(DONE), 'password');
    expect(await acts.complete(stage(), null)).toBe(true);
    expect(client.completeStage).toHaveBeenCalledTimes(1);
  });
});

describe('reopening a stage', () => {
  it('sends the blob without a question and tells that the stage is open again', async () => {
    const { acts, client, onchanged } = setup(() => Promise.resolve(DONE), 'password');
    expect(await acts.reopen(stage({ status: 'completed' }), 'abc1234')).toBe(true);
    expect(client.reopenStage).toHaveBeenCalledWith('isms-incidents-2026', 'D1', 'response', {
      blob: 'abc1234',
    });
    expect(acts.done).toEqual({ stage: 'response', act: 'reopen' });
    expect(onchanged).toHaveBeenCalledTimes(1);
  });

  it('tells a stage that is not completed', async () => {
    const { acts } = setup(
      () => Promise.resolve(DONE),
      'off',
      () => Promise.reject(new ApiError('STAGE_STATE', 409)),
    );
    expect(await acts.reopen(stage({ status: 'completed' }), null)).toBe(false);
    expect(acts.failure).toBe('error.stage-state');
  });
});
