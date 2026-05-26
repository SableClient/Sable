import { useCallback, useEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import type { MatrixEvent, MatrixClient } from '$types/matrix-sdk';
import { SetPresence } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAccountDataCallback } from '$hooks/useAccountDataCallback';
import { settingsAtom, presenceAutoIdledAtom } from '$state/settings';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import { getSlidingSyncManager } from '$client/initMatrix';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('PresenceSync');

/** Milliseconds to wait after a local presence change before uploading. */
const DEBOUNCE_MS = 500;

type PresenceState = {
  /** The selected presence mode: 'online' | 'unavailable' | 'dnd' | 'offline' */
  presenceMode: 'online' | 'unavailable' | 'dnd' | 'offline';
  /** Whether auto-idle has been triggered locally. */
  autoIdled: boolean;
  /** Unix timestamp (ms) of when this state was last updated. */
  updatedAt: number;
};

/**
 * Side-effect hook that syncs presence state across devices via account data.
 *
 * Presence doesn't echo back from the server on MSC4186, so we manually
 * propagate manual presence changes AND auto-idle state to other devices
 * using account data (similar to settings sync).
 *
 * When another device changes presence or goes idle, this hook receives
 * the account data update and applies it locally.
 *
 * Only active when `settings.sendPresence === true`.
 */
export function usePresenceSyncEffect(): void {
  const mx = useMatrixClient();
  const [settings, setSettings] = useAtom(settingsAtom);
  const [autoIdled, setAutoIdled] = useAtom(presenceAutoIdledAtom);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const autoIdledRef = useRef(autoIdled);
  autoIdledRef.current = autoIdled;

  const syncEnabled = settings.sendPresence;
  const presenceMode = settings.presenceMode ?? 'online';

  // Echo-detection: track the token of our last upload
  const pendingEchoTokenRef = useRef<string | null>(null);

  // Track last-known remote state to avoid unnecessary updates
  const lastRemoteStateRef = useRef<PresenceState | null>(null);

  // On mount / when sync is first enabled: load from account data
  useEffect(() => {
    if (!syncEnabled) return;
    const event = mx.getAccountData(CustomAccountDataEvent.SablePresence);
    if (!event) return;

    const content = event.getContent<PresenceState & { synctoken?: string }>();
    const { synctoken: _echoField, ...state } = content;

    if (!state.presenceMode || typeof state.autoIdled !== 'boolean') return;

    lastRemoteStateRef.current = state;

    // Apply remote state if it's newer than local or if we haven't initialized yet
    const localNeedsUpdate =
      state.presenceMode !== settingsRef.current.presenceMode ||
      state.autoIdled !== autoIdledRef.current;

    if (localNeedsUpdate) {
      debugLog.info('general', 'Loading presence from account data on mount', { state });
      if (state.presenceMode !== settingsRef.current.presenceMode) {
        setSettings({ ...settingsRef.current, presenceMode: state.presenceMode });
      }
      if (state.autoIdled !== autoIdledRef.current) {
        setAutoIdled(state.autoIdled);
      }
    }
  }, [mx, syncEnabled, setSettings, setAutoIdled]);

  // Live updates from other devices
  const onAccountData = useCallback(
    (event: MatrixEvent) => {
      if (event.getType() !== (CustomAccountDataEvent.SablePresence as string)) return;
      if (!settingsRef.current.sendPresence) return;

      const rawContent = event.getContent<PresenceState & { synctoken?: string }>();

      // If this is the echo of our own upload, skip.
      if (
        typeof rawContent.synctoken === 'string' &&
        rawContent.synctoken === pendingEchoTokenRef.current
      ) {
        pendingEchoTokenRef.current = null;
        debugLog.info('general', 'Received echo of our own presence upload', {
          mode: rawContent.presenceMode,
          autoIdled: rawContent.autoIdled,
        });
        return;
      }

      // Strip synctoken
      const { synctoken: _echoField, ...state } = rawContent;

      if (!state.presenceMode || typeof state.autoIdled !== 'boolean') return;

      // If this is the same as what we last saw, skip (dedupe)
      if (
        lastRemoteStateRef.current &&
        lastRemoteStateRef.current.presenceMode === state.presenceMode &&
        lastRemoteStateRef.current.autoIdled === state.autoIdled
      ) {
        return;
      }

      lastRemoteStateRef.current = state;

      // Apply state from another device
      debugLog.info('general', 'Received presence update from another device', { state });

      if (state.presenceMode !== settingsRef.current.presenceMode) {
        setSettings({ ...settingsRef.current, presenceMode: state.presenceMode });
      }
      if (state.autoIdled !== autoIdledRef.current) {
        setAutoIdled(state.autoIdled);
      }

      // Also send to the server so it broadcasts to others
      // (even though it won't echo back to us)
      sendPresenceToServer(mx, state.presenceMode, state.autoIdled, settingsRef.current.presenceStatusMsg, syncEnabled);
    },
    [mx, setSettings, setAutoIdled, syncEnabled]
  );
  useAccountDataCallback(mx, onAccountData);

  // Debounced upload whenever presence or auto-idle changes
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!syncEnabled) return undefined;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const token = Math.random().toString(36).slice(2, 10);
      pendingEchoTokenRef.current = token;

      const state: PresenceState & { synctoken: string } = {
        presenceMode,
        autoIdled,
        updatedAt: Date.now(),
        synctoken: token,
      };

      debugLog.info('general', 'Uploading presence to account data', { state });

      mx.setAccountData(CustomAccountDataEvent.SablePresence, state as Record<string, unknown>)
        .then(() => {
          lastRemoteStateRef.current = { presenceMode, autoIdled, updatedAt: state.updatedAt };
        })
        .catch((err) => {
          pendingEchoTokenRef.current = null;
          debugLog.error('general', 'Failed to upload presence to account data', {
            error: err instanceof Error ? err.message : String(err),
          });
        });

      // Also send to the server
      sendPresenceToServer(mx, presenceMode, autoIdled, settings.presenceStatusMsg, syncEnabled);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timerRef.current);
  }, [mx, presenceMode, autoIdled, syncEnabled]);
}

