import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { createElement, type ReactNode } from 'react';
import { settingsAtom, getSettings } from '$state/settings';

import { SETTINGS_SYNC_VERSION } from '$utils/settingsSync';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

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
    getUserId: vi.fn<() => string | undefined>().mockReturnValue('@alice:example.com'),
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

beforeEach(() => {
  localStorage.clear();
  mockMx.getUserId.mockReset().mockReturnValue('@alice:example.com');
  mockMx.getAccountData.mockReset().mockReturnValue(null);
  mockMx.setAccountData.mockReset().mockResolvedValue(undefined);
});

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

  it('uploads settings after the debounce delay', () => {
    const store = makeStore({ settingsSyncEnabled: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockMx.setAccountData).toHaveBeenCalledOnce();
    const [type, content] = mockMx.setAccountData.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(type).toBe(CustomAccountDataEvent.SableSettings);
    expect(content.v).toBe(SETTINGS_SYNC_VERSION);
    expect(typeof content.updatedAt).toBe('number');
    expect(typeof content.synctoken).toBe('string');
  });

  it('sets sync status to syncing while the upload is in flight', () => {
    const store = makeStore({ settingsSyncEnabled: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      vi.advanceTimersByTime(2000);
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
    act(() => {
      vi.advanceTimersByTime(2000);
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

    act(() => {
      vi.advanceTimersByTime(2000);
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

  it('applies an event from another device (different or absent echo token)', () => {
    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    const remoteEvent = makeSableSettingsEvent({
      v: SETTINGS_SYNC_VERSION,
      settings: { twitterEmoji: false },
      // No synctoken — definitely from another device.
    });

    act(() => {
      callbackHolder.current?.(remoteEvent);
    });

    expect(store.get(settingsAtom).twitterEmoji).toBe(false);
  });

  it('pulls newer remote settings instead of overwriting them with stale local state', () => {
    localStorage.setItem('settings-sync-updated-at:@alice:example.com', '100');
    mockMx.getAccountData.mockReturnValue({
      getContent: () => ({
        v: SETTINGS_SYNC_VERSION,
        updatedAt: 200,
        settings: { twitterEmoji: false },
      }),
    });

    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(store.get(settingsAtom).twitterEmoji).toBe(false);
    expect(mockMx.setAccountData).not.toHaveBeenCalled();
  });

  it('ignores stale remote events that arrive after a newer local change timestamp', () => {
    localStorage.setItem('settings-sync-updated-at:@alice:example.com', '300');
    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      callbackHolder.current?.(
        makeSableSettingsEvent({
          v: SETTINGS_SYNC_VERSION,
          updatedAt: 200,
          settings: { twitterEmoji: false },
        })
      );
    });

    expect(store.get(settingsAtom).twitterEmoji).toBe(true);
  });

  it('uploads newer local changes when legacy remote sync data lacks updatedAt', () => {
    localStorage.setItem('settings-sync-updated-at:@alice:example.com', '300');
    mockMx.getAccountData.mockReturnValue({
      getContent: () => ({
        v: SETTINGS_SYNC_VERSION,
        settings: { twitterEmoji: false },
      }),
    });

    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(store.get(settingsAtom).twitterEmoji).toBe(true);
    expect(mockMx.setAccountData).toHaveBeenCalledOnce();
    const uploadedContent = mockMx.setAccountData.mock.calls[0]?.[1];
    expect(uploadedContent?.settings).toMatchObject({
      twitterEmoji: true,
    });
    expect(typeof uploadedContent?.updatedAt).toBe('number');
  });

  it('does not treat enabling sync as a fresh syncable settings edit', () => {
    localStorage.setItem('settings-sync-updated-at:@alice:example.com', '100');
    mockMx.getAccountData.mockReturnValue({
      getContent: () => ({
        v: SETTINGS_SYNC_VERSION,
        updatedAt: 200,
        settings: { twitterEmoji: false },
      }),
    });

    const store = makeStore({ settingsSyncEnabled: false, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      store.set(settingsAtom, {
        ...store.get(settingsAtom),
        settingsSyncEnabled: true,
      });
    });

    expect(store.get(settingsAtom).twitterEmoji).toBe(false);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(mockMx.setAccountData).not.toHaveBeenCalled();
  });

  it('does not treat sync-disabled local edits as fresher than remote settings when sync is re-enabled', () => {
    localStorage.setItem('settings-sync-updated-at:@alice:example.com', '100');
    mockMx.getAccountData.mockReturnValue({
      getContent: () => ({
        v: SETTINGS_SYNC_VERSION,
        updatedAt: 200,
        settings: { twitterEmoji: false },
      }),
    });

    const store = makeStore({ settingsSyncEnabled: false, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      store.set(settingsAtom, {
        ...store.get(settingsAtom),
        twitterEmoji: false,
      });
    });

    act(() => {
      store.set(settingsAtom, {
        ...store.get(settingsAtom),
        settingsSyncEnabled: true,
      });
    });

    expect(store.get(settingsAtom).twitterEmoji).toBe(false);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(mockMx.setAccountData).not.toHaveBeenCalled();
  });

  it('keeps a newer local timestamp when an older upload echo arrives', () => {
    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true, urlPreview: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const firstUpload = mockMx.setAccountData.mock.calls[0]?.[1];
    const firstEchoToken = firstUpload?.synctoken as string;
    const firstUpdatedAt = firstUpload?.updatedAt as number;

    mockMx.getAccountData.mockReturnValue({
      getContent: () => ({
        v: SETTINGS_SYNC_VERSION,
        updatedAt: firstUpdatedAt,
        settings: { twitterEmoji: true, urlPreview: true },
      }),
    });

    act(() => {
      vi.advanceTimersByTime(1);
    });

    act(() => {
      store.set(settingsAtom, {
        ...store.get(settingsAtom),
        urlPreview: false,
      });
    });

    act(() => {
      callbackHolder.current?.(
        makeSableSettingsEvent({
          v: SETTINGS_SYNC_VERSION,
          updatedAt: firstUpdatedAt,
          synctoken: firstEchoToken,
          settings: { twitterEmoji: true, urlPreview: true },
        })
      );
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockMx.setAccountData).toHaveBeenCalledTimes(2);
    expect(mockMx.setAccountData.mock.calls[1]?.[1]?.settings).toMatchObject({
      urlPreview: false,
    });
  });

  it('reads freshness markers per account instead of reusing another account timestamp', () => {
    localStorage.setItem('settings-sync-updated-at:@alice:example.com', '300');
    mockMx.getUserId.mockReturnValue('@bob:example.com');
    mockMx.getAccountData.mockReturnValue({
      getContent: () => ({
        v: SETTINGS_SYNC_VERSION,
        updatedAt: 200,
        settings: { twitterEmoji: false },
      }),
    });

    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    expect(store.get(settingsAtom).twitterEmoji).toBe(false);
  });

  it('applies explicit remote theme clears from another device', () => {
    const store = makeStore({
      settingsSyncEnabled: true,
      themeId: 'dark-theme',
      themeRemoteManualFullUrl: 'https://themes.example/manual.css',
      themeRemoteManualKind: 'dark',
    });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    const remoteEvent = makeSableSettingsEvent({
      v: SETTINGS_SYNC_VERSION,
      settings: {
        themeId: null,
        themeRemoteManualFullUrl: null,
        themeRemoteManualKind: null,
      },
    });

    act(() => {
      callbackHolder.current?.(remoteEvent);
    });

    expect(store.get(settingsAtom).themeId).toBeUndefined();
    expect(store.get(settingsAtom).themeRemoteManualFullUrl).toBeUndefined();
    expect(store.get(settingsAtom).themeRemoteManualKind).toBeUndefined();
  });

  it('applies live legacy remote settings updates even after local freshness exists', () => {
    localStorage.setItem('settings-sync-updated-at:@alice:example.com', '300');
    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      callbackHolder.current?.(
        makeSableSettingsEvent({
          v: SETTINGS_SYNC_VERSION,
          settings: { twitterEmoji: false },
        })
      );
    });

    expect(store.get(settingsAtom).twitterEmoji).toBe(false);
  });

  it('ignores an older remote event while a newer remote apply is still in flight', () => {
    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true, urlPreview: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      callbackHolder.current?.(
        makeSableSettingsEvent({
          v: SETTINGS_SYNC_VERSION,
          updatedAt: 300,
          settings: { twitterEmoji: false, urlPreview: false },
        })
      );

      callbackHolder.current?.(
        makeSableSettingsEvent({
          v: SETTINGS_SYNC_VERSION,
          updatedAt: 250,
          settings: { twitterEmoji: true, urlPreview: false },
        })
      );
    });

    expect(store.get(settingsAtom)).toMatchObject({
      twitterEmoji: false,
      urlPreview: false,
    });
  });

  it('uploads a valid payload when fresher cached account data is malformed', () => {
    localStorage.setItem('settings-sync-updated-at:@alice:example.com', '100');
    mockMx.getAccountData.mockReturnValue({
      getContent: () => ({
        v: SETTINGS_SYNC_VERSION,
        updatedAt: 200,
        settings: null,
      }),
    });

    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockMx.setAccountData).toHaveBeenCalledOnce();
    expect(mockMx.setAccountData.mock.calls[0]?.[1]?.updatedAt).toBe(200);
    expect(mockMx.setAccountData.mock.calls[0]?.[1]?.settings).toMatchObject({
      twitterEmoji: true,
    });
  });

  it('uploads local settings when legacy cached account data cannot be applied', () => {
    mockMx.getAccountData.mockReturnValue({
      getContent: () => ({
        v: SETTINGS_SYNC_VERSION,
        settings: null,
      }),
    });

    const store = makeStore({ settingsSyncEnabled: true, twitterEmoji: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockMx.setAccountData).toHaveBeenCalledOnce();
    expect(mockMx.setAccountData.mock.calls[0]?.[1]?.settings).toMatchObject({
      twitterEmoji: true,
    });
  });

  it('preserves remote clear markers for later uploads even when visible settings do not change', () => {
    const store = makeStore({
      settingsSyncEnabled: true,
      themeId: undefined,
      themeRemoteManualFullUrl: undefined,
      themeRemoteManualKind: undefined,
    });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    const remoteEvent = makeSableSettingsEvent({
      v: SETTINGS_SYNC_VERSION,
      settings: {
        themeId: null,
        themeRemoteManualFullUrl: null,
        themeRemoteManualKind: null,
      },
    });

    act(() => {
      callbackHolder.current?.(remoteEvent);
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const uploadedContent = mockMx.setAccountData.mock.calls.at(-1)?.[1];

    expect(uploadedContent?.settings).toMatchObject({
      themeId: null,
      themeRemoteManualFullUrl: null,
      themeRemoteManualKind: null,
    });
  });
});
