import { useMemo } from 'react';

import type { PermissionGroup } from '$features/common-settings/permissions';
import { EventType } from '$types/matrix-sdk';
import { CustomStateEvent } from '$types/matrix/room';

export const usePermissionGroups = (): PermissionGroup[] => {
  const groups: PermissionGroup[] = useMemo(() => {
    const messagesGroup: PermissionGroup = {
      name: 'Manage',
      items: [
        {
          location: {
            state: true,
            key: EventType.SpaceChild,
          },
          name: 'Manage space rooms',
        },
        {
          location: {},
          name: 'Message Events',
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
      ],
    };

    const roomOverviewGroup: PermissionGroup = {
      name: 'Space Overview',
      items: [
        {
          location: {
            state: true,
            key: EventType.RoomAvatar,
          },
          name: 'Space Avatar',
        },
        {
          location: {
            state: true,
            key: EventType.RoomName,
          },
          name: 'Space Name',
        },
        {
          location: {
            state: true,
            key: EventType.RoomTopic,
          },
          name: 'Space Topic',
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
          name: 'Change Space Access',
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
            key: EventType.RoomTombstone,
          },
          name: 'Upgrade Space',
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
      ],
    };

    return [
      messagesGroup,
      moderationGroup,
      roomOverviewGroup,
      roomSettingsGroup,
      otherSettingsGroup,
    ];
  }, []);

  return groups;
};
