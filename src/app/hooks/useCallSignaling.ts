import { useEffect, useRef, useCallback } from 'react';
import { RoomStateEvent } from 'matrix-js-sdk';
import { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';
import { useSetAtom, useAtomValue } from 'jotai';
import { mDirectAtom } from '$state/mDirectList';
import { incomingCallRoomIdAtom, mutedCallRoomIdAtom } from '$state/callEmbed';
import RingtoneSound from '$public/sound/ringtone.webm';
import { useMatrixClient } from './useMatrixClient';

export function useCallSignaling() {
  const mx = useMatrixClient();
  const setIncomingCall = useSetAtom(incomingCallRoomIdAtom);
  const mDirects = useAtomValue(mDirectAtom);

  const incomingAudioRef = useRef<HTMLAudioElement | null>(null);
  const outgoingAudioRef = useRef<HTMLAudioElement | null>(null);
  const ringingRoomIdRef = useRef<string | null>(null);
  const outgoingStartRef = useRef<number | null>(null);

  const mutedRoomId = useAtomValue(mutedCallRoomIdAtom);
  const setMutedRoomId = useSetAtom(mutedCallRoomIdAtom);

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
      incomingAudioRef.current = null;
      outgoingAudioRef.current = null;
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

  useEffect(() => {
    if (!mx || !mx.matrixRTC) return undefined;
    const checkDMsForActiveCalls = () => {
      const myUserId = mx.getUserId();
      const now = Date.now();

      const signal = [...mDirects].reduce<{ incoming: string | null; outgoing: string | null }>(
        (found, roomId) => {
          if (found.incoming || mutedRoomId === roomId) return found;

          const room = mx.getRoom(roomId);
          if (!room) return found;

          const session = mx.matrixRTC.getRoomSession(room);
          const memberships = MatrixRTCSession.sessionMembershipsForRoom(
            room,
            session.sessionDescription
          );

          const remoteMembers = memberships.filter((m: any) => (m.userId || m.sender) !== myUserId);
          const isSelfInCall = memberships.some((m: any) => (m.userId || m.sender) === myUserId);

          if (remoteMembers.length > 0 && !isSelfInCall) return { ...found, incoming: roomId };

          if (isSelfInCall && remoteMembers.length === 0) {
            if (!outgoingStartRef.current) outgoingStartRef.current = now;
            if (now - outgoingStartRef.current < 30000) return { ...found, outgoing: roomId };
          }

          return found;
        },
        { incoming: null, outgoing: null }
      );

      if (signal.incoming) {
        playRinging(signal.incoming);
      } else if (signal.outgoing) {
        playOutgoingRinging(signal.outgoing);
      } else {
        if (ringingRoomIdRef.current) stopRinging();
        outgoingStartRef.current = null;
      }
    };

    const interval = setInterval(() => {
      if (outgoingStartRef.current) checkDMsForActiveCalls();
    }, 1000);

    const handleUpdate = () => checkDMsForActiveCalls();
    const handleSessionEnded = (roomId: string) => {
      if (mutedRoomId === roomId) setMutedRoomId(null);
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
      stopRinging();
    };
  }, [mx, mDirects, playRinging, stopRinging, mutedRoomId, setMutedRoomId, playOutgoingRinging]);

  return null;
}
