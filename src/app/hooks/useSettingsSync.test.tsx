import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { createElement, type ReactNode } from 'react';
import { settingsAtom, getSettings } from '$state/settings';

import { deserializeFromSync, SETTINGS_SYNC_VERSION } from '$utils/settingsSync';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

const { getCachedThemeCss, putCachedThemeCss } = vi.hoisted(() => ({
  getCachedThemeCss: vi
    .fn<(url: string) => Promise<string | undefined>>()
    .mockResolvedValue(undefined),
  putCachedThemeCss: vi
    .fn<(url: string, cssText: string) => Promise<void>>()
    .mockResolvedValue(undefined),
}));

vi.mock('../theme/cache', () => ({ getCachedThemeCss, putCachedThemeCss }));

import {
  settingsSyncLastSyncedAtom,
  settingsSyncStatusAtom,
  useSettingsSyncEffect,
} from './useSettingsSync';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Keep a reference to the latest account data callback registered by the hook
// so tests can simulate incoming Matrix events.
const { callbackHolder, mockMx } = vi.hoisted(() => {
  const holder: {
    current: ((event: { getType: () => string; getContent: () => unknown }) => void) | null;
  } = { current: null };
  const mx = {
    getAccountData: vi.fn<() => unknown>().mockReturnValue(null),
    setAccountData: vi
      .fn<(type: string, content: Record<string, unknown>) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
  return { callbackHolder: holder, mockMx: mx };
});

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => mockMx,
}));

vi.mock('$hooks/useAccountDataCallback', () => ({
  useAccountDataCallback: (
    _mx: unknown,
    cb: (event: { getType: () => string; getContent: () => unknown }) => void
  ) => {
    callbackHolder.current = cb;
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a fresh jotai store pre-loaded with the given settings.  */
function makeStore(overrides?: Partial<ReturnType<typeof getSettings>>) {
  const store = createStore();
  const base = getSettings();
  store.set(settingsAtom, { ...base, ...overrides });
  return store;
}

/** Wrapper that provides an isolated jotai store per test. */
function makeWrapper(store: ReturnType<typeof createStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(Provider, { store }, children);
  };
}

function makeSableSettingsEvent(content: unknown) {
  return {
    getType: () => CustomAccountDataEvent.SableSettings,
    getContent: () => content,
  };
}

// Atom initial values

describe('atom initial values', () => {
  it('settingsSyncLastSyncedAtom starts as null', () => {
    const store = createStore();
    expect(store.get(settingsSyncLastSyncedAtom)).toBeNull();
  });

  it('settingsSyncStatusAtom starts as idle', () => {
    const store = createStore();
    expect(store.get(settingsSyncStatusAtom)).toBe('idle');
  });
});

// Hook: sync disabled

describe('useSettingsSyncEffect — sync disabled', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not read account data when settingsSyncEnabled is false', () => {
    const store = makeStore({ settingsSyncEnabled: false });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });
    expect(mockMx.getAccountData).not.toHaveBeenCalled();
  });

  it('does not schedule an upload when settingsSyncEnabled is false', () => {
    const store = makeStore({ settingsSyncEnabled: false });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });
    vi.runAllTimers();
    expect(mockMx.setAccountData).not.toHaveBeenCalled();
  });
});

// Hook: sync enabled — mount behaviour

