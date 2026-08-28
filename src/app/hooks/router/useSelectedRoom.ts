import { useMemo } from 'react';
import { atom, useAtomValue } from 'jotai';
import { matchPath, useLocation, useParams } from 'react-router';
import { getCanonicalAliasRoomId, isRoomAlias } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { resolveSection } from '$pages/pathUtils';
import { lastVisitedRoomSectionAtom } from '$state/room/lastRoom';

export const useSelectedRoom = (): string | undefined => {
  const mx = useMatrixClient();

  const { roomIdOrAlias: encodedRoomIdOrAlias } = useParams();
  const roomIdOrAlias = encodedRoomIdOrAlias && decodeURIComponent(encodedRoomIdOrAlias);
  const roomId =
    roomIdOrAlias && isRoomAlias(roomIdOrAlias)
      ? getCanonicalAliasRoomId(mx, roomIdOrAlias)
      : roomIdOrAlias;

  return roomId;
};

const emptyLastRoomAtom = atom<string | undefined>(undefined);

export const useSelectedOrLastRoom = (): string | undefined => {
  const selectedRoomId = useSelectedRoom();
  const location = useLocation();

  const section = resolveSection(location.pathname);
  const listMatch = section && matchPath({ path: section.listPath, end: true }, location.pathname);

  const sectionKey = section?.key;
  const sectionAtom = useMemo(
    () => (sectionKey ? lastVisitedRoomSectionAtom(sectionKey) : emptyLastRoomAtom),
    [sectionKey]
  );
  const lastRoomId = useAtomValue(sectionAtom);

  if (selectedRoomId) return selectedRoomId;

  return listMatch ? lastRoomId : undefined;
};
