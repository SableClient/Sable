import { EventType, JoinRule } from 'matrix-js-sdk';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import { getStateEvents } from './room';

/**
 * simple check to see if a room can be considered private
 *
 * @export
 * @param {MatrixClient} mx the matrix client
 * @param {Room} room the room to check
 * @return {*}  {boolean} true if the room is considered private
 */
export function isRoomPrivate(mx: MatrixClient, room: Room): boolean {
  // detect if it's a public room or not
  const joinRule = room.getJoinRule() ?? JoinRule.Invite;

  const parentSpaceIds = getStateEvents(room, EventType.SpaceParent)
    .map((e) => e.getStateKey())
    .filter((id): id is string => Boolean(id));
  const isInPublicSpace = parentSpaceIds.some((spaceId) => {
    const space = mx.getRoom(spaceId);
    return Boolean(space?.isSpaceRoom()) && space?.getJoinRule() === JoinRule.Public;
  });

  return (
    joinRule === JoinRule.Invite ||
    (joinRule === JoinRule.Restricted && !isInPublicSpace) ||
    (joinRule !== JoinRule.Public &&
      joinRule !== JoinRule.Knock &&
      joinRule !== JoinRule.Restricted)
  );
}
