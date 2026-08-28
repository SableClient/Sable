import { useCallback, useEffect, useMemo, useRef } from 'react';

export const useObjectURL = (object?: Blob): string | undefined => {
  const url = useMemo(() => {
    if (object) return URL.createObjectURL(object);
    return undefined;
  }, [object]);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url]
  );

  return url;
};

// For blob URLs created inside an async callback, which can resolve after unmount
// with no effect left to revoke them. Passing the pending blob reserves ownership
// so an older request that resolves late cannot replace or revoke the current URL.
export const useCreateObjectURL = (): ((object: Blob | Promise<Blob>) => Promise<string>) => {
  const urlRef = useRef<string | undefined>(undefined);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = undefined;
    };
  }, []);

  return useCallback(async (object: Blob | Promise<Blob>) => {
    const request = ++requestRef.current;
    const resolvedObject = await object;
    const url = URL.createObjectURL(resolvedObject);

    if (!mountedRef.current || request !== requestRef.current) {
      URL.revokeObjectURL(url);
      return url;
    }

    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    return url;
  }, []);
};
