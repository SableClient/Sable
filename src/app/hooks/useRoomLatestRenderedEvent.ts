/* oxlint-disable no-continue */
import type { MatrixEvent, Room, RoomEventHandlerMap } from '$types/matrix-sdk';
import { RoomEvent } from '$types/matrix-sdk';
import { useEffect, useState } from 'react';
import { MessageEvent, StateEvent } from '$types/matrix/room';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { isMembershipChanged, reactionOrEditEvent } from '$utils/room';

export const useRoomLatestRenderedEvent = (room: Room) => {
  const [hideMembershipEvents] = useSetting(settingsAtom, 'hideMembershipEvents');
  const [hideNickAvatarEvents] = useSetting(settingsAtom, 'hideNickAvatarEvents');
  const [showHiddenEvents] = useSetting(settingsAtom, 'showHiddenEvents');
  const [latestEvent, setLatestEvent] = useState<MatrixEvent>();

  useEffect(() => {
    const getLatestEvent = (): MatrixEvent | undefined => {
      const liveEvents = room.getLiveTimeline().getEvents();
      for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
        const evt = liveEvents[i];

        if (!evt) continue;
        if (reactionOrEditEvent(evt)) continue;
        if (evt.getType() === (StateEvent.RoomMember as string)) {
          const membershipChanged = isMembershipChanged(evt);
          if (membershipChanged && hideMembershipEvents) continue;
          if (!membershipChanged && hideNickAvatarEvents) continue;
          return evt;
        }

        if (
          evt.getType() === (MessageEvent.RoomMessage as string) ||
          evt.getType() === (MessageEvent.RoomMessageEncrypted as string) ||
          evt.getType() === (MessageEvent.Sticker as string) ||
          evt.getType() === (StateEvent.RoomName as string) ||
          evt.getType() === (StateEvent.RoomTopic as string) ||
          evt.getType() === (StateEvent.RoomAvatar as string)
        ) {
          return evt;
        }

        if (showHiddenEvents) return evt;
      }
      return undefined;
    };

    const handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = () => {
      setLatestEvent(getLatestEvent());
    };
    setLatestEvent(getLatestEvent());

    room.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      room.removeListener(RoomEvent.Timeline, handleTimelineEvent);
    };
  }, [room, hideMembershipEvents, hideNickAvatarEvents, showHiddenEvents]);

  return latestEvent;
};
