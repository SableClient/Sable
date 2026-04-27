import { useCallback, useEffect, useRef } from 'react';

export const useAlive = (): (() => boolean) => {
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const alive = useCallback(() => aliveRef.current, []);
  return alive;
};
