import type { Room } from '$types/matrix-sdk';
import { MatrixRTCSession, MatrixRTCSessionEvent } from '$types/matrix-sdk';
import type { CallMembership } from '$types/matrix-sdk';
import { useEffect, useMemo, useState } from 'react';
import { useMatrixClient } from './useMatrixClient';
import { useActiveRTCSessionIds } from './useMatrixRTCSession';

export const useCallSession = (room: Room): MatrixRTCSession => {
  const mx = useMatrixClient();
  const activeRoomIds = useActiveRTCSessionIds();
  // Re-derive the session whenever the active-session set changes. The returned
  // session object is stable across renders unless the set changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => mx.matrixRTC.getRoomSession(room), [mx, room, activeRoomIds]);
};

export const useCallMembers = (room: Room, session: MatrixRTCSession): CallMembership[] => {
  const [memberships, setMemberships] = useState<CallMembership[]>([]);

  useEffect(() => {
    const updateMemberships = () => {
      MatrixRTCSession.sessionMembershipsForSlot(room, session.slotDescription).then(
        setMemberships
      );
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
