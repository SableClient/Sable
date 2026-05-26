import { createContext, useContext, type ReactNode } from 'react';
import { useMediaUrlCache } from './useMediaUrlCache';

type MediaUrlCacheContextType = ReturnType<typeof useMediaUrlCache>;

const MediaUrlCacheContext = createContext<MediaUrlCacheContextType | null>(null);

export const MediaUrlCacheProvider = ({ children }: { children: ReactNode }) => {
  const cache = useMediaUrlCache();
  return <MediaUrlCacheContext.Provider value={cache}>{children}</MediaUrlCacheContext.Provider>;
};

export const useMediaUrlCacheContext = (): MediaUrlCacheContextType => {
  const cache = useContext(MediaUrlCacheContext);
  if (!cache) {
    throw new Error('useMediaUrlCacheContext must be used within MediaUrlCacheProvider');
  }
  return cache;
};
