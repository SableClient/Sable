import { useEffect, useRef, useCallback } from 'react';
import { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';
import { useSetAtom, useAtomValue } from 'jotai';
import { mDirectAtom } from '$state/mDirectList';
import { incomingCallRoomIdAtom, mutedCallRoomIdAtom } from '$state/callEmbed';
import InviteSound from '$public/sound/invite.ogg';
import { useMatrixClient } from './useMatrixClient';
import { MatrixEvent } from 'matrix-js-sdk';

export function useCallSignaling() {
  const mx = useMatrixClient();
  const setIncomingCall = useSetAtom(incomingCallRoomIdAtom);
  const mDirects = useAtomValue(mDirectAtom);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringingRoomIdRef = useRef<string | null>(null);
  const mutedRoomId = useAtomValue(mutedCallRoomIdAtom);
  const setMutedRoomId = useSetAtom(mutedCallRoomIdAtom);

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
        if (ringingRoomIdRef.current === roomId) return null;
        if (mutedRoomId === roomId) return null;
        const room = mx.getRoom(roomId);
        if (!room) return null;

        const session = mx.matrixRTC.getRoomSession(room);
        const memberships = MatrixRTCSession.sessionMembershipsForRoom(
          room,
          session.sessionDescription
        );

        const myUserId = mx.getUserId();
        const remoteMembers = memberships.filter((m: any) => (m.userId || m.sender) !== myUserId);
        const isSelfInCall = memberships.some((m: any) => (m.userId || m.sender) === myUserId);

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

    const handleSessionEnded = (roomId: string) => {
      if (mutedRoomId === roomId) {
        setMutedRoomId(null);
      }
      checkDMsForActiveCalls();
    };

    const handleRoomState = (event: MatrixEvent) => {
      const type = event.getType();

      if (type === 'org.matrix.msc4075.rtc.notification') {
        const content = event.getContent();
        const sender = event.getSender();
        const serverTs = event.getTs();
        const senderTs = content.sender_ts || serverTs;
        const lifetime = content.lifetime || 30000;

        const now = Date.now();
        const isExpired = now - senderTs > lifetime;

        if (isExpired) {
          return;
        }

        if (content.notification_type === 'ring' && sender !== mx.getUserId()) {
          playRinging(event.getRoomId()!);
          return;
        }
      }

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
  }, [mx, mDirects, playRinging, stopRinging, mutedRoomId, setMutedRoomId]);
}
