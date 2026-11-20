import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { session, streamState } from '../stores/app';
import { textSnippet } from '../test/snippets';
import AppShell from './AppShell.svelte';
import BottomBar from './BottomBar.svelte';
import CommandPalette from './CommandPalette.svelte';
import LiveIndicator from './LiveIndicator.svelte';
import NavRail from './NavRail.svelte';
import TopBar from './TopBar.svelte';
import {
  ALL_ITEMS,
  BOTTOM_ITEMS,
  MORE_ITEMS,
  RAIL_COLLAPSED_KEY,
  readRailCollapsed,
  writeRailCollapsed,
} from './nav';

describe('nav', () => {
  it('offers the eight lenses of TRH-WEB-3, four of them on the phone bar', () => {
    expect(ALL_ITEMS.map((item) => item.lens)).toEqual([
      'due',
      'samm',
      'threat-models',
      'incidents',
      'isms',
      'catalogs',
      'reports',
      'settings',
    ]);
    expect(BOTTOM_ITEMS).toHaveLength(4);
    expect([...BOTTOM_ITEMS, ...MORE_ITEMS]).toEqual(ALL_ITEMS);
  });

  it('remembers the collapsed rail', () => {
    expect(readRailCollapsed()).toBe(false);
    writeRailCollapsed(true);
    expect(localStorage.getItem(RAIL_COLLAPSED_KEY)).toBe('true');
    expect(readRailCollapsed()).toBe(true);
  });
});

describe('NavRail', () => {
  it('marks the active lens and labels every lens from the catalogue', async () => {
    const onToggle = vi.fn();
    render(NavRail, { activeLens: 'samm', collapsed: false, onToggle });
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByTestId('nav-samm')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-due')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('nav-threat-models')).toHaveTextContent('Threat models');
    await fireEvent.click(screen.getByTestId('rail-toggle'));
    expect(onToggle).toHaveBeenCalled();
  });

  it('names the home link and each lens when collapsed', () => {
    render(NavRail, { activeLens: null, collapsed: true, onToggle: () => {} });
    expect(screen.getByRole('link', { name: 'Open the start page' })).toBeInTheDocument();
    expect(screen.getByTestId('nav-isms')).toHaveAttribute('title', 'ISMS');
  });
});

describe('LiveIndicator', () => {
  it('says the state in words and offers a retry when offline', async () => {
    const retry = vi.spyOn(apiClient, 'retryEvents').mockImplementation(() => {});
    streamState.set('connected');
    const { rerender } = render(LiveIndicator);
    expect(screen.getByTestId('live-indicator')).toHaveTextContent('Live');
    streamState.set('offline');
    await rerender({});
    await fireEvent.click(screen.getByTestId('live-retry'));
    expect(retry).toHaveBeenCalled();
  });
});

describe('TopBar', () => {
  it('shows the view title, the user and signs out', async () => {
    const logout = vi.spyOn(apiClient, 'logout').mockResolvedValue();
    session.set({
      user: { pseudonym: 'p', name: 'Alex Example' },
      rights: [],
      csrfToken: 't',
      firstLoginRequired: false,
    });
    const onSearch = vi.fn();
    render(TopBar, { titleKey: 'lens.samm', onSearch });
    expect(screen.getByTestId('view-title')).toHaveTextContent('SAMM');
    expect(screen.getByTestId('user-name')).toHaveTextContent('Signed in as Alex Example');
    await fireEvent.click(screen.getByTestId('search-open'));
    expect(onSearch).toHaveBeenCalled();
    await fireEvent.click(screen.getByTestId('sign-out'));
    expect(logout).toHaveBeenCalled();
    session.set(null);
  });
});

describe('BottomBar', () => {
  it('opens "More" with the remaining lenses', async () => {
    render(BottomBar, { activeLens: 'reports' });
    expect(screen.getByTestId('bottom-more')).toHaveClass('bottom-bar__item--active');
    await fireEvent.click(screen.getByTestId('bottom-more'));
    expect(screen.getByRole('link', { name: /Reports/ })).toHaveAttribute('aria-current', 'page');
  });
});

describe('CommandPalette', () => {
  it('filters the views as the user types and opens the first match on Enter', async () => {
    const onnavigate = vi.fn();
    render(CommandPalette, { open: true, onnavigate });
    const input = screen.getByTestId('search-input');
    await fireEvent.input(input, { target: { value: 'inci' } });
    expect(screen.getByTestId('search-result-incidents')).toBeInTheDocument();
    expect(screen.queryByTestId('search-result-samm')).toBeNull();
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onnavigate).toHaveBeenCalledWith('/incidents');
  });

  it('says when nothing matches, and opens with Ctrl+K', async () => {
    const onnavigate = vi.fn();
    const { container } = render(CommandPalette, { open: false, onnavigate });
    await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(container.ownerDocument.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    await fireEvent.input(screen.getByTestId('search-input'), { target: { value: 'zzz' } });
    expect(screen.getByText('No view matches.')).toBeInTheDocument();
    await fireEvent.keyDown(screen.getByTestId('search-input'), { key: 'Enter' });
    expect(onnavigate).not.toHaveBeenCalled();
  });

  it('opens a clicked result', async () => {
    const onnavigate = vi.fn();
    render(CommandPalette, { open: true, onnavigate });
    await fireEvent.click(screen.getByTestId('search-result-settings'));
    expect(onnavigate).toHaveBeenCalledWith('/settings');
  });
});

describe('AppShell', () => {
  it('frames the view with notices, a skip link and a toggleable rail', async () => {
    render(AppShell, {
      activeLens: 'due',
      titleKey: 'lens.due',
      onnavigate: () => {},
      notices: textSnippet('notice'),
      content: textSnippet('content'),
    });
    expect(screen.getByRole('main')).toHaveTextContent('content');
    expect(screen.getByText('notice')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    await fireEvent.click(screen.getByTestId('rail-toggle'));
    expect(readRailCollapsed()).toBe(true);
    await fireEvent.click(screen.getByTestId('search-open'));
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
  });
});
