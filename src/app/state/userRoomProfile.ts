import type { Position, RectCords } from 'folds';
import { atom } from 'jotai';
import type { UserProfile } from '$hooks/useUserProfile';

export type UserRoomProfileState = {
  userId: string;
  roomId: string;
  spaceId?: string;
  cords: RectCords;
  position?: Position;
  initialProfile?: Partial<UserProfile>;
};

export const userRoomProfileAtom = atom<UserRoomProfileState | undefined>(undefined);

export const profilesCacheAtom = atom<Record<string, UserProfile>>({});
