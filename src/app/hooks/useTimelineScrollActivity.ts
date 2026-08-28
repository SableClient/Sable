import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const TimelineScrollingContext = createContext(false);

export const TimelineScrollingProvider = TimelineScrollingContext.Provider;

export const useTimelineScrolling = (): boolean => useContext(TimelineScrollingContext);

export const useScrollActivity = (
  idleDelayMs = 300
): { isScrolling: boolean; notifyScroll: () => void } => {
  const [isScrolling, setIsScrolling] = useState(false);
  const isScrollingRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | undefined>(undefined);

  const notifyScroll = useCallback(() => {
    if (!isScrollingRef.current) {
      isScrollingRef.current = true;
      setIsScrolling(true);
    }
    if (idleTimerRef.current !== undefined) globalThis.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = globalThis.setTimeout(() => {
      idleTimerRef.current = undefined;
      isScrollingRef.current = false;
      setIsScrolling(false);
    }, idleDelayMs);
  }, [idleDelayMs]);

  useEffect(
    () => () => {
      if (idleTimerRef.current !== undefined) globalThis.clearTimeout(idleTimerRef.current);
    },
    []
  );

  return { isScrolling, notifyScroll };
};
