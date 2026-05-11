import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';
import type { RoomJoinRulesEventContent, Room } from '$types/matrix-sdk';
import { RoomEvent, RoomStateEvent, EventType } from '$types/matrix-sdk';

import { mDirectAtom } from '$state/mDirectList';
import { useStateEvent } from './useStateEvent';
import { useNickname } from './useNickname';

export const useRoomAvatar = (room: Room, dm?: boolean): string | undefined => {
  const avatarEvent = useStateEvent(room, EventType.RoomAvatar);

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
  const mDirects = useAtomValue(mDirectAtom);
  const isDmTagged = mDirects.has(room.roomId);
  const [name, setName] = useState(room.name);

  useEffect(() => {
    const updateName = () => {
      if (room.name === 'Empty room') {
        room.recalculate();
      }

      const nextName = isDmTagged && dmNickname ? dmNickname : room.name;
      setName((prev) => (prev !== nextName ? nextName : prev));
    };

    updateName();

    room.on(RoomEvent.Name, updateName);
    room.on(RoomStateEvent.Members, updateName);

    return () => {
      room.removeListener(RoomEvent.Name, updateName);
      room.removeListener(RoomStateEvent.Members, updateName);
    };
  }, [room, dmNickname, isDmTagged]);

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
