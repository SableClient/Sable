import { useCallback, useEffect, useRef } from 'react';
import { atom, useAtom, useSetAtom } from 'jotai';
import type { MatrixEvent } from '$types/matrix-sdk';

import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAccountDataCallback } from '$hooks/useAccountDataCallback';
import {
  persistExplicitlyClearedSettingsKeys,
  settingsAtom,
  settingsInitializedAtom,
} from '$state/settings';
import {
  deserializeFromSync,
  getExplicitlyClearedSettingsKeysFromSync,
  serializeForSync,
} from '$utils/settingsSync';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

export type SyncStatus = 'idle' | 'syncing' | 'error';

/** Milliseconds to wait after a local settings change before uploading. */
const DEBOUNCE_MS = 2000;

/** Unix timestamp (ms) of the last confirmed sync, or null if never synced this session. */
export const settingsSyncLastSyncedAtom = atom<number | null>(null);

/** Current upload state for UI feedback. */
export const settingsSyncStatusAtom = atom<SyncStatus>('idle');

/**
 * Side-effect hook that:
 *  - loads settings from account data when sync is first enabled
 *  - listens for live updates arriving from other devices
 *  - debounce-uploads local changes back to account data
 *
 * Only active when `settings.settingsSyncEnabled === true`.
 * Call this once from a component that stays mounted for the session lifetime.
 */
export function useSettingsSyncEffect(): void {
  const mx = useMatrixClient();
  const [settings, setSettings] = useAtom(settingsAtom);
  const setLastSynced = useSetAtom(settingsSyncLastSyncedAtom);
  const setSyncStatus = useSetAtom(settingsSyncStatusAtom);
  const setInitialized = useSetAtom(settingsInitializedAtom);

  // Keep a ref so callbacks can always read the latest value without stale closures.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const syncEnabled = settings.settingsSyncEnabled;

  // On mount / when sync is first enabled: load from account data
  // Also marks settings as initialized after checking or timeout
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    if (!syncEnabled) {
      // If sync is disabled, settings are ready immediately
      setInitialized(true);
      return undefined;
    }

    const event = mx.getAccountData(CustomAccountDataEvent.SableSettings);
    if (!event) {
      // No account data exists — settings are ready immediately
      setInitialized(true);
      return undefined;
    }

    // Strip synctoken so a stored sync token from a previous session doesn't get treated
    // as an incoming change from another device.
    const { synctoken: echoField, ...content } = event.getContent();
    persistExplicitlyClearedSettingsKeys(getExplicitlyClearedSettingsKeysFromSync(content));
    const merged = deserializeFromSync(content, settingsRef.current);
    if (merged) {
      if (JSON.stringify(merged) !== JSON.stringify(settingsRef.current)) {
        setSettings(merged);
      }
      setLastSynced(Date.now());
    }

    // Mark as initialized after a short delay to allow account data to load
    // This prevents theme flashing on slow connections
    timeoutId = setTimeout(() => {
      setInitialized(true);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [mx, syncEnabled, setSettings, setLastSynced, setInitialized]);

  // Echo-detection: track the token of our last upload
  // When our upload echoes back via ClientEvent.AccountData we skip applying it
  // (to avoid overwriting settings that changed between upload and echo).
  const pendingEchoTokenRef = useRef<string | null>(null);

  // Live updates from other devices
  const onAccountData = useCallback(
    (event: MatrixEvent) => {
      if (event.getType() !== (CustomAccountDataEvent.SableSettings as string)) return;
      if (!settingsRef.current.settingsSyncEnabled) return;

      const rawContent = event.getContent();

      // If this is the echo of our own upload, just confirm success and skip.
      if (
        typeof rawContent.synctoken === 'string' &&
        rawContent.synctoken === pendingEchoTokenRef.current
      ) {
        pendingEchoTokenRef.current = null;
        setLastSynced(Date.now());
        setSyncStatus('idle');
        return;
      }

      // Strip internal synctoken field before deserializing so stale tokens from
      // previous sessions (stored on the homeserver) don't bypass the check above
      // and don't leak into the settings object.
      const { synctoken: echoField, ...content } = rawContent;
      persistExplicitlyClearedSettingsKeys(getExplicitlyClearedSettingsKeysFromSync(content));

      // Otherwise it came from another device — apply it.
      const merged = deserializeFromSync(content, settingsRef.current);
      // Skip if nothing actually changed (deserializeFromSync always returns a
      // new object, so compare values to avoid a spurious settings → upload loop).
      if (merged && JSON.stringify(merged) !== JSON.stringify(settingsRef.current)) {
        setSettings(merged);
        setLastSynced(Date.now());
      } else if (merged) {
        // Same values — just update the last-synced timestamp without re-uploading.
        setLastSynced(Date.now());
      }
    },
    [setSettings, setLastSynced, setSyncStatus]
  );
  useAccountDataCallback(mx, onAccountData);

  // Debounced upload whenever settings change
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!syncEnabled) return undefined;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSyncStatus('syncing');
      const token = Math.random().toString(36).slice(2, 10);
      pendingEchoTokenRef.current = token;
      const content = { ...serializeForSync(settingsRef.current), synctoken: token };
      mx.setAccountData(
        CustomAccountDataEvent.SableSettings,
        content as Record<string, unknown>
      ).catch(() => {
        pendingEchoTokenRef.current = null;
        setSyncStatus('error');
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timerRef.current);
  }, [mx, settings, syncEnabled, setSyncStatus]);
}
