import { useMemo } from 'react';
import { ShowRoomIcon } from '$state/settings';

export type MessageLayoutItem = {
  name: string;
  layout: ShowRoomIcon;
};

export const useShowRoomIcon = (): MessageLayoutItem[] =>
  useMemo(
    () => [
      {
        layout: ShowRoomIcon.Always,
        name: 'Always',
      },
      {
        layout: ShowRoomIcon.Smart,
        name: 'Smart',
      },
      {
        layout: ShowRoomIcon.Never,
        name: 'Never',
      },
    ],
    []
  );
