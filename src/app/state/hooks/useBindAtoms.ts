import type { MatrixClient } from '$types/matrix-sdk';
import { allInvitesAtom, useBindAllInvitesAtom } from '$state/room-list/inviteList';
import { allRoomsAtom, useBindAllRoomsAtom } from '$state/room-list/roomList';
import { mDirectAtom, useBindMDirectAtom } from '$state/mDirectList';
import { roomToUnreadAtom, useBindRoomToUnreadAtom } from '$state/room/roomToUnread';
import { roomToParentsAtom, useBindRoomToParentsAtom } from '$state/room/roomToParents';
import { roomIdToTypingMembersAtom, useBindRoomIdToTypingMembersAtom } from '$state/typingMembers';

export const useBindAtoms = (mx: MatrixClient) => {
  useBindMDirectAtom(mx, mDirectAtom);
  useBindAllInvitesAtom(mx, allInvitesAtom);
  useBindAllRoomsAtom(mx, allRoomsAtom);
  useBindRoomToParentsAtom(mx, roomToParentsAtom);
  useBindRoomToUnreadAtom(mx, roomToUnreadAtom);

  useBindRoomIdToTypingMembersAtom(mx, roomIdToTypingMembersAtom);
};
