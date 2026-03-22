import { useCallback, useEffect, useRef } from 'react';
import { atom, useAtom, useSetAtom } from 'jotai';
import { MatrixEvent } from '$types/matrix-sdk';
import { AccountDataEvent } from '$types/matrix/accountData';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAccountDataCallback } from '$hooks/useAccountDataCallback';
import { settingsAtom } from '$state/settings';
import { deserializeFromSync, serializeForSync } from '$utils/settingsSync';

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

  // Keep a ref so callbacks can always read the latest value without stale closures.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const syncEnabled = settings.settingsSyncEnabled;

  // ── On mount / when sync is first enabled: load from account data ──────────
  useEffect(() => {
    if (!syncEnabled) return;
    const event = mx.getAccountData(AccountDataEvent.SableSettings);
    if (!event) return;
    const merged = deserializeFromSync(event.getContent(), settingsRef.current);
    if (merged) {
      if (JSON.stringify(merged) !== JSON.stringify(settingsRef.current)) {
        setSettings(merged);
      }
      setLastSynced(Date.now());
    }
  }, [mx, syncEnabled, setSettings, setLastSynced]);

  // ── Echo-detection: track the token of our last upload ────────────────────
  // When our upload echoes back via ClientEvent.AccountData we skip applying it
  // (to avoid overwriting settings that changed between upload and echo).
  const pendingEchoTokenRef = useRef<string | null>(null);

  // ── Live updates from other devices ───────────────────────────────────────
  const onAccountData = useCallback(
    (event: MatrixEvent) => {
      if (event.getType() !== AccountDataEvent.SableSettings) return;
      if (!settingsRef.current.settingsSyncEnabled) return;

      const content = event.getContent();

      // If this is the echo of our own upload, just confirm success and skip.
      if (typeof content._echo === 'string' && content._echo === pendingEchoTokenRef.current) {
        pendingEchoTokenRef.current = null;
        setLastSynced(Date.now());
        setSyncStatus('idle');
        return;
      }

      // Otherwise it came from another device — apply it only if values changed.
      const merged = deserializeFromSync(content, settingsRef.current);
      if (merged) {
        if (JSON.stringify(merged) !== JSON.stringify(settingsRef.current)) {
          setSettings(merged);
        }
        setLastSynced(Date.now());
      }
    },
    [setSettings, setLastSynced, setSyncStatus]
  );
  useAccountDataCallback(mx, onAccountData);

  // ── Debounced upload whenever settings change ──────────────────────────────
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!syncEnabled) return undefined;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSyncStatus('syncing');
      const token = Math.random().toString(36).slice(2, 10);
      pendingEchoTokenRef.current = token;
      const content = { ...serializeForSync(settingsRef.current), _echo: token };
      mx.setAccountData(AccountDataEvent.SableSettings, content as Record<string, unknown>).catch(
        () => {
          pendingEchoTokenRef.current = null;
          setSyncStatus('error');
        }
      );
    }, DEBOUNCE_MS);

    return () => clearTimeout(timerRef.current);
  }, [mx, settings, syncEnabled, setSyncStatus]);
}
