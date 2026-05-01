import type { Room } from '$types/matrix-sdk';
import { MatrixRTCSession, MatrixRTCSessionEvent } from '$types/matrix-sdk';
import type { CallMembership } from '$types/matrix-sdk';
import { useEffect, useState } from 'react';
import { MatrixRTCSessionManagerEvents } from '$types/matrix-sdk';
import { useMatrixClient } from './useMatrixClient';

export const useCallSession = (room: Room): MatrixRTCSession => {
  const mx = useMatrixClient();

  const [session, setSession] = useState(mx.matrixRTC.getRoomSession(room));

  useEffect(() => {
    const start = (roomId: string) => {
      if (roomId !== room.roomId) return;
      setSession(mx.matrixRTC.getRoomSession(room));
    };
    const end = (roomId: string) => {
      if (roomId !== room.roomId) return;
      setSession(mx.matrixRTC.getRoomSession(room));
    };
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, start);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, end);
    return () => {
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, start);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, end);
    };
  }, [mx, room]);

  return session;
};

export const useCallMembers = (room: Room, session: MatrixRTCSession): CallMembership[] => {
  const [memberships, setMemberships] = useState(
    MatrixRTCSession.sessionMembershipsForRoom(room, session.sessionDescription)
  );

  useEffect(() => {
    const updateMemberships = () => {
      setMemberships(MatrixRTCSession.sessionMembershipsForRoom(room, session.sessionDescription));
    };

    updateMemberships();

    session.on(MatrixRTCSessionEvent.MembershipsChanged, updateMemberships);
    return () => {
      session.removeListener(MatrixRTCSessionEvent.MembershipsChanged, updateMemberships);
    };
  }, [session, room]);

  return memberships;
};

export const useCallMembersChange = (session: MatrixRTCSession, callback: () => void): void => {
  useEffect(() => {
    session.on(MatrixRTCSessionEvent.MembershipsChanged, callback);
    return () => {
      session.removeListener(MatrixRTCSessionEvent.MembershipsChanged, callback);
    };
  }, [session, callback]);
};
