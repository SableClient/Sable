import { useEffect, useState } from 'react';
import type { CachedMediaMetadata } from '$utils/mediaMetadata';
import {
  getMediaMetadata,
  getMediaMetadataSnapshot,
  subscribeMediaMetadata,
} from '$utils/mediaMetadata';

type MediaMetadataState = {
  cacheKey?: string;
  metadata?: CachedMediaMetadata;
};

export function useMediaMetadata(cacheKey: string | undefined): CachedMediaMetadata | undefined {
  const [metadataState, setMetadataState] = useState<MediaMetadataState>(() => ({
    cacheKey,
    metadata: getMediaMetadataSnapshot(cacheKey),
  }));

  useEffect(() => {
    let disposed = false;
    const setCurrentMetadata = (metadata: CachedMediaMetadata | undefined) => {
      setMetadataState({ cacheKey, metadata });
    };
    setCurrentMetadata(getMediaMetadataSnapshot(cacheKey));

    const unsubscribe = subscribeMediaMetadata(cacheKey, (nextMetadata) => {
      if (!disposed) setCurrentMetadata(nextMetadata);
    });

    getMediaMetadata(cacheKey)
      .then((nextMetadata) => {
        if (!disposed) setCurrentMetadata(getMediaMetadataSnapshot(cacheKey) ?? nextMetadata);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [cacheKey]);

  return metadataState.cacheKey === cacheKey ? metadataState.metadata : undefined;
}
