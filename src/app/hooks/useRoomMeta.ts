import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';
import type { MatrixEvent, RoomJoinRulesEventContent, Room } from '$types/matrix-sdk';
import { RoomEvent, RoomStateEvent, EventType } from '$types/matrix-sdk';

import { mDirectAtom } from '$state/mDirectList';
import { getDmOtherMember, getMemberDisplayName } from '$utils/room/display';
import { useMatrixClient } from './useMatrixClient';
import { useStateEvent } from './useStateEvent';
import { useNickname } from './useNickname';

// Sliding sync's ensureNameEvent injects the server-computed room name with this
// fake event id; it counts bridge bots, so DMs rank it below the member name.
const isServerGeneratedRoomName = (event?: MatrixEvent): boolean =>
  event?.getId()?.startsWith('$fake-sliding-sync-name-event-') === true;

const getRoomDisplayName = (
  roomName: string,
  stateName: unknown,
  stateNameIsServerGenerated: boolean,
  isDmTagged: boolean,
  dmNickname?: string,
  dmOtherMemberName?: string
): string => {
  if (isDmTagged && dmNickname) return dmNickname;
  if (typeof stateName === 'string' && stateName && !stateNameIsServerGenerated) return stateName;
  if (isDmTagged && dmOtherMemberName) return dmOtherMemberName;
  return roomName;
};

export const useRoomAvatar = (room: Room, dm?: boolean): string | undefined => {
  const avatarEvent = useStateEvent(room, EventType.RoomAvatar);
  const [, refreshDmAvatar] = useState(0);

  useEffect(() => {
    if (!dm) return undefined;

    const updateAvatar = () => refreshDmAvatar((version) => version + 1);
    room.on(RoomStateEvent.Members, updateAvatar);

    return () => {
      room.removeListener(RoomStateEvent.Members, updateAvatar);
    };
  }, [room, dm]);

  if (dm) {
    return room.getAvatarFallbackMember()?.getMxcAvatarUrl();
  }
  const content = avatarEvent?.getContent();
  const avatarMxc = content && typeof content.url === 'string' ? content.url : undefined;

  return avatarMxc;
};

export const useRoomName = (room: Room): string => {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const isDmTagged = mDirects.has(room.roomId);
  const dmUserId = room.guessDMUserId();
  const dmNickname = useNickname(dmUserId || '');
  const nameEvent = useStateEvent(room, EventType.RoomName);
  const stateName = nameEvent?.getContent().name;
  const stateNameIsServerGenerated = isServerGeneratedRoomName(nameEvent);
  const [name, setName] = useState(room.name);

  useEffect(() => {
    const updateName = () => {
      if (isDmTagged || room.name === 'Empty room') {
        room.recalculate();
      }

      const otherMember = isDmTagged ? getDmOtherMember(mx, room) : undefined;
      const dmOtherMemberName = otherMember
        ? (getMemberDisplayName(room, otherMember.userId) ?? otherMember.rawDisplayName)
        : undefined;

      const nextName = getRoomDisplayName(
        room.name,
        stateName,
        stateNameIsServerGenerated,
        isDmTagged,
        dmNickname,
        dmOtherMemberName
      );
      setName((prev) => (prev !== nextName ? nextName : prev));
    };

    updateName();

    room.on(RoomEvent.Name, updateName);
    room.on(RoomStateEvent.Members, updateName);

    return () => {
      room.removeListener(RoomEvent.Name, updateName);
      room.removeListener(RoomStateEvent.Members, updateName);
    };
  }, [room, mx, stateName, stateNameIsServerGenerated, dmNickname, isDmTagged]);

  return name;
};

export const useRoomTopic = (room: Room): string | undefined => {
  const topicEvent = useStateEvent(room, EventType.RoomTopic);

  const content = topicEvent?.getContent();
  const topic = content && typeof content.topic === 'string' ? content.topic : undefined;

  return topic;
};

export const useRoomJoinRule = (room: Room): RoomJoinRulesEventContent | undefined => {
  const mEvent = useStateEvent(room, EventType.RoomJoinRules);
  const joinRuleContent = mEvent?.getContent<RoomJoinRulesEventContent>();
  return joinRuleContent;
};
