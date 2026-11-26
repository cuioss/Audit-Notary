import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, MAX_IMPORT_DOCUMENTS } from '../../directory/directory';
import { resetKit, useProfile, type Kit } from '../documents/testkit';
import ImportView from './ImportView.svelte';

/**
 * The Backstage import (UC-CAT-3, `/directory/import`) against the `catalog-admin` profile of the scenario mock
 * (AUN-TEST-1): choosing and pasting descriptors, the limits, the preview that writes nothing, the import and its result
 * with the reason of everything left out, the refusals the register names, and a user without the right.
 */
afterEach(() => {
  cleanup();
  resetKit();
});

const YAML = 'apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: checkout-ui\n';

/** Opens the page. */
async function open(profile = 'catalog-admin', lang: 'en' | 'de' = 'en'): Promise<Kit> {
  const kit = await useProfile(profile, lang);
  render(ImportView);
  return kit;
}

/** Pastes a descriptor and adds it to the documents. */
async function paste(text = YAML) {
  await fireEvent.input(screen.getByLabelText('Paste a descriptor'), { target: { value: text } });
  await fireEvent.click(screen.getByTestId('import-paste-add'));
}

/** Picks files through the file input, as the system's dialog does. */
async function pick(files: File[]) {
  const input = screen.getByTestId('import-pick-input');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  await fireEvent.change(input);
}

/** Pastes a descriptor and asks for the check. */
async function check() {
  await paste();
  await fireEvent.click(screen.getByTestId('import-check'));
  await screen.findByTestId('import-result');
}

const sentTo = (kit: Kit, request: string) =>
  kit.bodies.filter((body) => body.request === request).map((body) => body.body);

describe('choosing the descriptors', () => {
  it('starts at the first step, with the check out of reach and saying why', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Import from Backstage');
    const steps = screen.getByTestId('import-steps');
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['1 Choose documents', '2 Check', '3 Result']);
    expect(within(steps).getByText('Choose documents').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByTestId('import-check')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Choose or paste a document first.')).toBeInTheDocument();
    expect(screen.getByTestId('import-paste-add')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByTestId('import-documents')).toBeNull();
  });

  it('lists a pasted text with its size, and removes it again', async () => {
    await open();
    await paste();
    const list = screen.getByTestId('import-documents');
    expect(list).toHaveTextContent('Pasted text 1');
    expect(list).toHaveTextContent(`${YAML.length} bytes`);
    expect(screen.getByTestId('import-budget')).toHaveTextContent(
      `Documents: 1 of 100. Size: ${YAML.length} bytes of 2.0 MiB.`,
    );
    expect(screen.getByLabelText('Paste a descriptor')).toHaveValue('');
    await paste('kind: Group\n');
    expect(screen.getByTestId('import-document-1')).toHaveTextContent('Pasted text 2');
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Pasted text 1' }));
    expect(screen.getByTestId('import-documents').querySelectorAll('li')).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Pasted text 2' }));
    expect(screen.queryByTestId('import-documents')).toBeNull();
  });

  it('reads the files that are picked and keeps one file of a name once', async () => {
    await open();
    await pick([
      new File([YAML], 'catalog-info.yaml'),
      new File(['kind: System\n'], 'system.yaml'),
    ]);
    await waitFor(() =>
      expect(screen.getByTestId('import-documents').querySelectorAll('li')).toHaveLength(2),
    );
    expect(screen.getByTestId('import-document-0')).toHaveTextContent('catalog-info.yaml');
    await pick([new File([YAML], 'catalog-info.yaml')]);
    await Promise.resolve();
    expect(screen.getByTestId('import-documents').querySelectorAll('li')).toHaveLength(2);
  });

  it('keeps a different text under a name that is taken, and the same file once', async () => {
    await open();
    await pick([new File([YAML], 'catalog-info.yaml')]);
    await waitFor(() => expect(screen.getByTestId('import-document-0')).toBeInTheDocument());
    await pick([new File(['kind: Group\n'], 'catalog-info.yaml')]);
    await waitFor(() => expect(screen.getByTestId('import-document-1')).toBeInTheDocument());
    expect(screen.getByTestId('import-document-1')).toHaveTextContent('catalog-info.yaml (2)');
    await pick([new File(['kind: Group\n'], 'catalog-info.yaml')]);
    await pick([new File([YAML], 'catalog-info.yaml')]);
    expect(screen.getByTestId('import-documents').querySelectorAll('li')).toHaveLength(2);
  });

  it('refuses more documents than one import takes, and says the limit', async () => {
    await open();
    for (let n = 0; n <= MAX_IMPORT_DOCUMENTS; n += 1) {
      await pick([new File([`name: d${n}\n`], `d${n}.yaml`)]);
    }
    await waitFor(() =>
      expect(screen.getByTestId('import-budget')).toHaveTextContent('101 of 100'),
    );
    expect(screen.getByTestId('import-check')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('At most 100 documents can be imported at once.')).toBeInTheDocument();
  });

  it('refuses more bytes than one import takes, and says the limit', async () => {
    await open();
    await paste('x'.repeat(MAX_IMPORT_BYTES + 1));
    expect(screen.getByTestId('import-budget')).toHaveTextContent('Size: 2.0 MiB of 2.0 MiB');
    expect(screen.getByTestId('import-check')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('The documents may be at most 2.0 MiB together.')).toBeInTheDocument();
  });
});

