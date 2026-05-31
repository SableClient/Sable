import { useCallback, useEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import type { MatrixEvent, MatrixClient } from '$types/matrix-sdk';
import { SetPresence, MatrixError } from '$types/matrix-sdk';
import * as Sentry from '@sentry/react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useAccountDataCallback } from '$hooks/useAccountDataCallback';
import { settingsAtom, presenceAutoIdledAtom } from '$state/settings';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import { getSlidingSyncManager } from '$client/initMatrix';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('PresenceSync');

/** Milliseconds to wait after a local presence change before uploading. */
const DEBOUNCE_MS = 25000; // 25 seconds

/** Fast debounce for activity events (idle→online) to ensure rapid multi-device sync. */
const ACTIVITY_DEBOUNCE_MS = 500; // 500ms

/** Minimum time between presence updates to avoid rate limiting. */
const THROTTLE_MS = 25000; // 25 seconds

/** Sleep utility for rate limit backoff. */
const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Timestamp (ms) of the last successful presence send. */
let lastSentTimestamp = 0;

/** Module-level debounce timer - survives component remounts and navigation. */
let presenceDebounceTimer: ReturnType<typeof setTimeout> | null = null;

type PresenceState = {
  /** The selected presence mode: 'online' | 'unavailable' | 'dnd' | 'offline' */
  presenceMode: 'online' | 'unavailable' | 'dnd' | 'offline';
  /** Whether auto-idle has been triggered locally. */
  autoIdled: boolean;
  /** Unix timestamp (ms) of when this state was last updated. */
  updatedAt: number;
  /** Unix timestamp (ms) of the most recent user activity across all devices. */
  lastActivityAt: number;
};

/**
 * Side-effect hook that syncs presence state across devices via account data.
 *
 * Presence doesn't echo back from the server on MSC4186, so we manually
 * propagate manual presence changes AND auto-idle state to other devices
 * using account data (similar to settings sync).
 *
 * Multi-device auto-idle coordination:
 * - ONLINE TAKES PRECEDENCE: When ANY device becomes active, ALL devices
 *   immediately switch to online. Activity events use a 2-second debounce
 *   for rapid synchronization.
 * - Idle events use a 25-second debounce to reduce server load and avoid
 *   rate limiting.
 * - Tracks `lastActivityAt` timestamp to coordinate activity across devices.
 * - Dispatches 'sable:remote-activity' custom event when another device
 *   becomes active, which resets the local idle timer in usePresenceAutoIdle.
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

    // Backcompat: if lastActivityAt is missing, initialize it
    if (!state.lastActivityAt) {
      state.lastActivityAt = state.updatedAt || Date.now();
    }

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

      // Backcompat: if lastActivityAt is missing, initialize it
      if (!state.lastActivityAt) {
        state.lastActivityAt = state.updatedAt || Date.now();
      }

      // If this is the same as what we last saw, skip (dedupe)
      if (
        lastRemoteStateRef.current &&
        lastRemoteStateRef.current.presenceMode === state.presenceMode &&
        lastRemoteStateRef.current.autoIdled === state.autoIdled &&
        lastRemoteStateRef.current.lastActivityAt === state.lastActivityAt
      ) {
        return;
      }

      lastRemoteStateRef.current = state;

      // Apply state from another device
      debugLog.info('general', 'Received presence update from another device', { state });

      // ONLINE TAKES PRECEDENCE: If remote device is active (not auto-idled),
      // immediately clear local auto-idle state. This ensures that when ANY device
      // becomes active, ALL devices switch to online.
      if (!state.autoIdled && autoIdledRef.current) {
        debugLog.info('general', 'Remote device is active — clearing local auto-idle');
        setAutoIdled(false);
        // Trigger activity event in auto-idle hook to reset its timer
        window.dispatchEvent(
          new CustomEvent('sable:remote-activity', { detail: { timestamp: state.lastActivityAt } })
        );
      }

      // DON'T apply remote idle state if we're currently active locally.
      // This prevents race conditions where remote idle updates overwrite local activity
      // during the debounce window before our activity uploads to account data.
      if (state.autoIdled && !autoIdledRef.current) {
        debugLog.info('general', 'Ignoring remote idle state — we are active locally');
        // Don't apply the remote idle state
      } else if (state.autoIdled !== autoIdledRef.current) {
        setAutoIdled(state.autoIdled);
      }

      if (state.presenceMode !== settingsRef.current.presenceMode) {
        setSettings({ ...settingsRef.current, presenceMode: state.presenceMode });
      }

      // DO NOT send to server here — the remote device already sent it.
      // Sending again causes redundant traffic and can trigger rate limiting,
      // preventing our local state changes from being sent when they should be.
    },
    [setSettings, setAutoIdled]
  );
  useAccountDataCallback(mx, onAccountData);

  // Debounced upload whenever presence or auto-idle changes
  useEffect(() => {
    if (!syncEnabled) return undefined;

    // Clear any existing module-level timer
    if (presenceDebounceTimer !== null) {
      clearTimeout(presenceDebounceTimer);
      presenceDebounceTimer = null;
    }

    // Use fast debounce for activity events (idle→online) to ensure rapid multi-device sync.
    // Use longer debounce for idle events to avoid rate limiting.
    const wasIdled = lastRemoteStateRef.current?.autoIdled ?? false;
    const isActivityEvent = wasIdled && !autoIdled;
    const debounceMs = isActivityEvent ? ACTIVITY_DEBOUNCE_MS : DEBOUNCE_MS;

    presenceDebounceTimer = setTimeout(() => {
      const token = Math.random().toString(36).slice(2, 10);
      pendingEchoTokenRef.current = token;

      const now = Date.now();
      // When going from idle to active, update lastActivityAt
      // When going idle, preserve the existing lastActivityAt from remote state
      const lastActivityAt =
        !autoIdled && lastRemoteStateRef.current?.lastActivityAt
          ? Math.max(now, lastRemoteStateRef.current.lastActivityAt)
          : (lastRemoteStateRef.current?.lastActivityAt ?? now);

      const state: PresenceState & { synctoken: string } = {
        presenceMode,
        autoIdled,
        updatedAt: now,
        lastActivityAt,
        synctoken: token,
      };

      debugLog.info('general', 'Uploading presence to account data', {
        state,
        isActivityEvent,
        debounceMs,
      });

      mx.setAccountData(CustomAccountDataEvent.SablePresence, state as Record<string, unknown>)
        .then(() => {
          lastRemoteStateRef.current = {
            presenceMode,
            autoIdled,
            updatedAt: state.updatedAt,
            lastActivityAt: state.lastActivityAt,
          };
        })
        .catch((err) => {
          pendingEchoTokenRef.current = null;
          debugLog.error('general', 'Failed to upload presence to account data', {
            error: err instanceof Error ? err.message : String(err),
          });
        });

      // Also send to the server
      void sendPresenceToServer(
        mx,
        presenceMode,
        autoIdled,
        settings.presenceStatusMsg,
        syncEnabled
      );
    }, debounceMs);

    return () => {
      if (presenceDebounceTimer !== null) {
        clearTimeout(presenceDebounceTimer);
        presenceDebounceTimer = null;
      }
    };
  }, [mx, presenceMode, autoIdled, syncEnabled, settings.presenceStatusMsg]);
}

/**
 * Send presence state to the Matrix server.
 * For auto-idle, sends 'unavailable'. For DND, sends 'online' with status_msg='[dnd]'
 * so other Sable clients can decode and display the DND badge.
 *
 * Throttles to at most once per THROTTLE_MS to avoid rate limiting.
 * If rate limited (429), respects Retry-After header and backs off.
 */
async function sendPresenceToServer(
  mx: MatrixClient,
  presenceMode: 'online' | 'unavailable' | 'dnd' | 'offline',
  autoIdled: boolean,
  customStatusMsg: string,
  syncEnabled: boolean
): Promise<void> {
  if (!syncEnabled) return;

  // Throttle: don't send more frequently than THROTTLE_MS
  const now = Date.now();
  const timeSinceLastSent = now - lastSentTimestamp;
  if (timeSinceLastSent < THROTTLE_MS) {
    debugLog.info('general', 'Skipping presence update (throttled)', {
      timeSinceLastSent,
      throttleMs: THROTTLE_MS,
    });
    return;
  }

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

  // Send via matrix-js-sdk with 429 handling and retry
  let retryCount = 0;
  const maxRetries = 3;

  // eslint-disable-next-line no-await-in-loop -- Sequential retries are intentional
  while (retryCount <= maxRetries) {
    try {
      await mx.setPresence({ presence: serverPresence, status_msg: statusMsg });
      lastSentTimestamp = Date.now();
      return; // Success - exit
    } catch (err) {
      if (err instanceof MatrixError && err.httpStatus === 429) {
        // Rate limited - respect Retry-After and retry after backoff
        const retryAfterMs = err.data?.retry_after_ms ?? 5000;
        debugLog.warn('general', 'Presence rate limited (429), backing off', {
          retryAfterMs,
          retryCount,
        });

        Sentry.captureMessage('Presence rate limited', {
          level: 'warning',
          tags: { component: 'presence-sync' },
          extra: { retryAfterMs, userId: mx.getUserId(), retryCount },
        });

        // If we've exhausted retries, give up
        if (retryCount >= maxRetries) {
          debugLog.error('general', 'Presence retry limit exceeded after 429', { maxRetries });
          lastSentTimestamp = Date.now();
          return;
        }

        // Wait before retrying
        await sleep(retryAfterMs);
        lastSentTimestamp = Date.now();
        retryCount += 1;
        continue; // Retry the request
      }
      // Non-429 error - log and exit
      debugLog.error('general', 'Failed to send presence to server', {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
  }

  // Also update classic sync presence param
  mx.setSyncPresence(serverPresence === 'offline' ? SetPresence.Offline : undefined);

  // Also update sliding sync presence extension
  getSlidingSyncManager(mx)?.setPresenceEnabled(serverPresence !== 'offline');
}