/**
 * Send presence state to the Matrix server.
 * For auto-idle, sends 'unavailable'. For DND, sends 'online' with status_msg='dnd'
 * so other Sable clients can decode and display the DND badge.
 */
function sendPresenceToServer(
  mx: MatrixClient,
  presenceMode: 'online' | 'unavailable' | 'dnd' | 'offline',
  autoIdled: boolean,
  customStatusMsg: string,
  syncEnabled: boolean
): void {
  if (!syncEnabled) return;

  // Determine effective presence to send to server
  let serverPresence: 'online' | 'unavailable' | 'offline' = 'online';
  let statusMsg: string | undefined;

  if (autoIdled) {
    serverPresence = 'unavailable';
    // Preserve custom status when auto-idled
    statusMsg = customStatusMsg || undefined;
  } else if (presenceMode === 'dnd') {
    // DND is encoded as online + status_msg starting with '[dnd]' so:
    // - Other Sable clients decode it and show the DND badge (red color)
    // - Non-Sable clients see the [dnd] prefix and custom status
    // - Sable strips the [dnd] prefix when displaying status text
    serverPresence = 'online';
    statusMsg = customStatusMsg ? `[dnd] ${customStatusMsg}` : '[dnd]';
  } else if (presenceMode === 'offline') {
    serverPresence = 'offline';
    statusMsg = customStatusMsg || undefined;
  } else if (presenceMode === 'unavailable') {
    serverPresence = 'unavailable';
    statusMsg = customStatusMsg || undefined;
  } else {
    // online
    serverPresence = 'online';
    statusMsg = customStatusMsg || undefined;
  }

  debugLog.info('general', 'Sending presence to server', {
    mode: presenceMode,
    autoIdled,
    serverPresence,
    statusMsg,
  });

  // Send via matrix-js-sdk
  mx.setPresence({ presence: serverPresence, status_msg: statusMsg }).catch((err: Error) => {
    debugLog.error('general', 'Failed to send presence to server', {
      error: err.message,
    });
  });

  // Also update classic sync presence param
  mx.setSyncPresence(serverPresence === 'offline' ? SetPresence.Offline : undefined);

  // Also update sliding sync presence extension
  getSlidingSyncManager(mx)?.setPresenceEnabled(serverPresence !== 'offline');
}
