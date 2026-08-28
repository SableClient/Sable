import { act, renderHook, waitFor } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopRuntimeState, SyncDesktopSettingsParams } from '$generated/tauri/types';
import { desktopSettingsReadyAtom } from '../desktopSettings';
import { useDesktopSetting } from './desktopSettings';

const { mockEntries, mockGetDesktopRuntimeState, mockSet, mockSyncDesktopSettings } = vi.hoisted(
  () => ({
    mockEntries: vi.fn<() => Promise<Array<[string, unknown]>>>(),
    mockGetDesktopRuntimeState: vi
      .fn<() => Promise<DesktopRuntimeState>>()
      .mockResolvedValue({ trayAvailable: true }),
    mockSet: vi.fn<(key: string, value: unknown) => Promise<unknown>>(),
    mockSyncDesktopSettings: vi
      .fn<(params: SyncDesktopSettingsParams) => Promise<DesktopRuntimeState>>()
      .mockResolvedValue({ trayAvailable: true }),
  })
);

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get: (key: string) => Promise<unknown>;

    set: (key: string, value: unknown) => Promise<unknown>;

    close: () => Promise<unknown>;

    constructor() {
      this.get = async (key: string) => {
        const entries = (await mockEntries()) as Array<[string, unknown]>;
        return entries.find(([entryKey]) => entryKey === key)?.[1];
      };
      this.set = async (key: string, value: unknown) => mockSet(key, value);
      this.close = async () => undefined;
    }
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  type: () => 'windows',
}));

vi.mock('$generated/tauri/commands', () => ({
  getDesktopRuntimeState: mockGetDesktopRuntimeState,
  syncDesktopSettings: mockSyncDesktopSettings,
}));

function makeWrapper(store: ReturnType<typeof createStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(Provider, { store }, children);
  };
}

describe('useDesktopSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntries.mockResolvedValue([]);
  });

  it('reads and updates a desktop setting via the desktop settings hook', async () => {
    mockEntries.mockResolvedValue([
      ['closeToBackgroundOnClose', false],
      ['showSystemTrayIcon', false],
      ['keepBackgroundRunning', false],
    ]);

    const store = createStore();
    const readyUnsubscribe = store.sub(desktopSettingsReadyAtom, () => {});
    const { result } = renderHook(() => useDesktopSetting('closeToBackgroundOnClose'), {
      wrapper: makeWrapper(store),
    });

    await waitFor(() => {
      expect(store.get(desktopSettingsReadyAtom)).toBe(true);
      expect(result.current[0]).toBe(false);
    });

    await act(async () => {
      await result.current[1](true);
    });

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenCalledWith('closeToBackgroundOnClose', true);
    expect(mockSet).toHaveBeenCalledWith('keepBackgroundRunning', true);
    expect(mockSyncDesktopSettings).toHaveBeenCalledWith({
      settings: {
        closeToBackgroundOnClose: true,
        showSystemTrayIcon: false,
        useCustomTitleBar: true,
        spellcheck: true,
      },
    });

    readyUnsubscribe();
  });

  it('turning off close behavior through the hook also clears the legacy flag', async () => {
    mockEntries.mockResolvedValue([
      ['closeToBackgroundOnClose', true],
      ['showSystemTrayIcon', true],
      ['keepBackgroundRunning', true],
    ]);

    const store = createStore();
    const readyUnsubscribe = store.sub(desktopSettingsReadyAtom, () => {});
    const { result } = renderHook(() => useDesktopSetting('closeToBackgroundOnClose'), {
      wrapper: makeWrapper(store),
    });

    await waitFor(() => {
      expect(store.get(desktopSettingsReadyAtom)).toBe(true);
    });

    await act(async () => {
      await result.current[1](false);
    });

    expect(mockSet).toHaveBeenCalledWith('closeToBackgroundOnClose', false);
    expect(mockSet).toHaveBeenCalledWith('keepBackgroundRunning', false);
    expect(mockSyncDesktopSettings).toHaveBeenCalledWith({
      settings: {
        closeToBackgroundOnClose: false,
        showSystemTrayIcon: true,
        useCustomTitleBar: true,
        spellcheck: true,
      },
    });

    readyUnsubscribe();
  });
});
