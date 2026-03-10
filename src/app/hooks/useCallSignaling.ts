import { useEffect, useRef, useCallback } from 'react';
import { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';
import { useSetAtom, useAtomValue } from 'jotai';
import { mDirectAtom } from '$state/mDirectList';
import { incomingCallRoomIdAtom } from '$state/callEmbed';
import InviteSound from '$public/sound/invite.ogg';
import { useMatrixClient } from './useMatrixClient';

export function useCallSignaling() {
  const mx = useMatrixClient();
  const setIncomingCall = useSetAtom(incomingCallRoomIdAtom);
  const mDirects = useAtomValue(mDirectAtom);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringingRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    const audio = new Audio(InviteSound);
    audio.loop = true;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  const stopRinging = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    ringingRoomIdRef.current = null;
    setIncomingCall(null);
  }, [setIncomingCall]);

  const playRinging = useCallback(
    (roomId: string) => {
      if (audioRef.current && ringingRoomIdRef.current !== roomId) {
        audioRef.current.play().catch(() => {
          /* ignore autoplay error */
        });
        ringingRoomIdRef.current = roomId;
        setIncomingCall(roomId);
      }
    },
    [setIncomingCall]
  );

  useEffect(() => {
    if (!mx || !mx.matrixRTC) return undefined;
    const checkDMsForActiveCalls = () => {
      const activeRoomId = [...mDirects].reduce<string | null>((found, roomId) => {
        if (found) return found;
        const room = mx.getRoom(roomId);
        if (!room) return null;

        const session = mx.matrixRTC.getRoomSession(room);
        const memberships = MatrixRTCSession.sessionMembershipsForRoom(
          room,
          session.sessionDescription
        );

        const remoteMembers = memberships.filter((m) => m.userId !== mx.getUserId());
        const isSelfInCall = memberships.some((m) => m.userId === mx.getUserId());

        return remoteMembers.length > 0 && !isSelfInCall ? roomId : null;
      }, null);

      if (activeRoomId) {
        playRinging(activeRoomId);
      } else if (ringingRoomIdRef.current) {
        stopRinging();
      }
    };

    const handleSessionStarted = (roomId: string) => {
      if (mDirects.has(roomId)) {
        checkDMsForActiveCalls();
      }
    };

    const handleSessionEnded = () => {
      checkDMsForActiveCalls();
    };

    const handleRoomState = () => {
      checkDMsForActiveCalls();
    };

    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, handleSessionStarted);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, handleSessionEnded);
    mx.on('RoomState.events' as any, handleRoomState);

    checkDMsForActiveCalls();

    function cleanup() {
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, handleSessionStarted);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, handleSessionEnded);
      mx.off('RoomState.events' as any, handleRoomState);
      stopRinging();
    }

    return cleanup;
  }, [mx, mDirects, playRinging, stopRinging]);
}
