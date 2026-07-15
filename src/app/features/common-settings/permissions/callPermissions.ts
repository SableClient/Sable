import { EventType } from '$types/matrix-sdk';

import type { PermissionGroup } from './types';

export const CALL_PERMISSIONS_GROUP: PermissionGroup = {
  name: 'Calls',
  items: [
    {
      location: [
        {
          state: true,
          key: EventType.GroupCallPrefix,
        },
        {
          state: true,
          key: EventType.GroupCallMemberPrefix,
        },
      ],
      name: 'Start & Join Calls',
      description: 'Who can start and join voice and video calls.',
    },
  ],
};
