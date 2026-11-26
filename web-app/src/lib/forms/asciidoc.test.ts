import { fireEvent, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { field, last, open } from './formHarness';
import type { FormServices, Rendered } from './services';
import { CLEAN_NOTE } from './testkit';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** @returns the requests to the renderer made so far */
function renders(requests: string[]): number {
  return requests.filter((request) => request === 'POST /api/v1/render/asciidoc').length;
}

describe('AsciiDocField with the preview of the server (AUN-WEB-4, AsciiDoc Preview)', () => {
  it('stores the source as a string, and removes the property when it is emptied', async () => {
    const { onchange } = await open('test-note');
    await fireEvent.input(field('Details'), { target: { value: '== Decision' } });
    expect(last(onchange)).toEqual({ body: '== Decision' });
    await fireEvent.input(field('Details'), { target: { value: '' } });
    expect(last(onchange)).toEqual({});
    expect(screen.queryByRole('region', { name: 'Preview' })).toBeNull();
  });

  it('asks for the preview no sooner than 500 ms after the last change and shows what the server renders', async () => {
    const { kit } = await open('test-note');
    vi.useFakeTimers();
    await fireEvent.input(field('Details'), { target: { value: '== Decision' } });
    await vi.advanceTimersByTimeAsync(499);
    expect(renders(kit.requests)).toBe(0);
    // Another letter restarts the pause.
    await fireEvent.input(field('Details'), {
      target: { value: '== Decision\n\nWe *agree* to rotate the keys, see `ops/keys`.' },
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(renders(kit.requests)).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(renders(kit.requests)).toBe(1);
    vi.useRealTimers();
    const preview = await screen.findByRole('region', { name: 'Preview' });
    expect(
      within(preview).getByRole('heading', { name: 'Decision', level: 2 }),
    ).toBeInTheDocument();
    expect(within(preview).getByText('agree').tagName).toBe('STRONG');
    expect(within(preview).getByText('ops/keys').tagName).toBe('CODE');
  });

  it('renders the source it holds when the form opens, with lists and headings of the allow-list', async () => {
    await open('test-note', { ...CLEAN_NOTE });
    const preview = await screen.findByRole('region', { name: 'Preview' });
    await within(preview).findByRole('heading', { name: 'Decision' });
    expect(
      within(preview)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['quarterly', 'before every release']);
  });

  it('drops the answer of a request that a later one has overtaken', async () => {
    const { kit } = await open('test-note');
    const waiting = new Map<string, (answer: Rendered) => void>();
    const services: FormServices = {
      ...kit.services,
      render: (source) => new Promise<Rendered>((resolve) => waiting.set(source, resolve)),
    };
    const view = await open('test-note', {}, { services });
    void view;
    const details = screen.getAllByLabelText(/^Details/).at(-1)!;
    await fireEvent.input(details, { target: { value: 'first' } });
    await waitFor(() => expect(waiting.has('first')).toBe(true), { timeout: 2000 });
    await fireEvent.input(details, { target: { value: 'second' } });
    await waitFor(() => expect(waiting.has('second')).toBe(true), { timeout: 2000 });
    // The later answer comes first; the earlier one arrives after it and must not replace it.
    waiting.get('second')!({ state: 'html', html: '<p>second answer</p>' });
    await screen.findByText('second answer');
    waiting.get('first')!({ state: 'html', html: '<p>first answer</p>' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('first answer')).toBeNull();
    expect(screen.getByText('second answer')).toBeInTheDocument();
  });

  it('shows nothing the allow-list does not let through, and no markup of the server', async () => {
    const { container } = await open(
      'test-note',
      { body: 'anything' },
      {},
      'workshop#preview-hostile',
    );
    const preview = await screen.findByRole('region', { name: 'Preview' });
    await within(preview).findByRole('heading', { name: 'Decision' });
    expect(within(preview).getByRole('link', { name: 'good link' })).toHaveAttribute(
      'href',
      'https://example.org/doc',
    );
    expect(within(preview).getByRole('link', { name: 'good link' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(within(preview).getByRole('link', { name: 'good link' })).not.toHaveAttribute('target');
    expect(within(preview).getByRole('link', { name: 'fragment' })).toHaveAttribute(
      'href',
      '#section',
    );
    expect(within(preview).queryByRole('link', { name: 'bad link' })).toBeNull();
    expect(within(preview).queryByRole('link', { name: 'data link' })).toBeNull();
    expect(preview).toHaveTextContent('bad link');
    for (const forbidden of ['script', 'iframe', 'img', 'form', 'svg', 'input']) {
      expect(preview.querySelector(forbidden), forbidden).toBeNull();
    }
    expect(preview.querySelector('[onclick], [style], [class="paragraph"], [id="x"]')).toBeNull();
    expect(container.innerHTML).not.toContain('tracker.invalid');
  });

  it('says that no preview is shown when the renderer cannot run, and goes on editing', async () => {
    const { onchange } = await open('test-note', {}, {}, 'workshop#preview-unavailable');
    await fireEvent.input(field('Details'), { target: { value: '== Decision' } });
    await screen.findByText(/No preview is shown/);
    await fireEvent.input(field('Details'), { target: { value: '== Decision\n\nmore' } });
    expect(last(onchange)).toEqual({ body: '== Decision\n\nmore' });
  });

  it('says that a source over the limit has no preview, without asking the server', async () => {
    const { kit } = await open('test-note', { body: 'é'.repeat(32_769) });
    await screen.findByText(/too long for a preview/);
    expect(renders(kit.requests)).toBe(0);
  });
});