describe('useSettingsSyncEffect — sync enabled on mount', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads account data on mount and applies it to the atom', () => {
    const remoteContent = {
      v: SETTINGS_SYNC_VERSION,
      settings: { twitterEmoji: false },
    };
    mockMx.getAccountData.mockReturnValueOnce({
      getContent: () => remoteContent,
    });

    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    expect(store.get(settingsAtom).twitterEmoji).toBe(false);
  });

  it('best-effort hydrates embedded local tweak CSS without delaying settings application', async () => {
    const tweakUrl = 'sable-import://tweak/restored/full.sable.css';
    mockMx.getAccountData.mockReturnValueOnce({
      getContent: () => ({
        v: SETTINGS_SYNC_VERSION,
        settings: {
          themeRemoteTweakFavorites: [
            {
              fullUrl: tweakUrl,
              displayName: 'Restored',
              basename: 'restored',
              cssText: 'body {}',
            },
          ],
        },
      }),
    });
    const store = makeStore({ settingsSyncEnabled: true });

    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    expect(store.get(settingsAtom).themeRemoteTweakFavorites[0]?.cssText).toBe('body {}');
    await vi.waitFor(() => expect(putCachedThemeCss).toHaveBeenCalledWith(tweakUrl, 'body {}'));
  });

  it('keeps an oversized source-only local tweak on initial remote settings load', () => {
    const oversizedUrl = 'sable-import://tweak/oversized/full.sable.css';
    mockMx.getAccountData.mockReturnValueOnce({
      getContent: () => ({
        v: SETTINGS_SYNC_VERSION,
        settings: { themeRemoteTweakFavorites: [], themeRemoteEnabledTweakFullUrls: [] },
      }),
    });
    const store = makeStore({
      settingsSyncEnabled: true,
      themeRemoteTweakFavorites: [
        {
          fullUrl: oversizedUrl,
          displayName: 'Oversized',
          basename: 'oversized',
          cssText: 'x'.repeat(256 * 1024 + 1),
        },
      ],
      themeRemoteEnabledTweakFullUrls: [oversizedUrl],
    });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });
    expect(store.get(settingsAtom).themeRemoteEnabledTweakFullUrls).toContain(oversizedUrl);
  });

  it('sets lastSynced after loading from account data on mount', () => {
    const remoteContent = { v: SETTINGS_SYNC_VERSION, settings: { twitterEmoji: false } };
    mockMx.getAccountData.mockReturnValueOnce({ getContent: () => remoteContent });

    const store = makeStore({ settingsSyncEnabled: true });
    const before = Date.now();
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });
    const after = Date.now();

    const lastSynced = store.get(settingsSyncLastSyncedAtom);
    expect(lastSynced).not.toBeNull();
    expect(lastSynced!).toBeGreaterThanOrEqual(before);
    expect(lastSynced!).toBeLessThanOrEqual(after);
  });

  it('does nothing on mount when account data is absent', () => {
    mockMx.getAccountData.mockReturnValue(null);
    const store = makeStore({ settingsSyncEnabled: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });
    expect(store.get(settingsSyncLastSyncedAtom)).toBeNull();
  });
});

// Hook: debounced upload

describe('useSettingsSyncEffect — debounced upload', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uploads settings after the debounce delay', async () => {
    const store = makeStore({ settingsSyncEnabled: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockMx.setAccountData).toHaveBeenCalledOnce();
    const [type, content] = mockMx.setAccountData.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(type).toBe(CustomAccountDataEvent.SableSettings);
    expect(content.v).toBe(SETTINGS_SYNC_VERSION);
    expect(typeof content.synctoken).toBe('string');
  });

  it('backfills legacy local tweak CSS from cache into the upload payload', async () => {
    const tweakUrl = 'sable-import://tweak/legacy/full.sable.css';
    getCachedThemeCss.mockResolvedValueOnce('.legacy { color: purple; }');
    const store = makeStore({
      settingsSyncEnabled: true,
      themeRemoteTweakFavorites: [{ fullUrl: tweakUrl, displayName: 'Legacy', basename: 'legacy' }],
    });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    const uploadedContent = mockMx.setAccountData.mock.calls[0]?.[1];
    expect(uploadedContent?.settings).toMatchObject({
      themeRemoteTweakFavorites: [{ fullUrl: tweakUrl, cssText: '.legacy { color: purple; }' }],
    });
    expect(
      deserializeFromSync(uploadedContent, getSettings())?.themeRemoteTweakFavorites[0]?.cssText
    ).toBe('.legacy { color: purple; }');
  });

  it('cancels a stale deferred backfill when settings change', async () => {
    let resolveCache: ((css: string | undefined) => void) | undefined;
    getCachedThemeCss.mockImplementationOnce(
      () => new Promise<string | undefined>((resolve) => (resolveCache = resolve))
    );
    const store = makeStore({
      settingsSyncEnabled: true,
      themeRemoteTweakFavorites: [
        {
          fullUrl: 'sable-import://tweak/legacy/full.sable.css',
          displayName: 'Legacy',
          basename: 'legacy',
        },
      ],
    });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });
    act(() => vi.advanceTimersByTime(2000));
    act(() => store.set(settingsAtom, { ...store.get(settingsAtom), twitterEmoji: false }));
    resolveCache?.('body {}');
    await act(async () => await Promise.resolve());
    expect(mockMx.setAccountData).not.toHaveBeenCalled();
  });

  it('cancels a deferred backfill when settings sync is disabled', async () => {
    let resolveCache: ((css: string | undefined) => void) | undefined;
    getCachedThemeCss.mockImplementationOnce(
      () => new Promise<string | undefined>((resolve) => (resolveCache = resolve))
    );
    const store = makeStore({
      settingsSyncEnabled: true,
      themeRemoteTweakFavorites: [
        {
          fullUrl: 'sable-import://tweak/legacy/full.sable.css',
          displayName: 'Legacy',
          basename: 'legacy',
        },
      ],
    });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });
    act(() => vi.advanceTimersByTime(2000));
    act(() => store.set(settingsAtom, { ...store.get(settingsAtom), settingsSyncEnabled: false }));
    resolveCache?.('body {}');
    await act(async () => await Promise.resolve());
    expect(mockMx.setAccountData).not.toHaveBeenCalled();
  });

  it('sets sync status to syncing after cache backfill while the upload is in flight', async () => {
    const store = makeStore({ settingsSyncEnabled: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(store.get(settingsSyncStatusAtom)).toBe('syncing');
  });

  it('sets sync status to error when setAccountData rejects', async () => {
    mockMx.setAccountData.mockRejectedValueOnce(new Error('network'));
    const store = makeStore({ settingsSyncEnabled: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      // Flush the rejection microtask.
      await Promise.resolve();
    });

    expect(store.get(settingsSyncStatusAtom)).toBe('error');
  });

  it('keeps idle state after disabling sync during an in-flight request and ignores its late failure', async () => {
    let rejectUpload: ((error: Error) => void) | undefined;
    mockMx.setAccountData.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => (rejectUpload = reject))
    );
    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(store.get(settingsSyncStatusAtom)).toBe('syncing');
    act(() => store.set(settingsAtom, { ...store.get(settingsAtom), settingsSyncEnabled: false }));
    expect(store.get(settingsSyncStatusAtom)).toBe('idle');
    rejectUpload?.(new Error('late failure'));
    await act(async () => await Promise.resolve());
    expect(store.get(settingsSyncStatusAtom)).toBe('idle');
    expect(store.get(settingsAtom).twitterEmoji).toBe(true);
  });
});

