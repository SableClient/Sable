import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { getCanonicalAliasRoomId, isRoomAlias } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';

type AliasResolutionState = {
  alias: string;
  roomId?: string;
};

export type ResolvedRoomId = {
  roomId?: string;
  resolving: boolean;
};

/** Resolve aliases even when the room is not present in the local sync store yet. */
export const useResolvedRoomIdOrAlias = (roomIdOrAlias?: string): ResolvedRoomId => {
  const mx = useMatrixClient();
  const localRoomId =
    roomIdOrAlias && isRoomAlias(roomIdOrAlias)
      ? getCanonicalAliasRoomId(mx, roomIdOrAlias)
      : roomIdOrAlias;
  const [aliasResolution, setAliasResolution] = useState<AliasResolutionState>();

  useEffect(() => {
    if (!roomIdOrAlias || !isRoomAlias(roomIdOrAlias) || localRoomId) return undefined;
    if (aliasResolution?.alias === roomIdOrAlias) return undefined;

    let cancelled = false;
    void mx
      .getRoomIdForAlias(roomIdOrAlias)
      .then(({ room_id: resolvedRoomId }) => {
        if (!cancelled) setAliasResolution({ alias: roomIdOrAlias, roomId: resolvedRoomId });
      })
      .catch(() => {
        if (!cancelled) setAliasResolution({ alias: roomIdOrAlias });
      });

    return () => {
      cancelled = true;
    };
  }, [aliasResolution?.alias, localRoomId, mx, roomIdOrAlias]);

  if (localRoomId) return { roomId: localRoomId, resolving: false };
  if (!roomIdOrAlias || !isRoomAlias(roomIdOrAlias)) {
    return { roomId: roomIdOrAlias, resolving: false };
  }
  if (aliasResolution?.alias === roomIdOrAlias) {
    return { roomId: aliasResolution.roomId, resolving: false };
  }
  return { resolving: true };
};

export const useResolvedSelectedSpace = (): ResolvedRoomId => {
  const { spaceIdOrAlias: encodedSpaceIdOrAlias } = useParams();
  const spaceIdOrAlias = encodedSpaceIdOrAlias && decodeURIComponent(encodedSpaceIdOrAlias);
  return useResolvedRoomIdOrAlias(spaceIdOrAlias);
};
