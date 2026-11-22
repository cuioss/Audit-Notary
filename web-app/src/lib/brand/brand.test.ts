import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import BrandMark from './BrandMark.svelte';
import MascotFigure from './MascotFigure.svelte';
import Wordmark from './Wordmark.svelte';
import { MARK_IS_PROVISIONAL } from './brand';

describe('brand', () => {
  it('renders the mark decorative beside the name, in colour by default', () => {
    render(Wordmark, { withTagline: true });
    expect(screen.getByText('Audit Notary')).toBeInTheDocument();
    expect(screen.getByText(/the Git server you already run/)).toBeInTheDocument();
    const mark = screen.getByTestId('brand-mark');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveAttribute('data-rendering', 'colour');
  });

  it('names the mark when it stands alone', () => {
    render(Wordmark, { compact: true });
    expect(screen.getByRole('img', { name: 'Audit Notary' })).toBeInTheDocument();
  });

  it('offers the one-colour rendering', () => {
    render(BrandMark, { rendering: 'monochrome', size: 16, label: 'Audit Notary mark' });
    expect(screen.getByRole('img', { name: 'Audit Notary mark' })).toHaveAttribute('width', '16');
  });

  it('reduces to the seal alone at 16 pixels and keeps the page above', () => {
    render(BrandMark, { size: 16, label: 'small' });
    render(BrandMark, { size: 24, label: 'regular' });
    expect(screen.getByRole('img', { name: 'small' })).toHaveAttribute('data-variant', 'seal');
    expect(screen.getByRole('img', { name: 'regular' })).toHaveAttribute('data-variant', 'page');
  });

  it('ships no mascot pose before one is accepted, and records the mark as provisional', () => {
    const { container } = render(MascotFigure, { pose: 'welcome' });
    expect(container.querySelector('img')).toBeNull();
    expect(MARK_IS_PROVISIONAL).toBe(true);
  });
});
