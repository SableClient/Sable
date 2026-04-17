import type { WritableAtom } from 'jotai';
import { atom } from 'jotai';
import type { MatrixClient } from '$types/matrix-sdk';
import { useMemo } from 'react';
import { Membership } from '$types/matrix/room';
import type { RoomsAction } from './utils';
import { useBindRoomsWithMembershipsAtom } from './utils';

const baseRoomsAtom = atom<string[]>([]);
export const allInvitesAtom = atom<string[], [RoomsAction], undefined>(
  (get) => get(baseRoomsAtom),
  (get, set, action) => {
    if (action.type === 'INITIALIZE') {
      set(baseRoomsAtom, action.rooms);
      return;
    }
    set(baseRoomsAtom, (ids) => {
      const newIds = ids.filter((id) => id !== action.roomId);
      if (action.type === 'PUT') newIds.push(action.roomId);
      return newIds;
    });
  }
);

export const useBindAllInvitesAtom = (
  mx: MatrixClient,
  allRooms: WritableAtom<string[], [RoomsAction], undefined>
) => {
  useBindRoomsWithMembershipsAtom(
    mx,
    allRooms,
    useMemo(() => [Membership.Invite], [])
  );
};
