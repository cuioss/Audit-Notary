import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { ApiError } from '../../api/errors';
import { session, status } from '../../stores/app';
import { breadcrumb } from '../../stores/breadcrumb';
import { resetKit, useProfile, type Kit } from '../documents/testkit';
import ThreatModelReleaseView from './ThreatModelReleaseView.svelte';

/**
 * The review and release of a threat model (UC-TM-2, AUN-WEB-6) against the `threat-model-*` states of the profile
 * `workshop` (AUN-TEST-1): the review with the changes one threat at a time, the release by its way of confirming, every
 * refusal with its text, the seal, and the addresses that are no release.
 */
afterEach(resetKit);

/**
 * @param profile `name` or `name#state`
 * @param lang the language
 * @param params the address of the release
 * @returns the kit with the review open
 */
async function open(
  profile: string,
  lang: 'en' | 'de' = 'en',
  params: Record<string, string> = { service: 'payment-api', model: 'checkout-flow' },
): Promise<Kit> {
  const kit = await useProfile(profile, lang);
  status.set(await apiClient.getStatus());
  render(ThreatModelReleaseView, { params });
  await screen.findByTestId('release-record');
  return kit;
}

describe('the review', () => {
  it('shows what is released: the model, its facts, the changes by property and the checks', async () => {
    await open('workshop#threat-model-in-review');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Release Payment API, checkout flow',
    );
    expect(screen.getByTestId('release-act')).toHaveTextContent(/^Release$/);
    const facts = screen.getByTestId('release-facts');
    expect(facts).toHaveTextContent('Payment API');
    expect(facts).toHaveTextContent('Version 4');
    expect(facts).toHaveTextContent('2 untreated');
    expect(screen.getByText('Changes since v3.')).toBeInTheDocument();
    // The review date and the two lists changed: each is a group of the record.
    expect(screen.getByTestId('record-data:last-review')).toHaveTextContent('Review date');
    expect(screen.getByTestId('record-model:threats')).toHaveTextContent('Threats');
    expect(screen.getByTestId('record-model:mitigations')).toHaveTextContent('Countermeasures');
    expect(get(breadcrumb).map((crumb) => crumb.label)).toEqual([
      'Payment API',
      'Payment API, checkout flow',
      'Release',
    ]);
  });

  it('reads a threat at a time and says what changed in it, never two lists of nine side by side', async () => {
    await open('workshop#threat-model-in-review');
    const threats = screen.getByTestId('record-model:threats');
    const changed = threats.querySelectorAll('li.change');
    // Only the threat that changed is a change: T-03 went from open to mitigated.
    expect(changed).toHaveLength(1);
    expect(changed[0]).toHaveTextContent('T-03');
    expect(changed[0].querySelector('del')).toHaveTextContent('Open');
    expect(changed[0].querySelector('ins')).toHaveTextContent('Mitigated');
    expect(changed[0].querySelector('ins')).toHaveTextContent('Card data in the application log');
    const mitigations = screen.getByTestId('record-model:mitigations');
    expect(mitigations.querySelectorAll('li.change')).toHaveLength(1);
    expect(mitigations).toHaveTextContent('M-03');
    expect(mitigations.querySelector('del')).toHaveTextContent('Planned');
    expect(mitigations.querySelector('ins')).toHaveTextContent('Implemented');
  });

  it('reads the whole list when the countermeasures were reordered and an issue id changed', async () => {
    const entry = (id: string, issue: string) => ({
      id,
      name: `Countermeasure ${id}`,
      riskReduction: 50,
      attributes: { threat: 'T-03', issues: [issue] },
    });
    const before = [entry('M-01', 'A'), entry('M-02', 'C')];
    const after = [entry('M-02', 'C'), entry('M-01', 'B')];
    await useProfile('workshop#threat-model-in-review', 'en', {
      'GET /api/v1/documents/threat-models/payment-api-checkout-flow/diff': {
        repository: 'threat-models',
        id: 'payment-api-checkout-flow',
        from: 'models/payment-api-checkout-flow/v3',
        to: 'working',
        sections: [{ part: 'model', changes: [{ pointer: '/mitigations', before, after }] }],
      },
    });
    status.set(await apiClient.getStatus());
    render(ThreatModelReleaseView, { params: { service: 'payment-api', model: 'checkout-flow' } });
    const record = await screen.findByTestId('record-model:mitigations');
    expect(record.querySelectorAll('li.change')).toHaveLength(1);
    expect(record.querySelector('del')).toHaveTextContent('M-01');
    expect(record.querySelector('del')).toHaveTextContent('A');
    expect(record.querySelector('ins')).toHaveTextContent('B');
  });

  it('reads the review date as the form reads it', async () => {
    await open('workshop#threat-model-in-review');
    const group = screen.getByTestId('record-data:last-review');
    expect(group.querySelector('del')).toHaveTextContent('Jun 1, 2026');
    expect(group.querySelector('ins')).toHaveTextContent('Nov 26, 2026');
  });

  it('checks the review date and the mandatory fields before the release', async () => {
    await open('workshop#threat-model-in-review');
    expect(screen.getByText('Every mandatory field is filled in')).toBeInTheDocument();
    expect(screen.getByText('Reviewed on Nov 26, 2026')).toBeInTheDocument();
    expect(screen.getByText(/Submitted for review by Alex Example/)).toBeInTheDocument();
    expect(
      screen.getByText('You confirm your identity once more before the release.'),
    ).toBeInTheDocument();
  });

  it('is read in German with the words of the domain only', async () => {
    await open('workshop#threat-model-in-review', 'de');
    expect(screen.getByTestId('release-act')).toHaveTextContent(/^Freigeben$/);
    expect(screen.getByTestId('record-model:threats')).toHaveTextContent('Bedrohungen');
    expect(screen.getByTestId('record-model:threats').querySelector('ins')).toHaveTextContent(
      'Gemindert',
    );
  });

  it('offers the way back to the model, which writes nothing', async () => {
    const kit = await open('workshop#threat-model-in-review');
    expect(screen.getByTestId('release-back')).toHaveAttribute(
      'href',
      '/threat-models/payment-api/checkout-flow',
    );
    expect(kit.requests.filter((request) => request.startsWith('POST'))).toHaveLength(0);
  });
});

