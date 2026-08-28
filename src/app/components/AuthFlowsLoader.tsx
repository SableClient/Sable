import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import type { MatrixError } from '$types/matrix-sdk';
import { createClient } from '$types/matrix-sdk';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useAutoDiscoveryInfo } from '$hooks/useAutoDiscoveryInfo';
import { promiseFulfilledResult, promiseRejectedResult } from '$utils/common';
import {
  isUsableOAuthMetadata,
  type AuthFlows,
  RegisterFlowStatus,
  parseRegisterErrResp,
  type RegisterFlowsResponse,
} from '$hooks/useAuthFlows';
import { fetch } from '$utils/fetch';

type AuthFlowsLoaderProps = {
  fallback?: () => ReactNode;
  error?: (err: unknown, retry: () => void) => ReactNode;
  children: (authFlows: AuthFlows) => ReactNode;
};
export function AuthFlowsLoader({ fallback, error, children }: AuthFlowsLoaderProps) {
  const autoDiscoveryInfo = useAutoDiscoveryInfo();
  const baseUrl = autoDiscoveryInfo['m.homeserver'].base_url;

  const mx = useMemo(() => createClient({ baseUrl, fetchFn: fetch }), [baseUrl]);

  const [state, load] = useAsyncCallback(
    useCallback(async () => {
      const result = await Promise.allSettled([
        mx.loginFlows(),
        mx.registerRequest({}),
        mx.getAuthMetadata(),
      ]);
      const loginFlows = promiseFulfilledResult(result[0]);
      const registerResp = promiseRejectedResult(result[1]) as MatrixError | undefined;
      const discoveredAuthMetadata = promiseFulfilledResult(result[2]);
      const authMetadata = isUsableOAuthMetadata(discoveredAuthMetadata)
        ? discoveredAuthMetadata
        : undefined;
      let registerFlows: RegisterFlowsResponse = {
        status: RegisterFlowStatus.InvalidRequest,
      };

      if (typeof registerResp === 'object' && registerResp.httpStatus) {
        registerFlows = parseRegisterErrResp(registerResp);
      }

      const validLoginFlows = loginFlows && !('errcode' in loginFlows) ? loginFlows : undefined;

      // OIDC-only servers reject GET /login; that is fine when the OAuth 2.0 API is available.
      if (!validLoginFlows && !authMetadata) {
        throw new Error('Missing auth flow!');
      }

      const authFlows: AuthFlows = {
        loginFlows: validLoginFlows ?? { flows: [] },
        registerFlows,
        authMetadata,
      };

      return authFlows;
    }, [mx])
  );

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === AsyncStatus.Idle || state.status === AsyncStatus.Loading) {
    return fallback?.();
  }

  if (state.status === AsyncStatus.Error) {
    return error?.(state.error, load);
  }

  return children(state.data);
}
