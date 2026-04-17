import { useCallback } from 'react';
import { useMatrixClient } from './useMatrixClient';
import type { AsyncState } from './useAsyncCallback';
import { useAsyncCallbackValue } from './useAsyncCallback';
import { useSpecVersions } from './useSpecVersions';

export const useMutualRoomsSupport = (): boolean => {
  const { unstable_features: unstableFeatures } = useSpecVersions();

  const supported =
    unstableFeatures?.['uk.half-shot.msc2666'] ||
    unstableFeatures?.['uk.half-shot.msc2666.mutual_rooms'] ||
    unstableFeatures?.['uk.half-shot.msc2666.query_mutual_rooms'];

  return !!supported;
};

export const useMutualRooms = (userId: string): AsyncState<string[]> => {
  const mx = useMatrixClient();

  const supported = useMutualRoomsSupport();

  const [mutualRoomsState] = useAsyncCallbackValue(
    useCallback(
      () => (supported ? mx._unstable_getSharedRooms(userId) : Promise.resolve([])),
      [mx, userId, supported]
    )
  );

  return mutualRoomsState;
};
