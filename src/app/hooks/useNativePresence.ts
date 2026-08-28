import { useEffect, useRef, useState } from 'react';

export type NativePresencePhase = 'idle' | 'enter' | 'exit';

/** Keeps the previous value mounted while its CSS exit animation completes. */
export function useNativePresence<T>(
  value: T | null | undefined,
  key: string | undefined,
  exitDurationMs: number
) {
  const [displayed, setDisplayed] = useState<T | undefined>(value ?? undefined);
  const [phase, setPhase] = useState<NativePresencePhase>(value ? 'enter' : 'idle');
  const displayedRef = useRef<T | undefined>(value ?? undefined);
  const displayedKeyRef = useRef(key);
  const phaseRef = useRef(phase);

  useEffect(() => {
    const current = displayedRef.current;

    if (value === null || value === undefined) {
      if (current === undefined) return undefined;

      phaseRef.current = 'exit';
      setPhase('exit');
      const timer = window.setTimeout(() => {
        displayedRef.current = undefined;
        displayedKeyRef.current = undefined;
        phaseRef.current = 'idle';
        setDisplayed(undefined);
        setPhase('idle');
      }, exitDurationMs);
      return () => window.clearTimeout(timer);
    }

    if (current === undefined) {
      displayedRef.current = value;
      displayedKeyRef.current = key;
      phaseRef.current = 'enter';
      setDisplayed(value);
      setPhase('enter');
      return undefined;
    }

    if (displayedKeyRef.current !== key) {
      phaseRef.current = 'exit';
      setPhase('exit');
      const timer = window.setTimeout(() => {
        displayedRef.current = value;
        displayedKeyRef.current = key;
        phaseRef.current = 'enter';
        setDisplayed(value);
        setPhase('enter');
      }, exitDurationMs);
      return () => window.clearTimeout(timer);
    }

    displayedRef.current = value;
    if (phaseRef.current === 'exit') {
      phaseRef.current = 'enter';
      setPhase('enter');
    }
    setDisplayed(value);
    return undefined;
  }, [exitDurationMs, key, value]);

  return { displayed, phase };
}
