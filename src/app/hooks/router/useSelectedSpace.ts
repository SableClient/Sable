import { useMatch, useParams } from 'react-router';
import { getCanonicalAliasRoomId, isRoomAlias } from '$utils/matrix';
import { getSpaceLobbyPath, getSpaceSearchPath } from '$pages/pathUtils';
import { useMatrixClient } from '$hooks/useMatrixClient';

export const useSelectedSpace = (): string | undefined => {
  const mx = useMatrixClient();

  const { spaceIdOrAlias: encodedSpaceIdOrAlias } = useParams();
  const spaceIdOrAlias = encodedSpaceIdOrAlias && decodeURIComponent(encodedSpaceIdOrAlias);

  const spaceId =
    spaceIdOrAlias && isRoomAlias(spaceIdOrAlias)
      ? getCanonicalAliasRoomId(mx, spaceIdOrAlias)
      : spaceIdOrAlias;

  return spaceId;
};

export const useSpaceLobbySelected = (spaceIdOrAlias: string): boolean => {
  const match = useMatch({
    path: decodeURIComponent(getSpaceLobbyPath(spaceIdOrAlias)),
    caseSensitive: true,
    end: false,
  });

  return !!match;
};

export const useSpaceSearchSelected = (spaceIdOrAlias: string): boolean => {
  const match = useMatch({
    path: decodeURIComponent(getSpaceSearchPath(spaceIdOrAlias)),
    caseSensitive: true,
    end: false,
  });

  return !!match;
};
