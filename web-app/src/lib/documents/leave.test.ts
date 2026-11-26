import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  callback: null as null | ((navigation: unknown) => void),
  goto: vi.fn(),
}));

vi.mock('$app/navigation', () => ({
  beforeNavigate: (callback: (navigation: unknown) => void) => {
    navigation.callback = callback;
  },
  goto: navigation.goto,
}));

import { guardLeaving } from './leave';

/** A navigation as SvelteKit hands it to `beforeNavigate`. */
function move(to: string | null, willUnload = false) {
  return {
    cancel: vi.fn(),
    willUnload,
    to: to === null ? null : { url: new URL(to, 'http://localhost') },
  };
}

beforeEach(() => {
  navigation.callback = null;
  navigation.goto.mockClear();
});

describe('guardLeaving', () => {
  it('lets a page without content go', () => {
    const ask = vi.fn();
    guardLeaving(() => false, ask);
    const leaving = move('/categories');
    navigation.callback!(leaving);
    expect(leaving.cancel).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
  });

  it('cancels a move inside the app and asks; leaving anyway makes the move once, without asking again', () => {
    const ask = vi.fn();
    guardLeaving(() => true, ask);
    const leaving = move('/categories/test-note?x=1#top');
    navigation.callback!(leaving);
    expect(leaving.cancel).toHaveBeenCalled();
    expect(ask).toHaveBeenCalledTimes(1);
    ask.mock.calls[0][0]();
    expect(navigation.goto).toHaveBeenCalledWith('/categories/test-note?x=1#top');
    const again = move('/elsewhere');
    navigation.callback!(again);
    expect(again.cancel).not.toHaveBeenCalled();
  });

  it('cancels a reload, a close or a link out of the app and leaves the question to the browser', () => {
    const ask = vi.fn();
    guardLeaving(() => true, ask);
    const reload = move(null, true);
    navigation.callback!(reload);
    expect(reload.cancel).toHaveBeenCalled();
    const away = move('https://example.org/', true);
    navigation.callback!(away);
    expect(away.cancel).toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
  });
});
