import { useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { Position, RectCords } from 'folds';
import type { UserProfile } from '$hooks/useUserProfile';
import type { UserRoomProfileState } from '$state/userRoomProfile';
import { userRoomProfileAtom } from '$state/userRoomProfile';

export const useUserRoomProfileState = (): UserRoomProfileState | undefined => {
  const data = useAtomValue(userRoomProfileAtom);
  return data;
};

type CloseCallback = () => void;
export const useCloseUserRoomProfile = (): CloseCallback => {
  const setUserRoomProfile = useSetAtom(userRoomProfileAtom);

  const close: CloseCallback = useCallback(() => {
    setUserRoomProfile(undefined);
  }, [setUserRoomProfile]);

  return close;
};

type OpenCallback = (
  roomId: string,
  spaceId: string | undefined,
  userId: string,
  cords: RectCords,
  position?: Position,
  initialProfile?: Partial<UserProfile>
) => void;

export const useOpenUserRoomProfile = (): OpenCallback => {
  const setUserRoomProfile = useSetAtom(userRoomProfileAtom);

  const open: OpenCallback = useCallback(
    (roomId, spaceId, userId, cords, position, initialProfile) => {
      setUserRoomProfile({
        roomId,
        spaceId,
        userId,
        cords,
        position,
        initialProfile,
      });
    },
    [setUserRoomProfile]
  );

  return open;
};
