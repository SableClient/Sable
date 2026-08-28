import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { fetch } from '$utils/fetch';
import type { SpecVersions } from '../cs-api';
import { specVersions } from '../cs-api';

type SpecVersionsLoaderProps = {
  baseUrl: string;
  loadVersions?: () => Promise<SpecVersions>;
  fallback?: () => ReactNode;
  error?: (err: unknown, retry: () => void, ignore: () => void) => ReactNode;
  children: (versions: SpecVersions) => ReactNode;
};
export function SpecVersionsLoader({
  baseUrl,
  loadVersions,
  fallback,
  error,
  children,
}: SpecVersionsLoaderProps) {
  const [state, load] = useAsyncCallback(
    useCallback(() => loadVersions?.() ?? specVersions(fetch, baseUrl), [baseUrl, loadVersions])
  );
  const [ignoreError, setIgnoreError] = useState(false);

  const ignoreCallback = useCallback(() => setIgnoreError(true), []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === AsyncStatus.Idle || state.status === AsyncStatus.Loading) {
    return fallback?.();
  }

  if (!ignoreError && state.status === AsyncStatus.Error) {
    if (error) return error(state.error, load, ignoreCallback);
  }

  return children(
    state.status === AsyncStatus.Success
      ? state.data
      : {
          versions: [],
        }
  );
}
