import { useEffect, useState } from 'react';
import type { RoomJoinRulesEventContent, Room } from '$types/matrix-sdk';
import { RoomEvent, RoomStateEvent } from '$types/matrix-sdk';
import { StateEvent } from '$types/matrix/room';
import { useStateEvent } from './useStateEvent';
import { useNickname } from './useNickname';

export const useRoomAvatar = (room: Room, dm?: boolean): string | undefined => {
  const avatarEvent = useStateEvent(room, StateEvent.RoomAvatar);

  if (dm) {
    return room.getAvatarFallbackMember()?.getMxcAvatarUrl();
  }
  const content = avatarEvent?.getContent();
  const avatarMxc = content && typeof content.url === 'string' ? content.url : undefined;

  return avatarMxc;
};

export const useRoomName = (room: Room): string => {
  const dmUserId = room.guessDMUserId();
  const dmNickname = useNickname(dmUserId || '');
  const [name, setName] = useState(room.name);

  useEffect(() => {
    const updateName = () => {
      if (room.name === 'Empty room') {
        room.recalculate();
      }

      // small room = dm i promise trust
      const memberCount = room.getJoinedMemberCount();
      const isSmallRoom = memberCount <= 2;

      const nextName = isSmallRoom && dmNickname ? dmNickname : room.name;
      setName((prev) => (prev !== nextName ? nextName : prev));
    };

    updateName();

    room.on(RoomEvent.Name, updateName);
    room.on(RoomStateEvent.Members, updateName);

    return () => {
      room.removeListener(RoomEvent.Name, updateName);
      room.removeListener(RoomStateEvent.Members, updateName);
    };
  }, [room, dmNickname]);

  return name;
};

export const useRoomTopic = (room: Room): string | undefined => {
  const topicEvent = useStateEvent(room, StateEvent.RoomTopic);

  const content = topicEvent?.getContent();
  const topic = content && typeof content.topic === 'string' ? content.topic : undefined;

  return topic;
};

export const useRoomJoinRule = (room: Room): RoomJoinRulesEventContent | undefined => {
  const mEvent = useStateEvent(room, StateEvent.RoomJoinRules);
  const joinRuleContent = mEvent?.getContent<RoomJoinRulesEventContent>();
  return joinRuleContent;
};
