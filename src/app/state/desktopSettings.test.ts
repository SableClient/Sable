import { createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopRuntimeState, SyncDesktopSettingsParams } from '$generated/tauri/types';
import {
  DEFAULT_DESKTOP_SETTINGS,
  desktopSettingsDefaultsForPlatform,
  desktopRuntimeStateAtom,
  desktopSettingsSyncingAtom,
  desktopSettingsFromStoreValues,
  desktopSettingsAtom,
  desktopSettingsReadyAtom,
  getDesktopSetting,
  getDesktopSettings,
  pushDesktopRuntimeStateAtom,
  saveDesktopSettings,
  setDesktopSetting,
} from './desktopSettings';

const { mockClose, mockEntries, mockGetDesktopRuntimeState, mockSet, mockSyncDesktopSettings } =
  vi.hoisted(() => ({
    mockClose: vi.fn<() => Promise<unknown>>(),
    mockEntries: vi.fn<() => Promise<Array<[string, unknown]>>>(),
    mockGetDesktopRuntimeState: vi
      .fn<() => Promise<DesktopRuntimeState>>()
      .mockResolvedValue({ trayAvailable: true, toggleWindowShortcut: null }),
    mockSet: vi.fn<(key: string, value: unknown) => Promise<unknown>>(),
    mockSyncDesktopSettings: vi
      .fn<(params: SyncDesktopSettingsParams) => Promise<DesktopRuntimeState>>()
      .mockResolvedValue({ trayAvailable: false, toggleWindowShortcut: null }),
  }));

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
      this.close = async () => mockClose();
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe('desktop settings state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntries.mockResolvedValue([]);
  });

  it('loads defaults when the store does not contain values', async () => {
    mockEntries.mockResolvedValue([]);

    await expect(getDesktopSettings()).resolves.toEqual(DEFAULT_DESKTOP_SETTINGS);
  });

  it('enables the custom title bar by default only on Windows', () => {
    expect(desktopSettingsDefaultsForPlatform('windows').useCustomTitleBar).toBe(true);
    expect(desktopSettingsDefaultsForPlatform('linux').useCustomTitleBar).toBe(false);
    expect(desktopSettingsDefaultsForPlatform('macos').useCustomTitleBar).toBe(false);
    expect(desktopSettingsDefaultsForPlatform(undefined).useCustomTitleBar).toBe(false);
  });

  it('loads a single desktop setting by key', async () => {
    mockEntries.mockResolvedValue([
      ['closeToBackgroundOnClose', false],
      ['showSystemTrayIcon', false],
    ]);

    await expect(getDesktopSetting('showSystemTrayIcon')).resolves.toBe(false);
  });

  it('loads an explicit persisted custom title bar value', async () => {
    mockEntries.mockResolvedValue([['useCustomTitleBar', false]]);

    await expect(getDesktopSetting('useCustomTitleBar')).resolves.toBe(false);
  });

  it('migrates the legacy background-running flag into close behavior', () => {
    expect(desktopSettingsFromStoreValues(false, false, true, undefined, undefined)).toEqual({
      closeToBackgroundOnClose: true,
      showSystemTrayIcon: false,
      useCustomTitleBar: true,
      spellcheck: true,
    });
  });

  it('preserves an explicit close-off setting when the legacy flag is off', () => {
    expect(desktopSettingsFromStoreValues(false, true, false, undefined, undefined)).toEqual({
      closeToBackgroundOnClose: false,
      showSystemTrayIcon: true,
      useCustomTitleBar: true,
      spellcheck: true,
    });
  });

  it('preserves an explicit custom title bar value over platform defaults', () => {
    expect(
      desktopSettingsFromStoreValues(undefined, undefined, undefined, false, undefined, 'windows')
    ).toMatchObject({ useCustomTitleBar: false });
    expect(
      desktopSettingsFromStoreValues(undefined, undefined, undefined, true, undefined, 'macos')
    ).toMatchObject({
      useCustomTitleBar: true,
    });
  });

  it('loads an explicit persisted spellcheck value', async () => {
    mockEntries.mockResolvedValue([['spellcheck', false]]);

    await expect(getDesktopSetting('spellcheck')).resolves.toBe(false);
  });

  it('writes through the desktop settings atom and syncs runtime state', async () => {
    const store = createStore();
    const unsubscribe = store.sub(desktopSettingsReadyAtom, () => {});

    await vi.waitFor(() => {
      expect(store.get(desktopSettingsReadyAtom)).toBe(true);
    });

    await store.set(desktopSettingsAtom, {
      closeToBackgroundOnClose: true,
      showSystemTrayIcon: true,
      useCustomTitleBar: true,
      spellcheck: true,
    });

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockSyncDesktopSettings).toHaveBeenCalledWith({
      settings: {
        closeToBackgroundOnClose: true,
        showSystemTrayIcon: true,
        useCustomTitleBar: true,
        spellcheck: true,
      },
    });
    expect(store.get(desktopRuntimeStateAtom)).toEqual({
      trayAvailable: false,
      toggleWindowShortcut: null,
    });

    unsubscribe();
  });

  it('marks desktop settings sync as pending while tray changes are in flight', async () => {
    const deferred = createDeferred<{ trayAvailable: boolean }>();
    mockEntries.mockResolvedValue([
      ['closeToBackgroundOnClose', true],
      ['showSystemTrayIcon', false],
    ]);
    mockSyncDesktopSettings.mockImplementationOnce(() => deferred.promise);

    const store = createStore();
    const unsubscribe = store.sub(desktopSettingsReadyAtom, () => {});

    await vi.waitFor(() => {
      expect(store.get(desktopSettingsReadyAtom)).toBe(true);
    });

    const writePromise = store.set(desktopSettingsAtom, {
      closeToBackgroundOnClose: true,
      showSystemTrayIcon: true,
      useCustomTitleBar: true,
      spellcheck: true,
    });

    await vi.waitFor(() => {
      expect(store.get(desktopSettingsSyncingAtom)).toBe(true);
    });

    deferred.resolve({ trayAvailable: true });
    await writePromise;

    expect(store.get(desktopSettingsSyncingAtom)).toBe(false);

    unsubscribe();
  });

  it('pushes a runtime state update through the write atom', () => {
    const store = createStore();

    store.set(pushDesktopRuntimeStateAtom, {
      trayAvailable: true,
      toggleWindowShortcut: 'mod+shift+s',
    });

    expect(store.get(desktopRuntimeStateAtom)).toEqual({
      trayAvailable: true,
      toggleWindowShortcut: 'mod+shift+s',
    });
  });

  it('persists and syncs when saving desktop settings directly', async () => {
    await expect(
      saveDesktopSettings({
        closeToBackgroundOnClose: false,
        showSystemTrayIcon: false,
        useCustomTitleBar: false,
        spellcheck: false,
      })
    ).resolves.toEqual({ trayAvailable: false, toggleWindowShortcut: null });

    expect(mockSet).toHaveBeenCalledTimes(5);
    expect(mockSet).toHaveBeenCalledWith('closeToBackgroundOnClose', false);
    expect(mockSet).toHaveBeenCalledWith('showSystemTrayIcon', false);
    expect(mockSet).toHaveBeenCalledWith('keepBackgroundRunning', false);
    expect(mockSet).toHaveBeenCalledWith('useCustomTitleBar', false);
    expect(mockSet).toHaveBeenCalledWith('spellcheck', false);
    expect(mockSyncDesktopSettings).toHaveBeenCalledWith({
      settings: {
        closeToBackgroundOnClose: false,
        showSystemTrayIcon: false,
        useCustomTitleBar: false,
        spellcheck: false,
      },
    });
  });

  it('persists a single close-behavior setting and mirrors the legacy flag', async () => {
    mockEntries.mockResolvedValue([
      ['closeToBackgroundOnClose', false],
      ['showSystemTrayIcon', false],
      ['keepBackgroundRunning', false],
    ]);

    await expect(setDesktopSetting('closeToBackgroundOnClose', true)).resolves.toEqual({
      trayAvailable: false,
      toggleWindowShortcut: null,
    });

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
  });

  it('turning off close behavior also clears the legacy flag', async () => {
    mockEntries.mockResolvedValue([
      ['closeToBackgroundOnClose', true],
      ['showSystemTrayIcon', true],
      ['keepBackgroundRunning', true],
    ]);

    await expect(setDesktopSetting('closeToBackgroundOnClose', false)).resolves.toEqual({
      trayAvailable: false,
      toggleWindowShortcut: null,
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
  });

  it('persists the tray visibility setting without touching close behavior', async () => {
    mockEntries.mockResolvedValue([
      ['closeToBackgroundOnClose', true],
      ['showSystemTrayIcon', true],
      ['keepBackgroundRunning', true],
    ]);

    await expect(setDesktopSetting('showSystemTrayIcon', false)).resolves.toEqual({
      trayAvailable: false,
      toggleWindowShortcut: null,
    });

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith('showSystemTrayIcon', false);
    expect(mockSyncDesktopSettings).toHaveBeenCalledWith({
      settings: {
        closeToBackgroundOnClose: true,
        showSystemTrayIcon: false,
        useCustomTitleBar: true,
        spellcheck: true,
      },
    });
  });
});
