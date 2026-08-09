import { sanitizeThemeRemoteTweakFavorites, type Settings } from '$state/settings';
import { isLocalImportTweakUrl } from '../theme/localImportUrls';
import { sanitizeShortcutOverrides } from '../keyboard/shortcuts';
import { saveFileToDevice } from './download';
import { readFileToString } from './file';

/**
 * Keys excluded from cross-device sync.
 * These are platform-specific, security-sensitive, or purely local UI state.
 */
export const NON_SYNCABLE_KEYS = new Set<keyof Settings>([
  // Platform / permission-level — differ per device/browser
  'usePushNotifications',
  'backgroundPushEnabled',
  'backgroundPushProvider',
  'useInAppNotifications',
  'useSystemNotifications',
  // Personal device-level preferences
  'pageZoom',
  'enterForNewline',
  'isPeopleDrawer',
  'isWidgetDrawer',
  'memberSortFilterIndex',
  // Call audio is device-local (speaker setup + custom files in IndexedDB)
  'incomingCallSoundEnabled',
  'outgoingRingbackEnabled',
  'callRingtoneVolume',
  'callRingtoneId',
  'callRingbackTone',
  'callSoundOverrideGlobalNotifications',
  // Developer / diagnostic
  'developerTools',
  // Sync toggle itself must never be uploaded (it's device-local)
  'settingsSyncEnabled',
]);

export const SETTINGS_SYNC_VERSION = 1;
const MAX_SYNCED_LOCAL_TWEAK_CSS_BYTES = 256 * 1024;
const MAX_SYNCED_TWEAK_URL_LENGTH = 8192;

export type SettingsSyncContent = {
  v: number;
  settings: Partial<Settings>;
};

export type PreparedSettingsSync = {
  content: SettingsSyncContent;
  excludedLocalTweakUrls: string[];
};

function sanitizeThemeRemoteEnabledTweakFullUrls(val: unknown): string[] | undefined {
  if (!Array.isArray(val)) return undefined;
  return val.flatMap((url) => {
    if (typeof url !== 'string') return [];
    const trimmed = url.trim();
    return trimmed.length > 0 && trimmed.length <= MAX_SYNCED_TWEAK_URL_LENGTH ? [trimmed] : [];
  });
}

/** Prepare a bounded, atomic local-tweak payload and report any excluded URLs. */
export const prepareSettingsForSync = (settings: Settings): PreparedSettingsSync => {
  const syncable = { ...settings } as Partial<Settings>;
  const favorites = sanitizeThemeRemoteTweakFavorites(settings.themeRemoteTweakFavorites) ?? [];
  let usedCssBytes = 0;
  const excludedLocalTweakUrls: string[] = [];
  syncable.themeRemoteTweakFavorites = favorites.filter((favorite) => {
    if (!isLocalImportTweakUrl(favorite.fullUrl) || typeof favorite.cssText !== 'string')
      return true;
    const bytes = new TextEncoder().encode(favorite.cssText).byteLength;
    if (usedCssBytes + bytes > MAX_SYNCED_LOCAL_TWEAK_CSS_BYTES) {
      excludedLocalTweakUrls.push(favorite.fullUrl);
      return false;
    }
    usedCssBytes += bytes;
    return true;
  });
  const excluded = new Set(excludedLocalTweakUrls);
  syncable.themeRemoteEnabledTweakFullUrls = (
    sanitizeThemeRemoteEnabledTweakFullUrls(settings.themeRemoteEnabledTweakFullUrls) ?? []
  ).filter((url) => !excluded.has(url));
  NON_SYNCABLE_KEYS.forEach((key) => delete syncable[key]);
  return { content: { v: SETTINGS_SYNC_VERSION, settings: syncable }, excludedLocalTweakUrls };
};

/** Strip non-syncable keys and wrap in a versioned envelope. */
export const serializeForSync = (settings: Settings): SettingsSyncContent =>
  prepareSettingsForSync(settings).content;

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

  const remoteSettings = remote as Partial<Settings>;
  const merged = { ...currentSettings, ...remoteSettings };
  const remoteTweakFavorites = sanitizeThemeRemoteTweakFavorites(
    remoteSettings.themeRemoteTweakFavorites
  );
  if ('themeRemoteTweakFavorites' in remoteSettings) {
    const excluded = new Set(prepareSettingsForSync(currentSettings).excludedLocalTweakUrls);
    const remoteFavorites = remoteTweakFavorites ?? currentSettings.themeRemoteTweakFavorites;
    const remoteUrls = new Set(remoteFavorites.map((favorite) => favorite.fullUrl));
    const preservedExcluded = currentSettings.themeRemoteTweakFavorites.filter(
      (favorite) => excluded.has(favorite.fullUrl) && !remoteUrls.has(favorite.fullUrl)
    );
    merged.themeRemoteTweakFavorites = [...remoteFavorites, ...preservedExcluded];
    if ('themeRemoteEnabledTweakFullUrls' in remoteSettings) {
      const remoteEnabled =
        sanitizeThemeRemoteEnabledTweakFullUrls(remoteSettings.themeRemoteEnabledTweakFullUrls) ??
        currentSettings.themeRemoteEnabledTweakFullUrls;
      const remoteEnabledSet = new Set(remoteEnabled);
      merged.themeRemoteEnabledTweakFullUrls = [
        ...remoteEnabled,
        ...currentSettings.themeRemoteEnabledTweakFullUrls.filter(
          (url) => excluded.has(url) && !remoteEnabledSet.has(url)
        ),
      ];
    }
  }
  if (
    'themeRemoteEnabledTweakFullUrls' in remoteSettings &&
    !('themeRemoteTweakFavorites' in remoteSettings)
  ) {
    const remoteEnabled =
      sanitizeThemeRemoteEnabledTweakFullUrls(remoteSettings.themeRemoteEnabledTweakFullUrls) ??
      currentSettings.themeRemoteEnabledTweakFullUrls;
    const remoteEnabledSet = new Set(remoteEnabled);
    const excluded = new Set(prepareSettingsForSync(currentSettings).excludedLocalTweakUrls);
    merged.themeRemoteEnabledTweakFullUrls = [
      ...remoteEnabled,
      ...currentSettings.themeRemoteEnabledTweakFullUrls.filter(
        (url) => excluded.has(url) && !remoteEnabledSet.has(url)
      ),
    ];
  }
  merged.shortcutOverrides =
    sanitizeShortcutOverrides(remoteSettings.shortcutOverrides) ??
    currentSettings.shortcutOverrides;
  // Always restore non-syncable keys from local state.
  NON_SYNCABLE_KEYS.forEach((key) => {
    (merged as unknown as Record<string, unknown>)[key] = (
      currentSettings as unknown as Record<string, unknown>
    )[key];
  });

  return merged;
};

/** Save the current settings as a JSON file. */
export const exportSettingsAsJson = (settings: Settings): void => {
  void saveFileToDevice(
    new Blob([JSON.stringify({ v: SETTINGS_SYNC_VERSION, settings }, null, 2)], {
      type: 'application/json',
    }),
    `sable-settings-${Date.now()}.json`,
    'application/json'
  );
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

      readFileToString(file)
        .then((result) => {
          resolve(deserializeFromSync(JSON.parse(result), currentSettings));
        })
        .catch(() => resolve(null));
    });
    // oncancel is not widely supported; clicking away without selecting resolves naturally via onchange with empty files
    input.click();
  });
