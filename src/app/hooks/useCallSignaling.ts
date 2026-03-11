import { useEffect, useRef, useCallback } from 'react';
import { MatrixEvent } from 'matrix-js-sdk';
import { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';
import { useSetAtom, useAtomValue } from 'jotai';
import { mDirectAtom } from '$state/mDirectList';
import { incomingCallRoomIdAtom, mutedCallRoomIdAtom } from '$state/callEmbed';
import InviteSound from '$public/sound/invite.ogg';
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
    const inc = new Audio(InviteSound);
    inc.loop = true;
    incomingAudioRef.current = inc;

    const out = new Audio(InviteSound);
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
        incomingAudioRef.current.play().catch(() => {
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
      const myUserId = mx.getUserId();
      const now = Date.now();

      const signal = [...mDirects].reduce<{ incoming: string | null; outgoing: string | null }>(
        (found, roomId) => {
          if (found.incoming) return found;
          if (mutedRoomId === roomId) return found;
          const room = mx.getRoom(roomId);
          if (!room) return found;

          const session = mx.matrixRTC.getRoomSession(room);
          const memberships = MatrixRTCSession.sessionMembershipsForRoom(
            room,
            session.sessionDescription
          );

          const remoteMembers = memberships.filter((m: any) => (m.userId || m.sender) !== myUserId);
          const isSelfInCall = memberships.some((m: any) => (m.userId || m.sender) === myUserId);

          if (remoteMembers.length > 0 && !isSelfInCall) {
            return { ...found, incoming: roomId };
          }
          if (isSelfInCall && remoteMembers.length === 0) {
            if (!outgoingStartRef.current) {
              outgoingStartRef.current = now;
            }
            const elapsed = now - outgoingStartRef.current;
            if (elapsed < 30000) {
              return { ...found, outgoing: roomId };
            }
            // call timed out
          }

          return found;
        },
        { incoming: null, outgoing: null }
      );

      if (signal.incoming) {
        playRinging(signal.incoming);
      } else if (signal.outgoing) {
        playOutgoingRinging(signal.outgoing);
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
