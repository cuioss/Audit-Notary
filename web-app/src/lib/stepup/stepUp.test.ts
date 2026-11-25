import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { Status } from '../api/types';
import { status } from '../stores/app';
import { scenarioFetch } from '../test/scenarioFetch';
import { StepUpHandler } from './stepUp';

/**
 * The step-up handler (UC-ACC-3) against the `release` profile of `web-mock`: the same answers the end-to-end suite
 * sees. The request is the release of the profile's assessment.
 */
const release = (password?: string) =>
  apiClient.release('samm-assessments', 'payments-2026-q4', password);

/**
 * Stubs fetch with a scenario and reads its status into the store, as the shell does.
 *
 * @param reference the scenario, `name#state`
 * @returns the scenario
 */
async function prepare(reference: string) {
  const scenario = scenarioFetch(reference);
  vi.stubGlobal('fetch', scenario.fetch);
  status.set(await apiClient.getStatus());
  return scenario;
}

afterEach(() => {
  vi.unstubAllGlobals();
  status.set(null);
});

describe('the method mfa', () => {
  it('leaves for the step-up address the server names and keeps nothing across the redirect', async () => {
    const scenario = await prepare('release');
    const leave = vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    const handler = new StepUpHandler();
    expect(await handler.run(release)).toEqual({ status: 'handled' });
    expect(leave).toHaveBeenCalledWith('/api/v1/auth/login?step-up=mfa');
    expect(scenario.state()).toBe('stepped-up');
    // Back from the provider the act is chosen again and passes.
    const again = await handler.run(release);
    expect(again).toMatchObject({
      status: 'done',
      value: { tag: 'assessments/payments-2026-q4/v1' },
    });
    expect(scenario.state()).toBe('released');
    expect(get(handler.state)).toMatchObject({ working: false, asking: false, notice: null });
  });

  it('shows the work of a request that is running', async () => {
    await prepare('release#stepped-up');
    const handler = new StepUpHandler();
    const seen: boolean[] = [];
    handler.state.subscribe((state) => seen.push(state.working));
    await handler.run(release);
    expect(seen).toContain(true);
    expect(seen.at(-1)).toBe(false);
  });

  it('says that many people are logging in, and writes nothing (503, Retry-After)', async () => {
    const scenario = await prepare('release#too-many-logins');
    const handler = new StepUpHandler();
    expect(await handler.run(release)).toEqual({ status: 'handled' });
    expect(get(handler.state).notice).toEqual({ tone: 'attention', key: 'error.too-many-logins' });
    expect(scenario.state()).toBe('too-many-logins');
    // The next act starts clean.
    scenario.goto('stepped-up');
    expect(await handler.run(release)).toMatchObject({ status: 'done' });
    expect(get(handler.state).notice).toBeNull();
  });

  it('hands every other refusal back to the view', async () => {
    await prepare('release#changed');
    const handler = new StepUpHandler();
    const result = await handler.run(release);
    expect(result).toMatchObject({ status: 'refused', error: { outcome: 'CHANGED_SINCE_REVIEW' } });
  });

  it('turns a failure that is no refusal into an unexpected one', async () => {
    const handler = new StepUpHandler(apiClient, () => 'off');
    const result = await handler.run(() => Promise.reject(new TypeError('boom')));
    expect(result).toMatchObject({ status: 'refused', error: { outcome: 'UNEXPECTED' } });
  });

  it('leaves the session ended to the client, which goes to the login', async () => {
    const handler = new StepUpHandler();
    const result = await handler.run(() => Promise.reject(new ApiError('UNAUTHENTICATED', 401)));
    expect(result).toEqual({ status: 'handled' });
    expect(get(handler.state).notice).toBeNull();
  });

  it('has no password to ask a user of the identity provider for when the step-up names no address', async () => {
    const handler = new StepUpHandler();
    const result = await handler.run(() => Promise.reject(new ApiError('STEP_UP_REQUIRED', 403)));
    expect(result).toEqual({ status: 'handled' });
    expect(get(handler.state)).toMatchObject({
      asking: false,
      notice: { tone: 'danger', key: 'error.unexpected' },
    });
  });
});