describe('the release', () => {
  it('steps up with the identity provider first, then presses the seal', async () => {
    const kit = await open('workshop#threat-model-release-step-up');
    const stepUp = vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    await fireEvent.click(screen.getByTestId('release-act'));
    await vi.waitFor(() => expect(stepUp).toHaveBeenCalled());
    expect(kit.scenario.state()).toBe('threat-model-release-stepped-up');
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByTestId('release-done')).toHaveTextContent('Released as v4');
    expect(kit.scenario.state()).toBe('threat-model-released');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Payment API, checkout flow is released',
    );
    const seal = screen.getByTestId('release-seal');
    expect(seal).toHaveAttribute('data-sealed', 'v4');
    expect(within(seal).getByRole('img')).toHaveAccessibleName(
      'Seal of the release of Payment API, checkout flow: v4',
    );
    expect(screen.getByTestId('release-tag')).toHaveTextContent('models/');
    expect(screen.getByTestId('release-open')).toHaveAttribute(
      'href',
      '/threat-models/payment-api/checkout-flow',
    );
    expect(screen.queryByTestId('release-act')).toBeNull();
  });

  it('reads the review again when someone saved meanwhile, then releases what was shown', async () => {
    const kit = await open('workshop#threat-model-release-changed');
    vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(
      await screen.findByText(
        'Someone saved after you opened the release. Check the changes again.',
      ),
    ).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(kit.scenario.state()).toBe('threat-model-release-changed-reviewed'),
    );
    expect(screen.queryByTestId('release-done')).toBeNull();
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByTestId('release-done')).toBeInTheDocument();
  });

  it('shows that someone released the model meanwhile, and writes nothing more', async () => {
    const kit = await open('workshop#threat-model-in-review');
    vi.spyOn(apiClient, 'release').mockRejectedValueOnce(
      new ApiError('DOCUMENT_RELEASED', 409, [], { tag: 'models/payment-api-checkout-flow/v4' }),
    );
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(
      await screen.findByText(
        'Someone released this document while you were reviewing it. Nothing was changed.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('release-done')).toBeNull();
    // The review is read again: the record the person sees is the current one.
    await vi.waitFor(() =>
      expect(
        kit.requests.filter(
          (request) => request === 'GET /api/v1/threat-models/payment-api/checkout-flow',
        ).length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  it('tells a release the Git server cannot take, and keeps the review', async () => {
    await open('workshop#threat-model-in-review');
    vi.spyOn(apiClient, 'release').mockRejectedValueOnce(new ApiError('GIT_UNAVAILABLE', 503));
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByRole('alert')).toHaveTextContent('The Git server cannot be reached.');
    expect(screen.getByTestId('release-record')).toBeInTheDocument();
  });

  it('lists the mandatory fields the server found empty, by their words', async () => {
    await open('workshop#threat-model-in-review');
    vi.spyOn(apiClient, 'release').mockRejectedValueOnce(
      new ApiError('MANDATORY_FIELDS_MISSING', 422, [], {
        missing: ['/model/project/name', '/owner'],
      }),
    );
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(
      await screen.findByText('Fill in Name, Owner, then release again. Nothing was changed.'),
    ).toBeInTheDocument();
  });
});

describe('when the release cannot be taken', () => {
  it('says why without the approve right, and sends nothing', async () => {
    const kit = await useProfile('workshop#threat-model-in-review');
    status.set(await apiClient.getStatus());
    session.update((held) =>
      held
        ? {
            ...held,
            rights: held.rights.map((right) =>
              right.repository === 'threat-models'
                ? { ...right, actions: ['read', 'edit'] }
                : right,
            ),
          }
        : held,
    );
    render(ThreatModelReleaseView, {
      params: { service: 'payment-api', model: 'checkout-flow' },
    });
    await screen.findByTestId('release-record');
    expect(screen.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Releasing needs the approve right.')).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(kit.requests.filter((request) => request.startsWith('POST'))).toHaveLength(0);
  });

  it('asks for the submit first for a draft, and says that a released model is released already', async () => {
    await open('workshop#threat-model-reopened');
    expect(screen.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Submit the document for review first.')).toBeInTheDocument();
  });

  it('says that a released model has nothing to release, and offers no promise of a release', async () => {
    await open('workshop');
    expect(screen.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('This document is released already.')).toBeInTheDocument();
    expect(screen.queryByText('The release is signed in your name and tagged.')).toBeNull();
    expect(screen.getByText(/Nothing changed since v3/)).toBeInTheDocument();
  });
});

describe('addresses that are no release', () => {
  it('is the not-found view for a model that does not exist', async () => {
    await useProfile('workshop');
    render(ThreatModelReleaseView, { params: { service: 'payment-api', model: 'nowhere' } });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('shows a failure to read as a notice', async () => {
    await useProfile('release');
    render(ThreatModelReleaseView, {
      params: { service: 'payment-api', model: 'checkout-flow' },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
