import { useMatch, useParams } from 'react-router-dom';
import { getCanonicalAliasRoomId, isRoomAlias } from '$utils/matrix';
import { getSpaceLobbyPath, getSpaceSearchPath } from '$pages/pathUtils';
import { useMatrixClient } from '$hooks/useMatrixClient';

const DECODED_SPACE_PARAM_CACHE_MAX = 128;
const decodedSpaceParamCache = new Map<string, string>();

export const decodeSpaceIdOrAlias = (encoded?: string): string | undefined => {
  if (!encoded) return undefined;

  const cached = decodedSpaceParamCache.get(encoded);
  if (cached !== undefined) return cached;

  const decoded = decodeURIComponent(encoded);
  decodedSpaceParamCache.set(encoded, decoded);

  if (decodedSpaceParamCache.size > DECODED_SPACE_PARAM_CACHE_MAX) {
    const firstKey = decodedSpaceParamCache.keys().next().value;
    if (firstKey !== undefined) {
      decodedSpaceParamCache.delete(firstKey);
    }
  }

  return decoded;
};

export const useSelectedSpace = (): string | undefined => {
  const mx = useMatrixClient();

  const { spaceIdOrAlias: encodedSpaceIdOrAlias } = useParams();
  const spaceIdOrAlias = decodeSpaceIdOrAlias(encodedSpaceIdOrAlias);

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
