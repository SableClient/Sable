import { useMemo } from 'react';

import type { PermissionGroup } from '$features/common-settings/permissions';
import { EventType } from '$types/matrix-sdk';
import { CustomStateEvent } from '$types/matrix/room';

export const usePermissionGroups = (isCallRoom: boolean): PermissionGroup[] => {
  const groups: PermissionGroup[] = useMemo(() => {
    const messagesGroup: PermissionGroup = {
      name: 'Messages',
      items: [
        {
          location: {
            key: EventType.RoomMessage,
          },
          name: 'Send Messages',
        },
        {
          location: {
            key: EventType.Sticker,
          },
          name: 'Send Stickers',
        },
        {
          location: {
            key: EventType.Reaction,
          },
          name: 'Send Reactions',
        },
        {
          location: {
            notification: true,
            key: 'room',
          },
          name: 'Ping @room',
        },
        {
          location: {
            state: true,
            key: EventType.RoomPinnedEvents,
          },
          name: 'Pin Messages',
        },
        {
          location: {},
          name: 'Other Message Events',
        },
      ],
    };

    const callSettingsGroup: PermissionGroup = {
      name: 'Calls',
      items: [
        {
          location: {
            state: true,
            key: EventType.GroupCallMemberPrefix,
          },
          name: 'Join Call',
        },
      ],
    };

    const moderationGroup: PermissionGroup = {
      name: 'Moderation',
      items: [
        {
          location: {
            action: true,
            key: 'invite',
          },
          name: 'Invite',
        },
        {
          location: {
            action: true,
            key: 'kick',
          },
          name: 'Kick',
        },
        {
          location: {
            action: true,
            key: 'ban',
          },
          name: 'Ban',
        },
        {
          location: {
            action: true,
            key: 'redact',
          },
          name: 'Delete Others Messages',
        },
        {
          location: {
            key: EventType.RoomRedaction,
          },
          name: 'Delete Self Messages',
        },
      ],
    };

    const roomOverviewGroup: PermissionGroup = {
      name: 'Room Overview',
      items: [
        {
          location: {
            state: true,
            key: EventType.RoomAvatar,
          },
          name: 'Room Avatar',
        },
        {
          location: {
            state: true,
            key: EventType.RoomName,
          },
          name: 'Room Name',
        },
        {
          location: {
            state: true,
            key: EventType.RoomTopic,
          },
          name: 'Room Topic',
        },
      ],
    };

    const roomSettingsGroup: PermissionGroup = {
      name: 'Settings',
      items: [
        {
          location: {
            state: true,
            key: EventType.RoomJoinRules,
          },
          name: 'Change Room Access',
        },
        {
          location: {
            state: true,
            key: EventType.RoomCanonicalAlias,
          },
          name: 'Publish Address',
        },
        {
          location: {
            state: true,
            key: EventType.RoomPowerLevels,
          },
          name: 'Change All Permission',
        },
        {
          location: {
            state: true,
            key: CustomStateEvent.PowerLevelTags,
          },
          name: 'Edit Power Levels',
        },
        {
          location: {
            state: true,
            key: EventType.RoomEncryption,
          },
          name: 'Enable Encryption',
        },
        {
          location: {
            state: true,
            key: EventType.RoomHistoryVisibility,
          },
          name: 'History Visibility',
        },
        {
          location: {
            state: true,
            key: EventType.RoomTombstone,
          },
          name: 'Upgrade Room',
        },
        {
          location: {
            state: true,
          },
          name: 'Other Settings',
        },
      ],
    };

    const otherSettingsGroup: PermissionGroup = {
      name: 'Other',
      items: [
        {
          location: {
            state: true,
            key: CustomStateEvent.PoniesRoomEmotes,
          },
          name: 'Manage Emojis & Stickers',
        },
        {
          location: {
            state: true,
            key: EventType.RoomServerAcl,
          },
          name: 'Change Server ACLs',
        },
        {
          location: {
            state: true,
            key: 'im.vector.modular.widgets',
          },
          name: 'Modify Widgets',
        },
      ],
    };

    return [
      messagesGroup,
      ...(isCallRoom ? [callSettingsGroup] : []),
      moderationGroup,
      roomOverviewGroup,
      roomSettingsGroup,
      otherSettingsGroup,
    ];
  }, [isCallRoom]);

  return groups;
};
