import { useCallback, useEffect, useMemo, useRef } from 'react';

export interface DebounceOptions {
  wait?: number;
  immediate?: boolean;
}
export type DebounceCallback<T extends unknown[]> = (...args: T) => void;
export type DebouncedCallback<T extends unknown[]> = DebounceCallback<T> & {
  cancel: () => void;
};

export function useDebounce<T extends unknown[]>(
  callback: DebounceCallback<T>,
  options?: DebounceOptions
): DebouncedCallback<T> {
  const timeoutIdRef = useRef<number | undefined>(undefined);
  const { wait, immediate } = options ?? {};

  const cancel = useCallback(() => {
    if (timeoutIdRef.current !== undefined) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = undefined;
    }
  }, []);

  const debounceCallback = useCallback(
    (...cbArgs: T) => {
      if (timeoutIdRef.current !== undefined) {
        cancel();
      } else if (immediate) {
        callback(...cbArgs);
      }

      timeoutIdRef.current = window.setTimeout(() => {
        callback(...cbArgs);
        timeoutIdRef.current = undefined;
      }, wait);
    },
    [callback, cancel, wait, immediate]
  );

  useEffect(() => cancel, [cancel]);

  return useMemo(() => Object.assign(debounceCallback, { cancel }), [debounceCallback, cancel]);
}
