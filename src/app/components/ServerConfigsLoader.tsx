import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import type { Capabilities, ValidatedAuthMetadata } from '$types/matrix-sdk';
import { validateAuthMetadata } from '$types/matrix-sdk';
import { AsyncStatus, useAsyncCallbackValue } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { MediaConfig } from '$hooks/useMediaConfig';
import { promiseFulfilledResult } from '$utils/common';
import { createLogger } from '$utils/debug';

export type ServerConfigs = {
  capabilities?: Capabilities;
  mediaConfig?: MediaConfig;
  authMetadata?: ValidatedAuthMetadata;
};

type ServerConfigsLoaderProps = {
  children: (configs: ServerConfigs) => ReactNode;
};

const log = createLogger('ServerConfigsLoader');

export function ServerConfigsLoader({ children }: ServerConfigsLoaderProps) {
  const mx = useMatrixClient();
  const fallbackConfigs = useMemo(() => ({}), []);

  const [configsState] = useAsyncCallbackValue<ServerConfigs, unknown>(
    useCallback(async () => {
      const result = await Promise.allSettled([
        mx.getCapabilities(),
        mx.getMediaConfig(),
        mx.getAuthMetadata(),
      ]);

      const capabilities = promiseFulfilledResult(result[0]);
      const mediaConfig = promiseFulfilledResult(result[1]);
      const authMetadata = promiseFulfilledResult(result[2]);
      let validatedAuthMetadata: ValidatedAuthMetadata | undefined;

      try {
        validatedAuthMetadata = validateAuthMetadata(authMetadata);
      } catch (e) {
        log.error('Failed to validate auth metadata:', e);
      }

      return {
        capabilities,
        mediaConfig,
        authMetadata: validatedAuthMetadata,
      };
    }, [mx])
  );

  const configs: ServerConfigs =
    configsState.status === AsyncStatus.Success ? configsState.data : fallbackConfigs;

  return children(configs);
}
