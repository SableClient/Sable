import { useEffect, useRef, useCallback } from 'react';
import { RoomStateEvent } from 'matrix-js-sdk';
import { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';
import { useSetAtom, useAtomValue } from 'jotai';
import { mDirectAtom } from '$state/mDirectList';
import { incomingCallRoomIdAtom, mutedCallRoomIdAtom } from '$state/callEmbed';
import RingtoneSound from '$public/sound/ringtone.webm';
import { useMatrixClient } from './useMatrixClient';

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

  const mutedRoomId = useAtomValue(mutedCallRoomIdAtom);
  const setMutedRoomId = useSetAtom(mutedCallRoomIdAtom);

  // Stable refs so volatile values (mutedRoomId, ring callbacks) don't force
  // the listener registration effect to re-run — which would cause the
  // SessionEnded and RoomState.events listeners to accumulate when muting
  // or when call state changes rapidly during a sync retry cycle.
  const mutedRoomIdRef = useRef(mutedRoomId);
  mutedRoomIdRef.current = mutedRoomId;

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
      outgoingAudioRef.current.play().catch(() => {});
      ringingRoomIdRef.current = roomId;
    }
  }, []);

  const playRinging = useCallback(
    (roomId: string) => {
      if (incomingAudioRef.current && ringingRoomIdRef.current !== roomId) {
        incomingAudioRef.current.play().catch(() => {});
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

      const signal = Array.from(mDirects).reduce<SignalState>(
        (acc, roomId) => {
          if (acc.incoming || mutedRoomIdRef.current === roomId) return acc;

          const room = mx.getRoom(roomId);
          if (!room) return acc;

          const session = mx.matrixRTC.getRoomSession(room);
          const memberships = MatrixRTCSession.sessionMembershipsForRoom(
            room,
            session.sessionDescription
          );

          const remoteMembers = memberships.filter((m: any) => (m.userId || m.sender) !== myUserId);
          const isSelfInCall = memberships.some((m: any) => (m.userId || m.sender) === myUserId);
          const currentPhase = callPhaseRef.current[roomId] || 'IDLE';

          // no one here
          if (!isSelfInCall && remoteMembers.length === 0) {
            callPhaseRef.current[roomId] = 'IDLE';
            return acc;
          }

          // being called
          if (remoteMembers.length > 0 && !isSelfInCall) {
            callPhaseRef.current[roomId] = 'RINGING_IN';
            return { ...acc, incoming: roomId };
          }

          // multiple people no ringtone
          if (isSelfInCall && remoteMembers.length > 0) {
            callPhaseRef.current[roomId] = 'ACTIVE';
            return acc;
          }

          // alone in call
          if (isSelfInCall && remoteMembers.length === 0) {
            // Check if post call
            if (currentPhase === 'ACTIVE' || currentPhase === 'ENDED') {
              callPhaseRef.current[roomId] = 'ENDED';
              return acc;
            }

            // Check if new call
            if (currentPhase === 'IDLE' || currentPhase === 'RINGING_OUT') {
              if (!outgoingStartRef.current) outgoingStartRef.current = now;

              if (now - outgoingStartRef.current < 30000) {
                callPhaseRef.current[roomId] = 'RINGING_OUT';
                return { ...acc, outgoing: roomId };
              }

              callPhaseRef.current[roomId] = 'ENDED';
            }
          }

          return acc;
        },
        { incoming: null, outgoing: null }
      );

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
      stopRingingRef.current();
    };
  }, [mx, mDirects, setMutedRoomId]); // stable: volatile deps accessed via refs above

  return null;
}
