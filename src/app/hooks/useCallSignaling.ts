import { useEffect, useRef, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { RoomStateEvent } from '$types/matrix-sdk';
import { MatrixRTCSession } from '$types/matrix-sdk';
import { MatrixRTCSessionManagerEvents } from '$types/matrix-sdk';
import { useSetAtom, useAtomValue } from 'jotai';
import { getSlidingSyncManager } from '$client/initMatrix';
import { LIST_DMS } from '$client/slidingSync';
import { mDirectAtom } from '$state/mDirectList';
import { incomingCallRoomIdAtom, mutedCallRoomIdAtom } from '$state/callEmbed';
import RingtoneSound from '$public/sound/ringtone.webm';
import { useMatrixClient } from './useMatrixClient';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('CallSignaling');
const CALL_SIGNAL_DM_EXPAND_BATCH = 30;
const CALL_SIGNAL_DM_EXPAND_INTERVAL_MS = 5000;

type CallPhase = 'IDLE' | 'RINGING_OUT' | 'RINGING_IN' | 'ACTIVE' | 'ENDED';

interface SignalState {
  incoming: string | null;
  outgoing: string | null;
}

export function useCallSignaling() {
  const mx = useMatrixClient();
  const setIncomingCall = useSetAtom(incomingCallRoomIdAtom);
  const mDirects = useAtomValue(mDirectAtom);

  const incomingAudioRef = useRef<HTMLAudioElement | null>(null);
  const outgoingAudioRef = useRef<HTMLAudioElement | null>(null);
  const ringingRoomIdRef = useRef<string | null>(null);
  const outgoingStartRef = useRef<number | null>(null);
  const callPhaseRef = useRef<Record<string, CallPhase>>({});
  const callSubscriptionRoomIdRef = useRef<string | null>(null);
  const dmListExpansionAtRef = useRef(0);

  const mutedRoomId = useAtomValue(mutedCallRoomIdAtom);
  const setMutedRoomId = useSetAtom(mutedCallRoomIdAtom);

  // Stable refs so volatile values (mutedRoomId, mDirects, ring callbacks)
  // don't force the listener registration effect to re-run.
  //
  // mDirects in particular: jotai emits a new Set<string> reference on every
  // m.direct account-data event. During a rapid post-foreground sync burst this
  // can fire 11+ times, causing the effect to re-register SessionStarted /
  // SessionEnded listeners on mx.matrixRTC before React drains its cleanup
  // queue, accumulating up to 11 duplicate listeners.
  const mutedRoomIdRef = useRef(mutedRoomId);
  mutedRoomIdRef.current = mutedRoomId;
  const mDirectsRef = useRef(mDirects);
  mDirectsRef.current = mDirects;

  useEffect(() => {
    const inc = new Audio(RingtoneSound);
    inc.loop = true;
    incomingAudioRef.current = inc;

    const out = new Audio(RingtoneSound);
    out.loop = true;
    outgoingAudioRef.current = out;

    return () => {
      inc.pause();
      out.pause();
    };
  }, []);

  const stopRinging = useCallback(() => {
    incomingAudioRef.current?.pause();
    outgoingAudioRef.current?.pause();
    if (incomingAudioRef.current) incomingAudioRef.current.currentTime = 0;
    if (outgoingAudioRef.current) outgoingAudioRef.current.currentTime = 0;

    ringingRoomIdRef.current = null;
    setIncomingCall(null);
  }, [setIncomingCall]);

  const playOutgoingRinging = useCallback((roomId: string) => {
    if (outgoingAudioRef.current && ringingRoomIdRef.current !== roomId) {
      // Attempt play — catch NotAllowedError silently (autoplay blocked by browser).
      // This is expected behavior when there's no recent user gesture.
      outgoingAudioRef.current.play().catch((err) => {
        if (err.name !== 'NotAllowedError') {
          debugLog.warn('call', 'Outgoing ringtone play failed', { error: String(err) });
        }
      });
      ringingRoomIdRef.current = roomId;
    }
  }, []);

  const playRinging = useCallback(
    (roomId: string) => {
      if (incomingAudioRef.current && ringingRoomIdRef.current !== roomId) {
        // Attempt play — catch NotAllowedError silently (autoplay blocked by browser).
        // This is expected behavior when there's no recent user gesture.
        incomingAudioRef.current.play().catch((err) => {
          if (err.name !== 'NotAllowedError') {
            debugLog.warn('call', 'Incoming ringtone play failed', { error: String(err) });
          }
        });
        ringingRoomIdRef.current = roomId;
        setIncomingCall(roomId);
      }
    },
    [setIncomingCall]
  );

  // Must be declared after the callbacks above so the initial useRef(value) call
  // sees their current identity. Updated on every render so the effect closure
  // always calls the latest version without needing them in the dep array.
  const playRingingRef = useRef(playRinging);
  playRingingRef.current = playRinging;
  const stopRingingRef = useRef(stopRinging);
  stopRingingRef.current = stopRinging;
  const playOutgoingRingingRef = useRef(playOutgoingRinging);
  playOutgoingRingingRef.current = playOutgoingRinging;

  useEffect(() => {
    if (!mx || !mx.matrixRTC) return undefined;

    const checkDMsForActiveCalls = () => {
      const myUserId = mx.getUserId();
      const now = Date.now();
      let unloadedDirectRooms = 0;

      const signal = Array.from(mDirectsRef.current).reduce<SignalState>(
        (acc, roomId) => {
          if (acc.incoming || mutedRoomIdRef.current === roomId) return acc;

          const room = mx.getRoom(roomId);
          if (!room) {
            unloadedDirectRooms += 1;
            return acc;
          }

          const session = mx.matrixRTC.getRoomSession(room);
          const memberships = MatrixRTCSession.sessionMembershipsForRoom(
            room,
            session.sessionDescription
          );

          const remoteMembers = memberships.filter(
            (m: { userId?: string; sender?: string }) => (m.userId || m.sender) !== myUserId
          );
          const isSelfInCall = memberships.some(
            (m: { userId?: string; sender?: string }) => (m.userId || m.sender) === myUserId
          );
          const currentPhase = callPhaseRef.current[roomId] || 'IDLE';

          // no one here
          if (!isSelfInCall && remoteMembers.length === 0) {
            callPhaseRef.current[roomId] = 'IDLE';
            return acc;
          }

          // being called
          if (remoteMembers.length > 0 && !isSelfInCall) {
            if (currentPhase !== 'RINGING_IN') {
              debugLog.info('call', 'Incoming call detected', {
                roomId,
                remoteCount: remoteMembers.length,
              });
              Sentry.addBreadcrumb({
                category: 'call.signal',
                message: 'Incoming call ringing',
                data: { roomId },
              });
            }
            callPhaseRef.current[roomId] = 'RINGING_IN';
            acc.incoming = roomId;
            return acc;
          }

          // multiple people no ringtone
          if (isSelfInCall && remoteMembers.length > 0) {
            if (currentPhase !== 'ACTIVE') {
              debugLog.info('call', 'Call became active', { roomId });
              Sentry.addBreadcrumb({
                category: 'call.signal',
                message: 'Call active',
                data: { roomId },
              });
              Sentry.metrics.count('sable.call.active', 1);
            }
            callPhaseRef.current[roomId] = 'ACTIVE';
            return acc;
          }

          // alone in call
          if (isSelfInCall && remoteMembers.length === 0) {
            // Check if post call
            if (currentPhase === 'ACTIVE' || currentPhase === 'ENDED') {
              if (currentPhase !== 'ENDED') {
                debugLog.info('call', 'Call ended', { roomId });
                Sentry.addBreadcrumb({
                  category: 'call.signal',
                  message: 'Call ended',
                  data: { roomId },
                });
                Sentry.metrics.count('sable.call.ended', 1);
              }
              callPhaseRef.current[roomId] = 'ENDED';
              return acc;
            }

            // Check if new call
            if (currentPhase === 'IDLE' || currentPhase === 'RINGING_OUT') {
              if (!outgoingStartRef.current) outgoingStartRef.current = now;

              if (now - outgoingStartRef.current < 30000) {
                if (currentPhase !== 'RINGING_OUT') {
                  debugLog.info('call', 'Outgoing call ringing', { roomId });
                  Sentry.addBreadcrumb({
                    category: 'call.signal',
                    message: 'Outgoing call ringing',
                    data: { roomId },
                  });
                }
                callPhaseRef.current[roomId] = 'RINGING_OUT';
                acc.outgoing = roomId;
                return acc;
              }

              debugLog.info('call', 'Outgoing call timed out (unanswered)', {
                roomId,
              });
              Sentry.metrics.count('sable.call.timeout', 1);
              callPhaseRef.current[roomId] = 'ENDED';
            }
          }

          return acc;
        },
        { incoming: null, outgoing: null }
      );

      const slidingSyncManager = getSlidingSyncManager(mx);
      const activeCallRoomId = signal.incoming ?? signal.outgoing;
      const previousCallRoomId = callSubscriptionRoomIdRef.current;
      if (activeCallRoomId && activeCallRoomId !== previousCallRoomId) {
        if (previousCallRoomId) slidingSyncManager?.unsubscribeFromRoom(previousCallRoomId);
        slidingSyncManager?.subscribeToRoom(activeCallRoomId);
        callSubscriptionRoomIdRef.current = activeCallRoomId;
      } else if (!activeCallRoomId && previousCallRoomId) {
        slidingSyncManager?.unsubscribeFromRoom(previousCallRoomId);
        callSubscriptionRoomIdRef.current = null;
      }

      if (!activeCallRoomId && unloadedDirectRooms > 0 && slidingSyncManager) {
        const dmDiagnostics = slidingSyncManager.getListDiagnostics(LIST_DMS);
        const canExpand =
          dmDiagnostics &&
          dmDiagnostics.knownCount > 0 &&
          dmDiagnostics.rangeEnd < dmDiagnostics.knownCount - 1;
        if (canExpand && now - dmListExpansionAtRef.current >= CALL_SIGNAL_DM_EXPAND_INTERVAL_MS) {
          dmListExpansionAtRef.current = now;
          slidingSyncManager.requestListWindow(
            LIST_DMS,
            dmDiagnostics.rangeEnd + CALL_SIGNAL_DM_EXPAND_BATCH
          );
        }
      }

      if (signal.incoming) {
        playRingingRef.current(signal.incoming);
      } else if (signal.outgoing) {
        playOutgoingRingingRef.current(signal.outgoing);
      } else {
        stopRingingRef.current();
        if (!signal.outgoing) outgoingStartRef.current = null;
      }
    };

    const interval = setInterval(checkDMsForActiveCalls, 1000);

    const handleUpdate = () => checkDMsForActiveCalls();

    const handleSessionEnded = (roomId: string) => {
      if (mutedRoomIdRef.current === roomId) setMutedRoomId(null);
      callPhaseRef.current[roomId] = 'IDLE';
      checkDMsForActiveCalls();
    };

    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, handleUpdate);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, handleSessionEnded);
    mx.on(RoomStateEvent.Events, handleUpdate);

    checkDMsForActiveCalls();

    return () => {
      clearInterval(interval);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, handleUpdate);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, handleSessionEnded);
      mx.off(RoomStateEvent.Events, handleUpdate);
      const callRoomId = callSubscriptionRoomIdRef.current;
      if (callRoomId) {
        getSlidingSyncManager(mx)?.unsubscribeFromRoom(callRoomId);
        callSubscriptionRoomIdRef.current = null;
      }
      stopRingingRef.current();
    };
  }, [mx, setMutedRoomId]); // mDirects and mutedRoomId accessed via refs — do not add here

  return null;
}
