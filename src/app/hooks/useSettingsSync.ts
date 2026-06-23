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
  getSettingsSyncUpdatedAt,
  getExplicitlyClearedSettingsKeysFromSync,
  serializeForSync,
} from '$utils/settingsSync';
import { CustomAccountDataEvent } from '$types/matrix/accountData';

export type SyncStatus = 'idle' | 'syncing' | 'error';

/** Milliseconds to wait after a local settings change before uploading. */
const DEBOUNCE_MS = 2000;
const LOCAL_SETTINGS_SYNC_UPDATED_AT_KEY = 'settings-sync-updated-at';

/** Unix timestamp (ms) of the last confirmed sync, or null if never synced this session. */
export const settingsSyncLastSyncedAtom = atom<number | null>(null);

/** Current upload state for UI feedback. */
export const settingsSyncStatusAtom = atom<SyncStatus>('idle');

const getLocalSettingsSyncUpdatedAtStorageKey = (userId: string | undefined): string =>
  userId ? `${LOCAL_SETTINGS_SYNC_UPDATED_AT_KEY}:${userId}` : LOCAL_SETTINGS_SYNC_UPDATED_AT_KEY;

const readLocalSettingsSyncUpdatedAt = (storageKey: string): number => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
};

const persistLocalSettingsSyncUpdatedAt = (storageKey: string, updatedAt: number): void => {
  try {
    localStorage.setItem(storageKey, String(updatedAt));
  } catch {
    // Best-effort metadata write; settings themselves remain the source of truth.
  }
};

