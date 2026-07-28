import { useCallback, useEffect, useRef } from 'react';
import { atom, useAtom, useSetAtom } from 'jotai';
import type { MatrixEvent } from '$types/matrix-sdk';

import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAccountDataCallback } from '$hooks/useAccountDataCallback';
import { settingsAtom } from '$state/settings';
import { deserializeFromSync, prepareSettingsForSync } from '$utils/settingsSync';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import { backfillLocalTweakCss, hydrateSyncedLocalTweakCss } from '../theme/syncedTweakCss';

export type SyncStatus = 'idle' | 'syncing' | 'partial' | 'error';

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

  // On mount / when sync is first enabled: load from account data
  useEffect(() => {
    if (!syncEnabled) return;
    const event = mx.getAccountData(CustomAccountDataEvent.SableSettings);
    if (!event) return;
    // Strip synctoken so a stored sync token from a previous session doesn't get treated
    // as an incoming change from another device.
    const { synctoken: echoField, ...content } = event.getContent();
    const merged = deserializeFromSync(content, settingsRef.current);
    if (merged) {
      void hydrateSyncedLocalTweakCss(merged.themeRemoteTweakFavorites);
      if (JSON.stringify(merged) !== JSON.stringify(settingsRef.current)) {
        setSettings(merged);
      }
      setLastSynced(Date.now());
    }
  }, [mx, syncEnabled, setSettings, setLastSynced]);

  const uploadGenerationRef = useRef(0);
  const ownEchoesRef = useRef(new Map<string, { generation: number; status: SyncStatus }>());

  // Live updates from other devices
  const onAccountData = useCallback(
    (event: MatrixEvent) => {
      if (event.getType() !== (CustomAccountDataEvent.SableSettings as string)) return;
      const rawContent = event.getContent();
      const ownEcho =
        typeof rawContent.synctoken === 'string'
          ? ownEchoesRef.current.get(rawContent.synctoken)
          : undefined;
      if (ownEcho) {
        ownEchoesRef.current.delete(rawContent.synctoken as string);
        if (ownEcho.generation === uploadGenerationRef.current) {
          setLastSynced(Date.now());
          setSyncStatus(ownEcho.status);
        }
        return;
      }
      if (!settingsRef.current.settingsSyncEnabled) return;

      // Strip internal synctoken field before deserializing so stale tokens from
      // previous sessions (stored on the homeserver) don't bypass the check above
      // and don't leak into the settings object.
      const { synctoken: echoField, ...content } = rawContent;

      // Otherwise it came from another device — apply it.
      const merged = deserializeFromSync(content, settingsRef.current);
      if (merged) void hydrateSyncedLocalTweakCss(merged.themeRemoteTweakFavorites);
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timerRef.current);
    const generation = ++uploadGenerationRef.current;
    if (!syncEnabled) {
      setSyncStatus('idle');
      return undefined;
    }
    let cancelled = false;
    timerRef.current = setTimeout(() => {
      void (async () => {
        const current = settingsRef.current;
        const themeRemoteTweakFavorites = await backfillLocalTweakCss(
          current.themeRemoteTweakFavorites
        );
        if (
          cancelled ||
          generation !== uploadGenerationRef.current ||
          !settingsRef.current.settingsSyncEnabled
        )
          return;
        const prepared = prepareSettingsForSync({ ...current, themeRemoteTweakFavorites });
        const token = Math.random().toString(36).slice(2, 10);
        const completionStatus: SyncStatus =
          prepared.excludedLocalTweakUrls.length > 0 ? 'partial' : 'idle';
        ownEchoesRef.current.set(token, { generation, status: completionStatus });
        setSyncStatus('syncing');
        const content = {
          ...prepared.content,
          synctoken: token,
        };
        mx.setAccountData(
          CustomAccountDataEvent.SableSettings,
          content as Record<string, unknown>
        ).catch(() => {
          ownEchoesRef.current.delete(token);
          if (generation === uploadGenerationRef.current) setSyncStatus('error');
        });
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (generation === uploadGenerationRef.current) uploadGenerationRef.current += 1;
      clearTimeout(timerRef.current);
    };
  }, [mx, settings, syncEnabled, setSyncStatus]);
}
