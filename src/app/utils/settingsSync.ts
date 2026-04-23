import type { Settings } from '$state/settings';

/**
 * Keys excluded from cross-device sync.
 * These are platform-specific, security-sensitive, or purely local UI state.
 */
export const NON_SYNCABLE_KEYS = new Set<keyof Settings>([
  // Platform / permission-level — differ per device/browser
  'usePushNotifications',
  'useInAppNotifications',
  'useSystemNotifications',
  // Personal device-level preferences
  'pageZoom',
  'isPeopleDrawer',
  'isWidgetDrawer',
  'memberSortFilterIndex',
  // Developer / diagnostic
  'developerTools',
  // Sync toggle itself must never be uploaded (it's device-local)
  'settingsSyncEnabled',
]);

export const SETTINGS_SYNC_VERSION = 1;

export type SettingsSyncContent = {
  v: number;
  settings: Partial<Settings>;
};

/** Strip non-syncable keys and wrap in a versioned envelope. */
export const serializeForSync = (settings: Settings): SettingsSyncContent => {
  const syncable = { ...settings } as Partial<Settings>;
  NON_SYNCABLE_KEYS.forEach((key) => delete syncable[key]);
  return { v: SETTINGS_SYNC_VERSION, settings: syncable };
};

/**
 * Validate incoming account data and merge it into current settings.
 * Returns null when the data is invalid or from an incompatible schema version.
 * Non-syncable keys are always taken from `currentSettings`, never from remote.
 */
export const deserializeFromSync = (data: unknown, currentSettings: Settings): Settings | null => {
  if (!data || typeof data !== 'object') return null;
  const content = data as Record<string, unknown>;
  if (content.v !== SETTINGS_SYNC_VERSION) return null;
  const remote = content.settings;
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return null;

  const merged = { ...currentSettings, ...(remote as Partial<Settings>) };
  // Always restore non-syncable keys from local state.
  NON_SYNCABLE_KEYS.forEach((key) => {
    (merged as unknown as Record<string, unknown>)[key] = (
      currentSettings as unknown as Record<string, unknown>
    )[key];
  });

  return merged;
};

/** Trigger a browser download of the current settings as a JSON file. */
export const exportSettingsAsJson = (settings: Settings): void => {
  const payload = JSON.stringify({ v: SETTINGS_SYNC_VERSION, settings }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sable-settings-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Open a file picker, parse the selected JSON, and return the merged settings.
 * Resolves to null if the user cancels or the file is invalid.
 */
export const importSettingsFromJson = (currentSettings: Settings): Promise<Settings | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          resolve(deserializeFromSync(data, currentSettings));
        } catch {
          resolve(null);
        }
      });
      reader.addEventListener('error', () => resolve(null));
      reader.readAsText(file);
    });
    // oncancel is not widely supported; clicking away without selecting resolves naturally via onchange with empty files
    input.click();
  });