const getNextLocalSettingsSyncUpdatedAt = (previousUpdatedAt: number): number =>
  Math.max(Date.now(), previousUpdatedAt + 1);

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
  const userId = typeof mx.getUserId === 'function' ? (mx.getUserId() ?? undefined) : undefined;
  const localUpdatedAtStorageKey = getLocalSettingsSyncUpdatedAtStorageKey(userId);

  const syncEnabled = settings.settingsSyncEnabled;
  const localUpdatedAtRef = useRef<number>(
    readLocalSettingsSyncUpdatedAt(localUpdatedAtStorageKey)
  );
  const applyingRemoteTimestampRef = useRef<number | null>(null);
  const previousSyncableSettingsJsonRef = useRef(JSON.stringify(serializeForSync(settings)));

  const getFreshnessFloor = useCallback(
    (): number => Math.max(localUpdatedAtRef.current, applyingRemoteTimestampRef.current ?? 0),
    []
  );

  useEffect(() => {
    localUpdatedAtRef.current = readLocalSettingsSyncUpdatedAt(localUpdatedAtStorageKey);
    applyingRemoteTimestampRef.current = null;
    previousSyncableSettingsJsonRef.current = JSON.stringify(serializeForSync(settingsRef.current));
  }, [localUpdatedAtStorageKey]);

  const applyRemoteContent = useCallback(
    (rawContent: Record<string, unknown>): boolean => {
      const { synctoken: _echoField, ...content } = rawContent;
      const remoteUpdatedAt = getSettingsSyncUpdatedAt(content);
      persistExplicitlyClearedSettingsKeys(getExplicitlyClearedSettingsKeysFromSync(content));
      const merged = deserializeFromSync(content, settingsRef.current);
      if (!merged) return false;

      if (JSON.stringify(merged) !== JSON.stringify(settingsRef.current)) {
        applyingRemoteTimestampRef.current = remoteUpdatedAt ?? Date.now();
        setSettings(merged);
      } else if (remoteUpdatedAt !== null) {
        localUpdatedAtRef.current = remoteUpdatedAt;
        persistLocalSettingsSyncUpdatedAt(localUpdatedAtStorageKey, remoteUpdatedAt);
      }

      setLastSynced(Date.now());
      return true;
    },
    [localUpdatedAtStorageKey, setLastSynced, setSettings]
  );

  useEffect(() => {
    const currentSyncableSettingsJson = JSON.stringify(serializeForSync(settings));
    if (currentSyncableSettingsJson === previousSyncableSettingsJsonRef.current) return;

    if (!syncEnabled) {
      previousSyncableSettingsJsonRef.current = currentSyncableSettingsJson;
      return;
    }

    previousSyncableSettingsJsonRef.current = currentSyncableSettingsJson;

    const appliedRemoteTimestamp = applyingRemoteTimestampRef.current;
    if (appliedRemoteTimestamp !== null) {
      localUpdatedAtRef.current = appliedRemoteTimestamp;
      persistLocalSettingsSyncUpdatedAt(localUpdatedAtStorageKey, appliedRemoteTimestamp);
      applyingRemoteTimestampRef.current = null;
      return;
    }

    const updatedAt = getNextLocalSettingsSyncUpdatedAt(localUpdatedAtRef.current);
    localUpdatedAtRef.current = updatedAt;
    persistLocalSettingsSyncUpdatedAt(localUpdatedAtStorageKey, updatedAt);
  }, [localUpdatedAtStorageKey, settings, syncEnabled]);

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

    const rawContent = event.getContent() as Record<string, unknown>;
    const remoteUpdatedAt = getSettingsSyncUpdatedAt(rawContent);
    if (
      (remoteUpdatedAt === null && localUpdatedAtRef.current === 0) ||
      (remoteUpdatedAt !== null && remoteUpdatedAt >= localUpdatedAtRef.current)
    ) {
      applyRemoteContent(rawContent);
    }

    // Mark as initialized after a short delay to allow account data to load
    // This prevents theme flashing on slow connections
    timeoutId = setTimeout(() => {
      setInitialized(true);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [applyRemoteContent, mx, syncEnabled, setInitialized]);

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
        const echoedUpdatedAt = getSettingsSyncUpdatedAt(rawContent);
        if (echoedUpdatedAt !== null && echoedUpdatedAt > localUpdatedAtRef.current) {
          localUpdatedAtRef.current = echoedUpdatedAt;
          persistLocalSettingsSyncUpdatedAt(localUpdatedAtStorageKey, echoedUpdatedAt);
        }
        setLastSynced(Date.now());
        setSyncStatus('idle');
        return;
      }

      const remoteUpdatedAt = getSettingsSyncUpdatedAt(rawContent);
      const freshnessFloor = getFreshnessFloor();
      if (remoteUpdatedAt !== null && freshnessFloor > 0 && remoteUpdatedAt < freshnessFloor) {
        return;
      }

      applyRemoteContent(rawContent as Record<string, unknown>);
    },
    [applyRemoteContent, getFreshnessFloor, localUpdatedAtStorageKey, setLastSynced, setSyncStatus]
  );
  useAccountDataCallback(mx, onAccountData);

  // Debounced upload whenever settings change
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!syncEnabled) return undefined;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const remoteEvent = mx.getAccountData(CustomAccountDataEvent.SableSettings);
      const remoteContent = remoteEvent?.getContent() as Record<string, unknown> | undefined;
      const remoteUpdatedAt = getSettingsSyncUpdatedAt(remoteContent);
      const hasLocalUpdatedAt = localUpdatedAtRef.current > 0;
      if (
        remoteContent &&
        remoteUpdatedAt === null &&
        !hasLocalUpdatedAt &&
        applyRemoteContent(remoteContent)
      ) {
        setSyncStatus('idle');
        return;
      }

      let localUpdatedAt = hasLocalUpdatedAt
        ? localUpdatedAtRef.current
        : getNextLocalSettingsSyncUpdatedAt(localUpdatedAtRef.current);
      if (!hasLocalUpdatedAt) {
        localUpdatedAtRef.current = localUpdatedAt;
        persistLocalSettingsSyncUpdatedAt(localUpdatedAtStorageKey, localUpdatedAt);
      }

      if (
        remoteContent &&
        remoteUpdatedAt !== null &&
        remoteUpdatedAt >= localUpdatedAt &&
        applyRemoteContent(remoteContent)
      ) {
        setSyncStatus('idle');
        return;
      }

      if (remoteUpdatedAt !== null && remoteUpdatedAt > localUpdatedAt) {
        localUpdatedAt = remoteUpdatedAt;
        localUpdatedAtRef.current = remoteUpdatedAt;
        persistLocalSettingsSyncUpdatedAt(localUpdatedAtStorageKey, remoteUpdatedAt);
      }

      setSyncStatus('syncing');
      const token = Math.random().toString(36).slice(2, 10);
      pendingEchoTokenRef.current = token;
      const content = {
        ...serializeForSync(settingsRef.current, localUpdatedAt),
        synctoken: token,
      };
      mx.setAccountData(
        CustomAccountDataEvent.SableSettings,
        content as Record<string, unknown>
      ).catch(() => {
        pendingEchoTokenRef.current = null;
        setSyncStatus('error');
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timerRef.current);
  }, [applyRemoteContent, localUpdatedAtStorageKey, mx, settings, syncEnabled, setSyncStatus]);
}
