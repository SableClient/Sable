import { useMemo } from 'react';
import { ShowRoomIcon } from '$state/settings';

export type MessageLayoutItem = {
  layout?: ShowRoomIcon;
  name: string;
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

export const useShowPerRoomRoomIcon = (): MessageLayoutItem[] =>
  useMemo(
    () => [
      {
        layout: undefined,
        name: 'Default',
      },
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
