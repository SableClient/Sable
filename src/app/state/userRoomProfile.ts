import type { Position, RectCords } from 'folds';
import { atom } from 'jotai';
import type { UserProfile } from '$hooks/useUserProfile';
import type { Persona } from '$app/persona';

export type UserRoomProfileState = {
  userId: string;
  roomId: string;
  spaceId?: string;
  pmp?: Persona;
  cords: RectCords;
  position?: Position;
  initialProfile?: Partial<UserProfile>;
};

export const userRoomProfileAtom = atom<UserRoomProfileState | undefined>(undefined);

export const profilesCacheAtom = atom<Record<string, UserProfile>>({});

export const persistentProfileIdsAtom = atom<Set<string>>(new Set<string>());