describe('the method off', () => {
  it('sends the request without a dialog', async () => {
    await prepare('release#stepped-up');
    status.set({ ...(get(status) as Status), stepUp: 'off' });
    const handler = new StepUpHandler();
    expect(await handler.run(release)).toMatchObject({ status: 'done' });
    expect(get(handler.state).asking).toBe(false);
  });
});

describe('the method password', () => {
  it('asks first, sends the password with the request and closes the dialog', async () => {
    const scenario = await prepare('release#password');
    const handler = new StepUpHandler();
    const run = handler.run(release);
    expect(get(handler.state)).toMatchObject({ asking: true, sending: false });
    expect(scenario.state()).toBe('password');
    await handler.submit('secret');
    expect(await run).toMatchObject({
      status: 'done',
      value: { tag: 'assessments/payments-2026-q4/v1' },
    });
    expect(get(handler.state)).toMatchObject({ asking: false, sending: false });
    expect(scenario.state()).toBe('released');
  });

  it('keeps the dialog open on a wrong password (401), which is no lost session', async () => {
    const scenario = await prepare('release#wrong-password');
    const handler = new StepUpHandler();
    const run = handler.run(release);
    await handler.submit('wrong');
    expect(get(handler.state)).toMatchObject({
      asking: true,
      sending: false,
      dialogError: 'error.invalid-credentials',
    });
    expect(scenario.state()).toBe('wrong-password');
    handler.cancel();
    expect(await run).toEqual({ status: 'handled' });
  });

  it('closes on a refusal that belongs to the view and hands it back', async () => {
    const handler = new StepUpHandler(apiClient, () => 'password');
    const run = handler.run(() => Promise.reject(new ApiError('CHANGED_SINCE_REVIEW', 409)));
    await handler.submit('secret');
    expect(await run).toMatchObject({
      status: 'refused',
      error: { outcome: 'CHANGED_SINCE_REVIEW' },
    });
    expect(get(handler.state).asking).toBe(false);
  });

  it('stays open when the server asks again without an address', async () => {
    const handler = new StepUpHandler(apiClient, () => 'password');
    const run = handler.run(() => Promise.reject(new ApiError('STEP_UP_REQUIRED', 403)));
    await handler.submit('secret');
    expect(get(handler.state)).toMatchObject({ asking: true, sending: false });
    handler.cancel();
    expect(await run).toEqual({ status: 'handled' });
  });

  it('closes on a refusal of too many logins, with the notice', async () => {
    const handler = new StepUpHandler(apiClient, () => 'password');
    const run = handler.run(() => Promise.reject(new ApiError('TOO_MANY_LOGINS', 503)));
    await handler.submit('secret');
    expect(await run).toEqual({ status: 'handled' });
    expect(get(handler.state)).toMatchObject({
      asking: false,
      notice: { key: 'error.too-many-logins' },
    });
  });

  it('answers a second run by ending the first, and ignores a submit without a question', async () => {
    const handler = new StepUpHandler(apiClient, () => 'password');
    await handler.submit('nobody asked');
    handler.cancel();
    const first = handler.run(() => Promise.resolve(1));
    const second = handler.run(() => Promise.resolve(2));
    expect(await first).toEqual({ status: 'handled' });
    await handler.submit('secret');
    expect(await second).toEqual({ status: 'done', value: 2 });
  });

  it('sends nothing twice while a request is running', async () => {
    const handler = new StepUpHandler(apiClient, () => 'password');
    let finish: (value: number) => void = () => {};
    const request = vi.fn(() => new Promise<number>((resolve) => (finish = resolve)));
    const run = handler.run(request);
    const first = handler.submit('secret');
    await handler.submit('secret');
    expect(request).toHaveBeenCalledTimes(1);
    finish(7);
    await first;
    expect(await run).toEqual({ status: 'done', value: 7 });
  });
});
