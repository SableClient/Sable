import { useEffect, useState } from 'react';
import type { CachedMediaMetadata } from '$utils/mediaMetadata';
import {
  getMediaMetadata,
  getMediaMetadataSnapshot,
  subscribeMediaMetadata,
} from '$utils/mediaMetadata';

export function useMediaMetadata(cacheKey: string | undefined): CachedMediaMetadata | undefined {
  const [metadata, setMetadata] = useState<CachedMediaMetadata | undefined>(() =>
    getMediaMetadataSnapshot(cacheKey)
  );

  useEffect(() => {
    let disposed = false;
    setMetadata(getMediaMetadataSnapshot(cacheKey));

    const unsubscribe = subscribeMediaMetadata(cacheKey, (nextMetadata) => {
      if (!disposed) setMetadata(nextMetadata);
    });

    getMediaMetadata(cacheKey)
      .then((nextMetadata) => {
        if (!disposed) setMetadata(getMediaMetadataSnapshot(cacheKey) ?? nextMetadata);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [cacheKey]);

  return metadata;
}
