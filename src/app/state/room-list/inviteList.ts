import type { WritableAtom } from 'jotai';
import { atom } from 'jotai';
import type { MatrixClient } from '$types/matrix-sdk';
import { useMemo } from 'react';

import type { RoomsAction } from './utils';
import { applyRoomsAction, useBindRoomsWithMembershipsAtom } from './utils';
import { KnownMembership } from '$types/matrix-sdk';

const baseRoomsAtom = atom<string[]>([]);
export const allInvitesAtom = atom<string[], [RoomsAction], undefined>(
  (get) => get(baseRoomsAtom),
  (_get, set, action) => {
    set(baseRoomsAtom, (ids) => applyRoomsAction(ids, action));
    return undefined;
  }
);

export const useBindAllInvitesAtom = (
  mx: MatrixClient,
  allRooms: WritableAtom<string[], [RoomsAction], undefined>
) => {
  useBindRoomsWithMembershipsAtom(
    mx,
    allRooms,
    useMemo(() => [KnownMembership.Invite], [])
  );
};