describe('the check', () => {
  it('writes nothing, and shows what would be created, updated, left alone and left out', async () => {
    const kit = await open();
    await check();
    expect(sentTo(kit, 'POST /api/v1/catalogs/import/backstage/preview')).toEqual([
      { documents: [{ name: 'Pasted text 1', content: YAML }] },
    ]);
    expect(kit.requests.filter((request) => request.startsWith('POST'))).toEqual([
      'POST /api/v1/catalogs/import/backstage/preview',
    ]);
    expect(screen.getByText('This is a check, nothing is written yet')).toBeInTheDocument();
    // Nothing is written yet, so the counts and the lists are the ones to come, never "created".
    expect(screen.getByTestId('import-counts')).toHaveTextContent('To create');
    expect(screen.getByTestId('import-counts')).toHaveTextContent('To update');
    expect(screen.getByTestId('import-counts')).not.toHaveTextContent('Created');
    expect(screen.getByRole('heading', { name: 'Entries to create' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entries to update' })).toBeInTheDocument();
    expect(screen.getByTestId('count-created')).toHaveTextContent('3');
    expect(screen.getByTestId('count-updated')).toHaveTextContent('2');
    expect(screen.getByTestId('count-unchanged')).toHaveTextContent('4');
    expect(screen.getByTestId('count-left-out')).toHaveTextContent('5');
    const steps = screen.getByTestId('import-steps');
    expect(within(steps).getByText('Check').closest('li')).toHaveAttribute('aria-current', 'step');
    const created = screen.getByTestId('created-service-checkout-ui');
    expect(created).toHaveTextContent('Checkout UI');
    expect(created).toHaveTextContent('Service');
    expect(created).toHaveTextContent('checkout-ui');
    // Nothing exists yet that could be opened.
    expect(within(created).queryByRole('link')).toBeNull();
    const updated = screen.getByTestId('updated-service-payment-api');
    expect(updated).toHaveTextContent('Lifecycle, Team, Depends on');
    expect(within(updated).getByRole('link', { name: 'Payment API' })).toHaveAttribute(
      'href',
      '/catalogs/service/payment-api',
    );
  });

  it('gives every item left out the sentence of its reason, its entity, its field and its detail', async () => {
    await open();
    await check();
    const rows = screen.getByTestId('import-left-out').querySelectorAll('tbody tr');
    expect([...rows].map((row) => row.getAttribute('data-reason'))).toEqual([
      'LIFECYCLE_UNMAPPED',
      'DEFAULTS_MISSING',
      'NAMESPACE_NOT_DEFAULT',
      'REFERENCE_KIND_NOT_SUPPORTED',
      'KIND_NOT_SUPPORTED',
    ]);
    const first = screen.getByTestId('left-out-0');
    expect(first).toHaveTextContent('component:default/billing-batch');
    expect(first).toHaveTextContent('spec.lifecycle');
    expect(first).toHaveTextContent('The lifecycle has no mapping.');
    expect(first).toHaveTextContent('experimental');
    expect(screen.getByTestId('left-out-1')).toHaveTextContent('owner.role, protection-needs');
    expect(screen.getByTestId('left-out-4')).toHaveTextContent(
      'Only components, systems and groups are imported; this kind was left out.',
    );
  });

  it('goes back to the documents with them kept', async () => {
    await open();
    await check();
    await fireEvent.click(screen.getByTestId('import-back'));
    expect(screen.getByTestId('import-choose')).toBeInTheDocument();
    expect(screen.getByTestId('import-documents')).toHaveTextContent('Pasted text 1');
  });

  it('offers no import when nothing would be created or updated', async () => {
    await open('catalog-admin#import-nothing-new');
    await check();
    expect(screen.getByTestId('count-created')).toHaveTextContent('0');
    expect(screen.getByTestId('count-unchanged')).toHaveTextContent('11');
    expect(screen.queryByTestId('import-created')).toBeNull();
    expect(screen.queryByTestId('import-updated')).toBeNull();
    expect(screen.getByTestId('import-apply')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Nothing would be created or updated.')).toBeInTheDocument();
  });
});

describe('the import', () => {
  it('writes in one request, and shows the result with the entries linked', async () => {
    const kit = await open();
    await check();
    await fireEvent.click(screen.getByTestId('import-apply'));
    await screen.findByText('The import is finished');
    expect(sentTo(kit, 'POST /api/v1/catalogs/import/backstage')).toEqual([
      { documents: [{ name: 'Pasted text 1', content: YAML }] },
    ]);
    expect(screen.queryByText('This is a check, nothing is written yet')).toBeNull();
    expect(screen.getByTestId('import-counts')).toHaveTextContent('Created');
    expect(screen.getByRole('heading', { name: 'Created entries' })).toBeInTheDocument();
    expect(screen.getByTestId('count-created')).toHaveTextContent('3');
    expect(
      within(screen.getByTestId('created-service-checkout-ui')).getByRole('link', {
        name: 'Checkout UI',
      }),
    ).toHaveAttribute('href', '/catalogs/service/checkout-ui');
    expect(screen.getByTestId('import-open')).toHaveAttribute('href', '/catalogs');
    expect(screen.getByText('Imported: 3 created, 2 updated.')).toHaveAttribute('role', 'status');
  });

  it('starts again with no documents', async () => {
    await open();
    await check();
    await fireEvent.click(screen.getByTestId('import-apply'));
    await screen.findByText('The import is finished');
    await fireEvent.click(screen.getByTestId('import-again'));
    expect(screen.getByTestId('import-choose')).toBeInTheDocument();
    expect(screen.queryByTestId('import-documents')).toBeNull();
  });

  it('says that a descriptor is not valid, and marks the document', async () => {
    await open('catalog-admin#import-invalid');
    await paste('a: b\n');
    await paste(': : :\n');
    await fireEvent.click(screen.getByTestId('import-check'));
    const failure = await screen.findByTestId('import-failure');
    expect(failure).toHaveTextContent(
      'A descriptor could not be read. Check that it is valid YAML.',
    );
    expect(screen.getByTestId('import-document-0')).toHaveTextContent('Not valid');
    expect(screen.getByTestId('import-document-1')).not.toHaveTextContent('Not valid');
    // Changing the documents takes the marks and the notice away.
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Pasted text 2' }));
    expect(screen.queryByTestId('import-failure')).toBeNull();
    expect(screen.queryByText('Not valid')).toBeNull();
  });

  it('says how large the server lets the documents be when it refuses their size', async () => {
    await open('catalog-admin#import-too-large');
    await paste();
    await fireEvent.click(screen.getByTestId('import-check'));
    const failure = await screen.findByTestId('import-failure');
    expect(failure).toHaveTextContent('The documents are too large.');
    expect(failure).toHaveTextContent('The limit is 2.0 MiB together.');
  });

  it('says that the Git server cannot be reached, and stays on the check', async () => {
    await open('catalog-admin#git-unavailable');
    await check();
    await fireEvent.click(screen.getByTestId('import-apply'));
    expect(await screen.findByTestId('import-failure')).toHaveTextContent(
      'The Git server cannot be reached.',
    );
    expect(screen.getByTestId('import-result')).toBeInTheDocument();
    expect(screen.queryByText('The import is finished')).toBeNull();
  });

  it('is told by the server when the directory is kept elsewhere', async () => {
    await useProfile('catalog-admin', 'en', {
      'POST /api/v1/catalogs/import/backstage/preview': new Response(
        JSON.stringify({ outcome: 'MANAGED_BY_SOURCE' }),
        { status: 409 },
      ),
    });
    render(ImportView);
    await paste();
    await fireEvent.click(screen.getByTestId('import-check'));
    expect(await screen.findByTestId('import-failure')).toHaveTextContent(
      'Your organisation keeps its persons in its own source.',
    );
  });

  it('shows a refusal of the right as the notice of the refusal', async () => {
    await useProfile('catalog-admin', 'en', {
      'POST /api/v1/catalogs/import/backstage/preview': new Response(
        JSON.stringify({ outcome: 'FORBIDDEN' }),
        { status: 403 },
      ),
    });
    render(ImportView);
    await paste();
    await fireEvent.click(screen.getByTestId('import-check'));
    expect(await screen.findByTestId('import-failure')).toHaveTextContent(
      'You have no right for this action.',
    );
  });

  it('says that the documents are not valid when the server names no document', async () => {
    await useProfile('catalog-admin', 'en', {
      'POST /api/v1/catalogs/import/backstage/preview': new Response(
        JSON.stringify({
          outcome: 'VALIDATION',
          errors: [{ pointer: '/documents', code: 'REQUIRED' }],
        }),
        { status: 422 },
      ),
    });
    render(ImportView);
    await paste();
    await fireEvent.click(screen.getByTestId('import-check'));
    expect(await screen.findByTestId('import-failure')).toHaveTextContent(
      'The documents are not valid.',
    );
    expect(screen.getByTestId('import-document-0')).not.toHaveTextContent('Not valid');
  });
});

describe('a document refused at the import', () => {
  it('goes back to the documents and marks it', async () => {
    await useProfile('catalog-admin', 'en', {
      'POST /api/v1/catalogs/import/backstage': new Response(
        JSON.stringify({
          outcome: 'VALIDATION',
          errors: [{ pointer: '/documents/0/content', code: 'INVALID_FORMAT' }],
        }),
        { status: 422 },
      ),
    });
    render(ImportView);
    await check();
    await fireEvent.click(screen.getByTestId('import-apply'));
    expect(await screen.findByTestId('import-choose')).toBeInTheDocument();
    expect(screen.getByTestId('import-document-0')).toHaveTextContent('Not valid');
    expect(screen.getByTestId('import-failure')).toHaveTextContent('could not be read');
  });
});

describe('without the right', () => {
  it.each(['workshop', 'read-only'])(
    'says that importing needs it, and shows nothing else in %s',
    async (profile) => {
      const kit = await open(profile);
      expect(
        screen.getByText('Importing needs the right to administer the catalogs.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to the catalogs' })).toHaveAttribute(
        'href',
        '/catalogs',
      );
      expect(screen.queryByTestId('import-steps')).toBeNull();
      expect(screen.queryByTestId('import-paste')).toBeNull();
      expect(screen.queryByTestId('import-check')).toBeNull();
      expect(kit.requests.filter((request) => request.includes('import'))).toEqual([]);
    },
  );
});

describe('in German', () => {
  it('speaks German at every step', async () => {
    await open('catalog-admin', 'de');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Import aus Backstage');
    await fireEvent.input(screen.getByLabelText('Beschreibung einfügen'), {
      target: { value: YAML },
    });
    await fireEvent.click(screen.getByTestId('import-paste-add'));
    expect(screen.getByTestId('import-budget')).toHaveTextContent(
      `Dokumente: 1 von 100. Größe: ${YAML.length} Bytes von 2.0 MiB.`,
    );
    await fireEvent.click(screen.getByTestId('import-check'));
    await screen.findByTestId('import-result');
    expect(screen.getByTestId('import-counts')).toHaveTextContent('Ausgelassen');
    expect(screen.getByTestId('left-out-2')).toHaveTextContent('Nur der Standard-Namensraum');
    expect(screen.getByTestId('updated-service-payment-api')).toHaveTextContent('Lebenszyklus');
  });
});
