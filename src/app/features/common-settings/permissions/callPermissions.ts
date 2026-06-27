import { EventType } from '$types/matrix-sdk';

import type { PermissionGroup } from './types';

export const CALL_PERMISSIONS_GROUP: PermissionGroup = {
  name: 'Calls',
  items: [
    {
      location: {
        state: true,
        key: EventType.GroupCallPrefix,
      },
      name: 'Start Group Calls',
      description: 'Who can start new voice and video group calls.',
    },
    {
      location: {
        state: true,
        key: EventType.GroupCallMemberPrefix,
      },
      name: 'Join Group Calls',
      description: 'Who can join active voice and video group calls.',
    },
    {
      location: {
        key: EventType.CallInvite,
      },
      name: 'Direct Calls',
      description: 'Who can start direct 1:1 calls.',
    },
  ],
};
