import { atom } from 'jotai';
import type { MatrixClient } from '$types/matrix-sdk';
import { useMemo } from 'react';

import type { RoomsAction } from './utils';
import { applyRoomsAction, useBindRoomsWithMembershipsAtom } from './utils';
import { KnownMembership } from '$types/matrix-sdk';

const baseRoomsAtom = atom<string[]>([]);
export const allRoomsAtom = atom<string[], [RoomsAction], undefined>(
  (get) => get(baseRoomsAtom),
  (_get, set, action) => {
    set(baseRoomsAtom, (ids) => applyRoomsAction(ids, action));
    return undefined;
  }
);
export const useBindAllRoomsAtom = (mx: MatrixClient, allRooms: typeof allRoomsAtom) => {
  useBindRoomsWithMembershipsAtom(
    mx,
    allRooms,
    useMemo(() => [KnownMembership.Join], [])
  );
};
