import { useCallback } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import { Method } from '$types/matrix-sdk';
import { useMatrixClient } from './useMatrixClient';
import type { AsyncState } from './useAsyncCallback';
import { useAsyncCallbackValue } from './useAsyncCallback';
import { useSpecVersions } from './useSpecVersions';

export const useUnstableMutualRoomsSupport = (): boolean => {
  const { unstable_features: unstableFeatures } = useSpecVersions();

  const supported =
    unstableFeatures?.['uk.half-shot.msc2666'] ||
    unstableFeatures?.['uk.half-shot.msc2666.mutual_rooms'] ||
    unstableFeatures?.['uk.half-shot.msc2666.query_mutual_rooms'];

  return !!supported;
};

// Mutual rooms detection and fetching ported from Cinny
// Original by ajbura here https://github.com/cinnyapp/cinny/commit/bef267257a28b3be8a96852fed1718f63cf570f9
export const useMutualRoomsSupport = (): boolean => {
  const { unstable_features: unstableFeatures, versions } = useSpecVersions();

  const supported =
    versions.includes('v1.19') ||
    !!unstableFeatures?.['uk.half-shot.msc2666.query_mutual_rooms.stable'];

  return supported;
};

type MutualRoomsOK = {
  joined: string[];
  next_batch?: string;
  count: number;
};

const fetchAllMutualRooms = async (mx: MatrixClient, userId: string): Promise<string[]> => {
  const mutualRooms: Set<string> = new Set();

  const collectFrom = async (nextBatch?: string): Promise<void> => {
    const result = await mx.http.authedRequest<MutualRoomsOK>(
      Method.Get,
      '/mutual_rooms',
      {
        user_id: userId,
        from: nextBatch,
      },
      undefined,
      {
        prefix: '/_matrix/client/v1',
      }
    );
    result.joined.forEach((r) => mutualRooms.add(r));
    if (typeof result.next_batch === 'string') {
      await collectFrom(result.next_batch);
    }
  };

  await collectFrom();
  return Array.from(mutualRooms);
};

export const useMutualRooms = (userId: string): AsyncState<string[]> => {
  const mx = useMatrixClient();

  const unstableSupport = useUnstableMutualRoomsSupport();
  const support = useMutualRoomsSupport();

  const [mutualRoomsState] = useAsyncCallbackValue(
    useCallback(() => {
      if (support) return fetchAllMutualRooms(mx, userId);
      if (unstableSupport) return mx._unstable_getSharedRooms(userId);
      return Promise.resolve([]);
    }, [mx, userId, unstableSupport, support])
  );

  return mutualRoomsState;
};
