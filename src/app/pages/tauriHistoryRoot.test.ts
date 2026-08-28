import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureTauriHistoryRoot } from './tauriHistoryRoot';

const mocks = vi.hoisted(() => ({ isTauri: true }));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => mocks.isTauri,
}));
vi.mock('@tauri-apps/plugin-os', () => ({
  type: () => 'ios',
}));

const DEEP_PATH = '/!space%3Aexample.org/lobby/';

/** Position the window, then spy so setup mutations are not counted. */
const loadAt = (path: string, state: unknown = null) => {
  window.history.replaceState(state, '', path);
  const replaceSpy = vi.spyOn(window.history, 'replaceState');
  const pushSpy = vi.spyOn(window.history, 'pushState');
  vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
  return { replaceSpy, pushSpy, href: window.location.href };
};

afterEach(() => {
  mocks.isTauri = true;
  vi.restoreAllMocks();
});

describe('ensureTauriHistoryRoot', () => {
  it('places home under a fresh deep-linked entry', () => {
    const { replaceSpy, pushSpy, href } = loadAt(DEEP_PATH);

    ensureTauriHistoryRoot();

    expect(replaceSpy).toHaveBeenCalledWith({}, '', '/home/');
    expect(pushSpy).toHaveBeenCalledWith({ idx: 1 }, '', href);
  });

  it('keeps the router state of the original entry', () => {
    const state = { idx: 0, usr: { from: 'test' } };
    const { replaceSpy, pushSpy, href } = loadAt(DEEP_PATH, state);

    ensureTauriHistoryRoot();

    expect(replaceSpy).toHaveBeenCalledWith(state, '', '/home/');
    expect(pushSpy).toHaveBeenCalledWith({ ...state, idx: 1 }, '', href);
  });

  it('builds a hash-router home href when the hash router is enabled', () => {
    const { replaceSpy } = loadAt(`/#${DEEP_PATH}`);

    ensureTauriHistoryRoot({ enabled: true, basename: '/' });

    expect(replaceSpy).toHaveBeenCalledWith({}, '', '#/home/');
  });

  it('does nothing when the load already has history', () => {
    const { replaceSpy, pushSpy } = loadAt(DEEP_PATH);
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(2);

    ensureTauriHistoryRoot();

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('does nothing when the router state says we are past the first entry', () => {
    const { replaceSpy, pushSpy } = loadAt(DEEP_PATH, { idx: 3 });

    ensureTauriHistoryRoot();

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('does nothing outside tauri', () => {
    mocks.isTauri = false;
    const { replaceSpy, pushSpy } = loadAt(DEEP_PATH);

    ensureTauriHistoryRoot();

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it.each(['/', '/home/', '/login', '/login?server=matrix.org', '/register', '/reset-password'])(
    'does nothing on root, home and auth paths (%s)',
    (path) => {
      const { replaceSpy, pushSpy } = loadAt(path);

      ensureTauriHistoryRoot();

      expect(replaceSpy).not.toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();
    }
  );
});
