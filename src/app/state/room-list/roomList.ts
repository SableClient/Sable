import { atom } from 'jotai';
import type { MatrixClient } from '$types/matrix-sdk';
import { useMemo } from 'react';

import type { RoomsAction } from './utils';
import { useBindRoomsWithMembershipsAtom } from './utils';
import { KnownMembership } from '$types/matrix-sdk';

const baseRoomsAtom = atom<string[]>([]);
export const allRoomsAtom = atom<string[], [RoomsAction], undefined>(
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
export const useBindAllRoomsAtom = (mx: MatrixClient, allRooms: typeof allRoomsAtom) => {
  useBindRoomsWithMembershipsAtom(
    mx,
    allRooms,
    useMemo(() => [KnownMembership.Join], [])
  );
};
