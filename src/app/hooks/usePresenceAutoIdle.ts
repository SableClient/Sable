import { useCallback, useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { type MatrixClient, UserEvent, type UserEventHandlerMap } from '$types/matrix-sdk';
import { presenceAutoIdledAtom } from '$state/settings';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('PresenceAutoIdle');
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'] as const;

/**
 * Automatically transitions presence to idle after a configurable inactivity
 * timeout, and clears the idle state when activity is detected.
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

    const handleActivity = () => {
      clearTimer();
      if (autoIdledRef.current) {
        debugLog.info('general', 'Activity detected — clearing auto-idle');
        autoIdledRef.current = false;
        setAutoIdled(false);
      }
      timerRef.current = window.setTimeout(goIdle, timeoutMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleActivity();
    };

    // Start the initial timer.
    timerRef.current = window.setTimeout(goIdle, timeoutMs);
    ACTIVITY_EVENTS.forEach((ev) =>
      document.addEventListener(ev, handleActivity, { passive: true })
    );
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleActivity);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => document.removeEventListener(ev, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleActivity);
      clearTimer();
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