// Hook: echo-token loop prevention

describe('useSettingsSyncEffect — echo-token loop prevention', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips re-applying an event that echoes our own upload token', async () => {
    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    // Trigger the upload.
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    // Capture the echo token that was uploaded.
    const uploadedContent: Record<string, unknown> | undefined =
      mockMx.setAccountData.mock.calls[0]?.[1];
    const echoToken = uploadedContent?.synctoken as string;

    // Simulate the homeserver echoing our own event back.
    const echoEvent = makeSableSettingsEvent({
      v: SETTINGS_SYNC_VERSION,
      synctoken: echoToken,
      settings: { twitterEmoji: false }, // different — must be ignored
    });

    act(() => {
      callbackHolder.current?.(echoEvent);
    });

    // twitterEmoji should stay true (echo was ignored).
    expect(store.get(settingsAtom).twitterEmoji).toBe(true);
  });

  it('marks sync status as idle and updates lastSynced when own echo arrives', async () => {
    const store = makeStore({ settingsSyncEnabled: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    const uploadedContent: Record<string, unknown> | undefined =
      mockMx.setAccountData.mock.calls[0]?.[1];
    const echoToken = uploadedContent?.synctoken as string;

    const before = Date.now();
    act(() => {
      callbackHolder.current?.(
        makeSableSettingsEvent({
          v: SETTINGS_SYNC_VERSION,
          synctoken: echoToken,
          settings: {},
        })
      );
    });
    const after = Date.now();

    expect(store.get(settingsSyncStatusAtom)).toBe('idle');
    const lastSynced = store.get(settingsSyncLastSyncedAtom);
    expect(lastSynced).not.toBeNull();
    expect(lastSynced!).toBeGreaterThanOrEqual(before);
    expect(lastSynced!).toBeLessThanOrEqual(after);
  });

  it('applies an event from another device and hydrates its embedded local tweak CSS', async () => {
    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });
    const tweakUrl = 'sable-import://tweak/live/full.sable.css';

    const remoteEvent = makeSableSettingsEvent({
      v: SETTINGS_SYNC_VERSION,
      settings: {
        twitterEmoji: false,
        themeRemoteTweakFavorites: [
          { fullUrl: tweakUrl, displayName: 'Live', basename: 'live', cssText: '.live {}' },
        ],
      },
      // No synctoken — definitely from another device.
    });

    act(() => {
      callbackHolder.current?.(remoteEvent);
    });

    expect(store.get(settingsAtom).twitterEmoji).toBe(false);
    await vi.waitFor(() => expect(putCachedThemeCss).toHaveBeenCalledWith(tweakUrl, '.live {}'));
  });

  it('keeps an oversized source-only local tweak on a live remote update', () => {
    const oversizedUrl = 'sable-import://tweak/oversized-live/full.sable.css';
    const store = makeStore({
      settingsSyncEnabled: true,
      themeRemoteTweakFavorites: [
        {
          fullUrl: oversizedUrl,
          displayName: 'Oversized',
          basename: 'oversized',
          cssText: 'x'.repeat(256 * 1024 + 1),
        },
      ],
      themeRemoteEnabledTweakFullUrls: [oversizedUrl],
    });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });
    act(() => {
      callbackHolder.current?.(
        makeSableSettingsEvent({
          v: SETTINGS_SYNC_VERSION,
          settings: { themeRemoteTweakFavorites: [], themeRemoteEnabledTweakFullUrls: [] },
        })
      );
    });
    expect(store.get(settingsAtom).themeRemoteEnabledTweakFullUrls).toContain(oversizedUrl);
  });
});
