import type { ReactElement, ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { MatrixRTCSessionManagerEvents } from '$types/matrix-sdk';
import { useMatrixClient } from './useMatrixClient';

/**
 * The set of room IDs that currently have an active MatrixRTC session.
 * Updated by a single global subscription to `mx.matrixRTC`, so N consumers
 * share one listener pair instead of each adding their own (which exceeded
 * Node's default EventEmitter limit of 10 when 11+ rooms were visible).
 */
type ActiveRTCSessionIds = ReadonlySet<string>;

const MatrixRTCSessionContext = createContext<ActiveRTCSessionIds>(new Set());

export function MatrixRTCSessionProvider({ children }: { children: ReactNode }): ReactElement {
  const mx = useMatrixClient();
  const [activeRoomIds, setActiveRoomIds] = useState<ActiveRTCSessionIds>(new Set());

  useEffect(() => {
    const handleStart = (roomId: string) => {
      setActiveRoomIds((prev) => {
        if (prev.has(roomId)) return prev;
        const next = new Set(prev);
        next.add(roomId);
        return next;
      });
    };
    const handleEnd = (roomId: string) => {
      setActiveRoomIds((prev) => {
        if (!prev.has(roomId)) return prev;
        const next = new Set(prev);
        next.delete(roomId);
        return next;
      });
    };

    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, handleStart);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, handleEnd);

    return () => {
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, handleStart);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, handleEnd);
    };
  }, [mx]);

  return (
    <MatrixRTCSessionContext.Provider value={activeRoomIds}>
      {children}
    </MatrixRTCSessionContext.Provider>
  );
}

/**
 * Returns the set of room IDs that currently have an active MatrixRTC session.
 * Backed by a single global subscription (see MatrixRTCSessionProvider).
 */
export function useActiveRTCSessionIds(): ActiveRTCSessionIds {
  return useContext(MatrixRTCSessionContext);
}
