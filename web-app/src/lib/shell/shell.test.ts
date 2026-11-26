import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import type { Action } from '../api/types';
import { session, streamState } from '../stores/app';
import { breadcrumb } from '../stores/breadcrumb';
import { textSnippet } from '../test/snippets';
import AppShell from './AppShell.svelte';
import BottomBar from './BottomBar.svelte';
import CommandPalette from './CommandPalette.svelte';
import NavRail from './NavRail.svelte';
import TopBar from './TopBar.svelte';
import { categoryList } from '../documents/categories';
import {
  ALL_ITEMS,
  BOTTOM_ITEMS,
  MORE_ITEMS,
  RAIL_COLLAPSED_KEY,
  allItems,
  bottomItems,
  moreItems,
  railGroups,
  readRailCollapsed,
  writeRailCollapsed,
} from './nav';

describe('nav', () => {
  it('offers the eight lenses of AUN-WEB-3, four of them on the phone bar', () => {
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

  it('adds the documents lens as the ninth entry, between ISMS and Catalogs, where a generic category exists', () => {
    expect(allItems(true).map((item) => item.lens)).toEqual([
      'due',
      'samm',
      'threat-models',
      'incidents',
      'isms',
      'categories',
      'catalogs',
      'reports',
      'settings',
    ]);
    expect(railGroups(true)[0].items.at(-1)?.lens).toBe('categories');
    expect(railGroups(false)).toEqual(railGroups(false));
    expect(allItems(false)).toEqual(ALL_ITEMS);
    expect(bottomItems(true)).toEqual(BOTTOM_ITEMS);
    expect(moreItems(true).map((item) => item.lens)).toEqual([
      'isms',
      'categories',
      'catalogs',
      'reports',
      'settings',
    ]);
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

describe('NavRail with the documents lens', () => {
  it('shows Documents only when it is offered, and marks it as the current lens', () => {
    const { unmount } = render(NavRail, { activeLens: null, collapsed: false, onToggle: () => {} });
    expect(screen.queryByTestId('nav-categories')).toBeNull();
    unmount();
    render(NavRail, {
      activeLens: 'categories',
      collapsed: false,
      onToggle: () => {},
      documents: true,
    });
    expect(screen.getByTestId('nav-categories')).toHaveTextContent('Documents');
    expect(screen.getByTestId('nav-categories')).toHaveAttribute('href', '/categories');
    expect(screen.getByTestId('nav-categories')).toHaveAttribute('aria-current', 'page');
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

describe('TopBar breadcrumb', () => {
  it('links the lens and the inner steps and marks the last step current', () => {
    breadcrumb.set([
      { label: 'Payments', href: '/samm/payments' },
      { label: '2026 Q4', href: '/samm/payments/2026-q4' },
    ]);
    render(TopBar, {
      titleKey: 'lens.samm',
      lensHref: '/samm',
      lensKey: 'lens.samm',
      onSearch: () => {},
    });
    expect(screen.getByRole('link', { name: 'SAMM' })).toHaveAttribute('href', '/samm');
    expect(screen.getByRole('link', { name: 'Payments' })).toHaveAttribute(
      'href',
      '/samm/payments',
    );
    expect(screen.getByText('2026 Q4')).toHaveAttribute('aria-current', 'page');
    breadcrumb.set([]);
  });

  it('falls back to the title as lens name and shows no link without a path', () => {
    breadcrumb.set([{ label: 'Payments', href: '/samm/payments' }]);
    const { unmount } = render(TopBar, {
      titleKey: 'lens.due',
      lensHref: '/due',
      onSearch: () => {},
    });
    expect(screen.getByRole('link', { name: 'Due' })).toHaveAttribute('href', '/due');
    unmount();
    breadcrumb.set([]);
    render(TopBar, { titleKey: 'lens.due', lensHref: '/due', onSearch: () => {} });
    expect(screen.getByTestId('view-title')).toHaveAttribute('aria-current', 'page');
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

describe('BottomBar with the documents lens', () => {
  it('holds Documents behind "More"', async () => {
    render(BottomBar, { activeLens: 'categories', documents: true });
    expect(screen.queryByTestId('bottom-nav-categories')).toBeNull();
    expect(screen.getByTestId('bottom-more')).toHaveClass('bottom-bar__item--active');
    await fireEvent.click(screen.getByTestId('bottom-more'));
    expect(screen.getByRole('link', { name: /Documents/ })).toHaveAttribute('href', '/categories');
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

  it('offers Documents while the lens exists', async () => {
    categoryList.set({
      categories: [{ id: 'test-note', generic: true, kinds: [{ id: 'note', repository: 'x' }] }],
    });
    const onnavigate = vi.fn();
    render(CommandPalette, { open: true, onnavigate });
    await fireEvent.input(screen.getByTestId('search-input'), { target: { value: 'docu' } });
    await fireEvent.keyDown(screen.getByTestId('search-input'), { key: 'Enter' });
    expect(onnavigate).toHaveBeenCalledWith('/categories');
    categoryList.set(null);
  });

  it('opens a clicked result', async () => {
    const onnavigate = vi.fn();
    render(CommandPalette, { open: true, onnavigate });
    await fireEvent.click(screen.getByTestId('search-result-settings'));
    expect(onnavigate).toHaveBeenCalledWith('/settings');
  });
});

describe('AppShell', () => {
  it('reads the categories and offers the documents lens in the rail only while one is generic', async () => {
    const list = vi.spyOn(apiClient, 'listCategories').mockResolvedValue({
      categories: [{ id: 'test-note', generic: true, kinds: [{ id: 'note', repository: 'x' }] }],
    });
    const signedIn = (rights: { repository: string; actions: Action[] }[], first = false) => ({
      user: { pseudonym: 'p', name: 'Alex Example' },
      rights,
      csrfToken: 't',
      firstLoginRequired: first,
    });
    session.set(signedIn([{ repository: 'x', actions: ['read'] }]));
    render(AppShell, {
      activeLens: 'categories',
      titleKey: 'lens.categories',
      onnavigate: () => {},
      content: textSnippet('content'),
    });
    expect(await screen.findByTestId('nav-categories')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(1);
    list.mockResolvedValue({ categories: [] });
    session.set(signedIn([{ repository: 'x', actions: ['read', 'edit'] }]));
    await vi.waitFor(() => expect(screen.queryByTestId('nav-categories')).toBeNull());
    expect(list).toHaveBeenCalledTimes(2);
    session.set(null);
    categoryList.set(null);
  });

  it('asks for no category where the server would refuse it: a session without a right, a first login', async () => {
    const list = vi.spyOn(apiClient, 'listCategories').mockResolvedValue({ categories: [] });
    categoryList.set({
      categories: [{ id: 'test-note', generic: true, kinds: [{ id: 'note', repository: 'x' }] }],
    });
    session.set({
      user: { pseudonym: 'p', name: 'Alex Example' },
      rights: [],
      csrfToken: 't',
      firstLoginRequired: false,
    });
    render(AppShell, {
      activeLens: 'due',
      titleKey: 'lens.due',
      onnavigate: () => {},
      content: textSnippet('content'),
    });
    await vi.waitFor(() => expect(screen.queryByTestId('nav-categories')).toBeNull());
    session.set({
      user: { pseudonym: 'p', name: 'Alex Example' },
      rights: [{ repository: 'x', actions: ['read'] }],
      csrfToken: 't',
      firstLoginRequired: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(list).not.toHaveBeenCalled();
    session.set(null);
  });

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

  it('shows no connection state, but keeps it as a data attribute for the end-to-end suite', () => {
    streamState.set('connected');
    const { container } = render(AppShell, {
      activeLens: 'due',
      titleKey: 'lens.due',
      onnavigate: () => {},
      content: textSnippet('content'),
    });
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-stream', 'connected');
    expect(screen.queryByText('Live')).toBeNull();
  });
});
