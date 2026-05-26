import { useCallback, useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { type MatrixClient, UserEvent, type UserEventHandlerMap } from '$types/matrix-sdk';
import { presenceAutoIdledAtom } from '$state/settings';
import { appEvents } from '$utils/appEvents';
import { createDebugLogger } from '$utils/debugLogger';
import { mobileOrTablet } from '$utils/user-agent';

const debugLog = createDebugLogger('PresenceAutoIdle');
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'] as const;

/**
 * Automatically transitions presence to idle after a configurable inactivity
 * timeout, and clears the idle state when activity is detected.
 *
 * Multi-device coordination:
 * - ONLINE TAKES PRECEDENCE: When ANY device detects activity, ALL devices
 *   immediately switch to online and reset their idle timers.
 * - Activity is synced via account data with a 2-second debounce for rapid
 *   cross-device updates.
 * - Listens for the 'sable:remote-activity' custom event dispatched by
 *   usePresenceSync when another device becomes active.
 *
 * Also subscribes to the Matrix `User.presence` event so that if another device
 * sets you back to `online`, the auto-idle state is cleared here too (multi-device
 * sync).
 *
 * Note: On iOS Safari PWA, background tab throttling may delay or prevent the
 * inactivity timer from firing reliably. The feature degrades gracefully — presence
 * will eventually update when the tab regains focus.
 */
export function usePresenceAutoIdle(
  mx: MatrixClient,
  presenceMode: string,
  sendPresence: boolean,
  timeoutMs: number
): void {
  const setAutoIdled = useSetAtom(presenceAutoIdledAtom);
  const autoIdledRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  // Inactivity timer: go idle after timeoutMs without user input.
  useEffect(() => {
    const shouldAutoIdle = presenceMode === 'online' && sendPresence && timeoutMs > 0;
    if (!shouldAutoIdle) {
      clearTimer();
      if (autoIdledRef.current) {
        autoIdledRef.current = false;
        setAutoIdled(false);
      }
      return undefined;
    }

    const goIdle = () => {
      debugLog.info('general', 'Inactivity timeout — auto-idling');
      autoIdledRef.current = true;
      setAutoIdled(true);
    };

    const handleActivity = (event?: Event) => {
      // On desktop, cursor movement over the window fires mousemove even when
      // the window does not have OS focus (e.g. the user is working in another
      // app). Treat those as non-events so the idle timer can run to completion
      // without the user having to keep their hands off the mouse entirely.
      if (!mobileOrTablet() && event?.type === 'mousemove' && !document.hasFocus()) {
        return;
      }
      clearTimer();
      if (autoIdledRef.current) {
        debugLog.info('general', 'Activity detected — clearing auto-idle');
        autoIdledRef.current = false;
        setAutoIdled(false);
      }
      timerRef.current = window.setTimeout(goIdle, timeoutMs);
    };

    // Start the initial timer.
    timerRef.current = window.setTimeout(goIdle, timeoutMs);
    ACTIVITY_EVENTS.forEach((ev) =>
      document.addEventListener(ev, handleActivity, { passive: true })
    );

    // When the app returns to the foreground, treat it as activity so the user
    // isn't shown as idle the moment they switch back to the tab/PWA.
    const unsubVisibility = appEvents.onVisibilityChange((isVisible: boolean) => {
      if (isVisible) handleActivity();
    });

    // Listen for remote activity from other devices (dispatched by usePresenceSync)
    const handleRemoteActivity = () => {
      debugLog.info('general', 'Remote device activity detected — resetting timer');
      handleActivity();
    };
    window.addEventListener('sable:remote-activity', handleRemoteActivity);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => document.removeEventListener(ev, handleActivity));
      window.removeEventListener('sable:remote-activity', handleRemoteActivity);
      clearTimer();
      unsubVisibility();
    };
  }, [clearTimer, presenceMode, sendPresence, setAutoIdled, timeoutMs]);

  // Multi-device sync: if another device sets us back to online, clear auto-idle.
  useEffect(() => {
    if (!sendPresence) return undefined;
    const myUserId = mx.getUserId();
    if (!myUserId) return undefined;
    const user = mx.getUser(myUserId);
    if (!user) return undefined;

    const handlePresence: UserEventHandlerMap[UserEvent.Presence] = (_event, u) => {
      if (u.userId !== myUserId) return;
      if (u.presence === 'online' && autoIdledRef.current) {
        debugLog.info('general', 'Remote device set Online — clearing auto-idle');
        autoIdledRef.current = false;
        setAutoIdled(false);
      }
    };

    user.on(UserEvent.Presence, handlePresence);
    return () => {
      user.removeListener(UserEvent.Presence, handlePresence);
    };
  }, [mx, sendPresence, setAutoIdled]);
}
