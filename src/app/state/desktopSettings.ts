import { atom } from 'jotai';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { LazyStore } from '@tauri-apps/plugin-store';
import { getDesktopRuntimeState, syncDesktopSettings } from '$generated/tauri/commands';
import type { DesktopSettings as GeneratedDesktopSettings } from '$generated/tauri/desktop/DesktopSettings';
import type { DesktopRuntimeState } from '$generated/tauri/desktop/DesktopRuntimeState';

type DesktopSettingsState = {
  ready: boolean;
  value: DesktopSettings;
};

type DesktopRuntimeStateValue = {
  ready: boolean;
  value: DesktopRuntimeState;
};

export type DesktopSettings = GeneratedDesktopSettings;
export type { DesktopRuntimeState };

const DESKTOP_SETTINGS_STORE_PATH = 'desktop-preferences.json' as const;
const LEGACY_KEEP_BACKGROUND_RUNNING_KEY = 'keepBackgroundRunning' as const;

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  closeToBackgroundOnClose: true,
  showSystemTrayIcon: true,
};
export type DesktopSettingKey = keyof DesktopSettings;

export const DEFAULT_DESKTOP_RUNTIME_STATE: DesktopRuntimeState = {
  trayAvailable: true,
};

const DESKTOP_SETTING_KEYS = Object.keys(DEFAULT_DESKTOP_SETTINGS) as DesktopSettingKey[];

const desktopSettingsStore = new LazyStore(DESKTOP_SETTINGS_STORE_PATH, {
  defaults: DEFAULT_DESKTOP_SETTINGS,
});

let currentDesktopSettings = DEFAULT_DESKTOP_SETTINGS;
let currentDesktopRuntimeState = DEFAULT_DESKTOP_RUNTIME_STATE;

function isDesktopTauri(): boolean {
  if (!isTauri()) return false;

  const os = osType();
  return os === 'windows' || os === 'linux' || os === 'macos';
}

function readBoolean(value: boolean | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : value;
}

async function persistDesktopSettings(
  current: DesktopSettings,
  next: DesktopSettings
): Promise<void> {
  const updates = DESKTOP_SETTING_KEYS.filter((key) => current[key] !== next[key]).map((key) =>
    desktopSettingsStore.set(key, next[key])
  );

  if (current.closeToBackgroundOnClose !== next.closeToBackgroundOnClose) {
    updates.push(
      desktopSettingsStore.set(LEGACY_KEEP_BACKGROUND_RUNNING_KEY, next.closeToBackgroundOnClose)
    );
  }

  await Promise.all(updates);
}

export function desktopSettingsFromStoreValues(
  closeToBackgroundOnClose: boolean | undefined,
  showSystemTrayIcon: boolean | undefined,
  legacyKeepBackgroundRunning: boolean | undefined
): DesktopSettings {
  return {
    closeToBackgroundOnClose:
      readBoolean(closeToBackgroundOnClose, DEFAULT_DESKTOP_SETTINGS.closeToBackgroundOnClose) ||
      readBoolean(legacyKeepBackgroundRunning, false),
    showSystemTrayIcon: readBoolean(
      showSystemTrayIcon,
      DEFAULT_DESKTOP_SETTINGS.showSystemTrayIcon
    ),
  };
}

async function applyDesktopSettings(
  current: DesktopSettings,
  settings: DesktopSettings
): Promise<DesktopRuntimeState> {
  currentDesktopSettings = settings;

  if (!isDesktopTauri()) {
    currentDesktopRuntimeState = DEFAULT_DESKTOP_RUNTIME_STATE;
    return currentDesktopRuntimeState;
  }

  await persistDesktopSettings(current, settings);

  currentDesktopRuntimeState = await syncDesktopSettings({ settings });
  return currentDesktopRuntimeState;
}

