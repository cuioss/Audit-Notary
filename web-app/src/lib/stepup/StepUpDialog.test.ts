import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { ApiError } from '../api/errors';
import { status } from '../stores/app';
import { scenarioFetch } from '../test/scenarioFetch';
import { StepUpHandler } from './stepUp';
import StepUpDialog from './StepUpDialog.svelte';

/**
 * What the step-up handler shows (UC-ACC-3): the dialog "Confirm your identity" and the notice of too many logins.
 */
afterEach(() => {
  vi.unstubAllGlobals();
  status.set(null);
});

/**
 * @param handler the handler
 * @returns the rendered dialog
 */
function show(handler: StepUpHandler) {
  return render(StepUpDialog, {
    handler,
    lede: 'Enter your password to release X.',
    actLabel: 'Release',
    testId: 'x',
  });
}

describe('StepUpDialog', () => {
  it('asks in a dialog titled "Confirm your identity" and names the domain act on its button', async () => {
    const handler = new StepUpHandler(apiClient, () => 'password');
    show(handler);
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog).not.toHaveAttribute('open');
    const run = handler.run(() => Promise.resolve('ok'));
    await vi.waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).getByText('Confirm your identity')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter your password to release X.')).toBeInTheDocument();
    expect(within(dialog).getByTestId('x-confirm')).toHaveTextContent(/^Release$/);
    expect(dialog.textContent).not.toMatch(/MFA|step-up|token/i);
    await fireEvent.input(within(dialog).getByTestId('x-password'), { target: { value: 'pw' } });
    await fireEvent.click(within(dialog).getByTestId('x-confirm'));
    expect(await run).toEqual({ status: 'done', value: 'ok' });
    await vi.waitFor(() => expect(dialog).not.toHaveAttribute('open'));
  });

  it('refuses an empty password without a request, and starts each question with an empty field', async () => {
    const handler = new StepUpHandler(apiClient, () => 'password');
    const request = vi.fn(() => Promise.resolve('ok'));
    show(handler);
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    void handler.run(request);
    await vi.waitFor(() => expect(dialog).toHaveAttribute('open'));
    await fireEvent.click(within(dialog).getByTestId('x-confirm'));
    expect(within(dialog).getByText('Fill in this field.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
    await fireEvent.input(within(dialog).getByTestId('x-password'), { target: { value: 'pw' } });
    handler.cancel();
    await vi.waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    void handler.run(request);
    await vi.waitFor(() => expect(dialog).toHaveAttribute('open'));
    expect(within(dialog).getByTestId('x-password')).toHaveValue('');
    expect(within(dialog).queryByText('Fill in this field.')).toBeNull();
  });

  it('says that the password is not right and keeps the dialog open', async () => {
    const handler = new StepUpHandler(apiClient, () => 'password');
    show(handler);
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    void handler.run(() => Promise.reject(new ApiError('INVALID_CREDENTIALS', 401)));
    await vi.waitFor(() => expect(dialog).toHaveAttribute('open'));
    await fireEvent.input(within(dialog).getByTestId('x-password'), { target: { value: 'no' } });
    await fireEvent.click(within(dialog).getByTestId('x-confirm'));
    expect(
      await within(dialog).findByText('The password is not right. Nothing was changed.'),
    ).toBeInTheDocument();
    expect(dialog).toHaveAttribute('open');
  });

  it('keeps the typed password while the request runs and clears it only after a wrong one', async () => {
    const handler = new StepUpHandler(apiClient, () => 'password');
    show(handler);
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    let refuse: (error: ApiError) => void = () => {};
    void handler.run(
      () =>
        new Promise<string>((_, reject) => {
          refuse = reject;
        }),
    );
    await vi.waitFor(() => expect(dialog).toHaveAttribute('open'));
    const field = within(dialog).getByTestId('x-password');
    await fireEvent.input(field, { target: { value: 'no' } });
    await fireEvent.click(within(dialog).getByTestId('x-confirm'));
    await vi.waitFor(() =>
      expect(within(dialog).getByTestId('x-confirm')).toHaveAttribute('aria-busy', 'true'),
    );
    expect(field).toHaveValue('no');
    refuse(new ApiError('INVALID_CREDENTIALS', 401));
    expect(
      await within(dialog).findByText('The password is not right. Nothing was changed.'),
    ).toBeInTheDocument();
    expect(field).toHaveValue('');
  });

  it('ends the question when the dialog is closed by its own close button', async () => {
    const handler = new StepUpHandler(apiClient, () => 'password');
    show(handler);
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    const run = handler.run(() => Promise.resolve('ok'));
    await vi.waitFor(() => expect(dialog).toHaveAttribute('open'));
    await fireEvent.click(within(dialog).getAllByRole('button', { name: 'Cancel' })[0]);
    expect(await run).toEqual({ status: 'handled' });
  });

  it('shows the notice of too many logins from the release profile', async () => {
    const scenario = scenarioFetch('release#too-many-logins');
    vi.stubGlobal('fetch', scenario.fetch);
    status.set(await apiClient.getStatus());
    const handler = new StepUpHandler();
    show(handler);
    await handler.run(() => apiClient.release('samm-assessments', 'payments-2026-q4'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Many people are logging in right now. Try again in a minute.',
    );
  });
});
