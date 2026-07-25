import type { ReactNode } from 'react';
import { useCallback } from 'react';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { useQuery } from '@tanstack/react-query';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { LocalRoomSummary } from '$hooks/useLocalRoomSummary';
import { useLocalRoomSummary } from '$hooks/useLocalRoomSummary';

type IRoomSummary = Awaited<ReturnType<MatrixClient['getRoomSummary']>>;

type RoomSummaryLoaderProps = {
  roomIdOrAlias: string;
  children: (roomSummary?: IRoomSummary) => ReactNode;
};

export function RoomSummaryLoader({ roomIdOrAlias, children }: RoomSummaryLoaderProps) {
  const mx = useMatrixClient();

  const fetchSummary = useCallback(() => mx.getRoomSummary(roomIdOrAlias), [mx, roomIdOrAlias]);

  const { data } = useQuery({
    queryKey: [roomIdOrAlias, `summary`],
    queryFn: fetchSummary,
  });

  return children(data);
}

export function LocalRoomSummaryLoader({
  room,
  children,
}: {
  room: Room;
  children: (roomSummary: LocalRoomSummary) => ReactNode;
}) {
  const summary = useLocalRoomSummary(room);

  return children(summary);
}
