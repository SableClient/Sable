import { MatrixClient } from '$types/matrix-sdk';
import { getCanonicalAliasOrRoomId } from '$utils/matrix';

function resolveRoomId(mx: MatrixClient, roomIdOrAlias: string): string | undefined {
  if (roomIdOrAlias.startsWith('!')) return roomIdOrAlias;
  return mx.getRooms().find((r) => getCanonicalAliasOrRoomId(mx, r.roomId) === roomIdOrAlias)
    ?.roomId;
}

export function resolveSwipeTargetRoom(
  mx: MatrixClient,
  validRoomIds: Set<string>,
  ...candidates: (string | undefined)[]
): string | undefined {
  return candidates.reduce<string | undefined>((found, candidate) => {
    if (found) return found;
    if (!candidate) return undefined;
    const roomId = resolveRoomId(mx, candidate);
    return roomId && validRoomIds.has(roomId) ? roomId : undefined;
  }, undefined);
}