export async function getDesktopSettings(): Promise<DesktopSettings> {
  if (!isDesktopTauri()) return DEFAULT_DESKTOP_SETTINGS;

  const [closeToBackgroundOnClose, showSystemTrayIcon, legacyKeepBackgroundRunning] =
    await Promise.all([
      desktopSettingsStore.get<boolean>('closeToBackgroundOnClose'),
      desktopSettingsStore.get<boolean>('showSystemTrayIcon'),
      desktopSettingsStore.get<boolean>(LEGACY_KEEP_BACKGROUND_RUNNING_KEY),
    ]);

  currentDesktopSettings = desktopSettingsFromStoreValues(
    closeToBackgroundOnClose,
    showSystemTrayIcon,
    legacyKeepBackgroundRunning
  );

  return currentDesktopSettings;
}

export async function getDesktopSetting<K extends DesktopSettingKey>(
  key: K
): Promise<DesktopSettings[K]> {
  const settings = await getDesktopSettings();
  return settings[key];
}

export async function saveDesktopSettings(settings: DesktopSettings): Promise<DesktopRuntimeState> {
  const current = isDesktopTauri() ? await getDesktopSettings() : currentDesktopSettings;
  return applyDesktopSettings(current, settings);
}

export async function setDesktopSetting<K extends DesktopSettingKey>(
  key: K,
  value: DesktopSettings[K]
): Promise<DesktopRuntimeState> {
  const current = isDesktopTauri() ? await getDesktopSettings() : currentDesktopSettings;
  const next = { ...current, [key]: value } as DesktopSettings;

  return applyDesktopSettings(current, next);
}

const baseDesktopSettingsAtom = atom<DesktopSettingsState>({
  ready: false,
  value: DEFAULT_DESKTOP_SETTINGS,
});

baseDesktopSettingsAtom.onMount = (setAtom) => {
  if (!isDesktopTauri()) {
    setAtom({
      ready: true,
      value: DEFAULT_DESKTOP_SETTINGS,
    });
    return undefined;
  }

  let cancelled = false;

  getDesktopSettings().then((settings) => {
    if (cancelled) return;

    setAtom({
      ready: true,
      value: settings,
    });
  });

  return () => {
    cancelled = true;
  };
};

const baseDesktopRuntimeStateAtom = atom<DesktopRuntimeStateValue>({
  ready: false,
  value: DEFAULT_DESKTOP_RUNTIME_STATE,
});

const baseDesktopSettingsSyncCountAtom = atom(0);

baseDesktopRuntimeStateAtom.onMount = (setAtom) => {
  if (!isDesktopTauri()) {
    setAtom({
      ready: true,
      value: DEFAULT_DESKTOP_RUNTIME_STATE,
    });
    return undefined;
  }

  let cancelled = false;

  getDesktopRuntimeState().then((runtimeState) => {
    currentDesktopRuntimeState = runtimeState;

    if (cancelled) return;

    setAtom({
      ready: true,
      value: runtimeState,
    });
  });

  return () => {
    cancelled = true;
  };
};

export const desktopSettingsAtom = atom(
  (get) => get(baseDesktopSettingsAtom).value,
  async (_get, set, settings: DesktopSettings) => {
    set(baseDesktopSettingsAtom, {
      ready: true,
      value: settings,
    });
    set(baseDesktopSettingsSyncCountAtom, (count) => count + 1);

    try {
      const runtimeState = await saveDesktopSettings(settings);
      set(baseDesktopRuntimeStateAtom, {
        ready: true,
        value: runtimeState,
      });
    } finally {
      set(baseDesktopSettingsSyncCountAtom, (count) => Math.max(0, count - 1));
    }
  }
);

export const desktopRuntimeStateAtom = atom((get) => get(baseDesktopRuntimeStateAtom).value);
export const desktopSettingsSyncingAtom = atom((get) => get(baseDesktopSettingsSyncCountAtom) > 0);

export const desktopSettingsReadyAtom = atom(
  (get) => get(baseDesktopSettingsAtom).ready && get(baseDesktopRuntimeStateAtom).ready
);
