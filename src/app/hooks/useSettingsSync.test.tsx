import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { createElement, type ReactNode } from 'react';
import { settingsAtom, getSettings } from '$state/settings';
import { AccountDataEvent } from '$types/matrix/accountData';
import { SETTINGS_SYNC_VERSION } from '$utils/settingsSync';
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
    getAccountData: vi.fn().mockReturnValue(null),
    setAccountData: vi.fn().mockResolvedValue(undefined),
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
  return function ({ children }: { children: ReactNode }) {
    return createElement(Provider, { store }, children);
  };
}

function makeSableSettingsEvent(content: unknown) {
  return {
    getType: () => AccountDataEvent.SableSettings,
    getContent: () => content,
  };
}

// ── Atom initial values ───────────────────────────────────────────────────────

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

// ── Hook: sync disabled ───────────────────────────────────────────────────────

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

// ── Hook: sync enabled — mount behaviour ─────────────────────────────────────

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
      settings: { isMarkdown: false },
    };
    mockMx.getAccountData.mockReturnValueOnce({
      getContent: () => remoteContent,
    });

    const store = makeStore({ settingsSyncEnabled: true, isMarkdown: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    expect(store.get(settingsAtom).isMarkdown).toBe(false);
  });

  it('sets lastSynced after loading from account data on mount', () => {
    const remoteContent = { v: SETTINGS_SYNC_VERSION, settings: { isMarkdown: false } };
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

// ── Hook: debounced upload ────────────────────────────────────────────────────

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
    expect(type).toBe(AccountDataEvent.SableSettings);
    expect(content.v).toBe(SETTINGS_SYNC_VERSION);
    expect(typeof content._echo).toBe('string');
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

// ── Hook: echo-token loop prevention ─────────────────────────────────────────

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
    const store = makeStore({ settingsSyncEnabled: true, isMarkdown: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    // Trigger the upload.
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Capture the echo token that was uploaded.
    const uploadedContent = mockMx.setAccountData.mock.calls[0][1] as Record<string, unknown>;
    const echoToken = uploadedContent._echo as string;

    // Simulate the homeserver echoing our own event back.
    const echoEvent = makeSableSettingsEvent({
      v: SETTINGS_SYNC_VERSION,
      _echo: echoToken,
      settings: { isMarkdown: false }, // different — must be ignored
    });

    act(() => {
      callbackHolder.current?.(echoEvent);
    });

    // isMarkdown should stay true (echo was ignored).
    expect(store.get(settingsAtom).isMarkdown).toBe(true);
  });

  it('marks sync status as idle and updates lastSynced when own echo arrives', async () => {
    const store = makeStore({ settingsSyncEnabled: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const uploadedContent = mockMx.setAccountData.mock.calls[0][1] as Record<string, unknown>;
    const echoToken = uploadedContent._echo as string;

    const before = Date.now();
    act(() => {
      callbackHolder.current?.(
        makeSableSettingsEvent({ v: SETTINGS_SYNC_VERSION, _echo: echoToken, settings: {} })
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
    const store = makeStore({ settingsSyncEnabled: true, isMarkdown: true });
    renderHook(() => useSettingsSyncEffect(), { wrapper: makeWrapper(store) });

    const remoteEvent = makeSableSettingsEvent({
      v: SETTINGS_SYNC_VERSION,
      settings: { isMarkdown: false },
      // No _echo — definitely from another device.
    });

    act(() => {
      callbackHolder.current?.(remoteEvent);
    });

    expect(store.get(settingsAtom).isMarkdown).toBe(false);
  });
});
