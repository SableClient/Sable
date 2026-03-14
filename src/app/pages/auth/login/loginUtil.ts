import to from 'await-to-js';
import { createClient, LoginRequest, LoginResponse, MatrixError } from '$types/matrix-sdk';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { clientAllowedServer, ClientConfig } from '$hooks/useClientConfig';
import {
  deleteAfterLoginRedirectPath,
  getAfterLoginRedirectPath,
} from '$pages/afterLoginRedirectPath';
import { getHomePath } from '$pages/pathUtils';
import { activeSessionIdAtom, sessionsAtom } from '$state/sessions';
import { createLogger } from '$utils/debug';
import { createDebugLogger } from '$utils/debugLogger';
import { ErrorCode } from '../../../cs-errorcode';
import { autoDiscovery, specVersions } from '../../../cs-api';

const log = createLogger('loginUtil');
const debugLog = createDebugLogger('loginUtil');

export enum GetBaseUrlError {
  NotAllow = 'NotAllow',
  NotFound = 'NotFound',
}
export const factoryGetBaseUrl =
  (clientConfig: ClientConfig, server: string) => async (): Promise<string> => {
    if (!clientAllowedServer(clientConfig, server)) {
      throw new Error(GetBaseUrlError.NotAllow);
    }

    const [, discovery] = await to(autoDiscovery(fetch, server));

    let mxIdBaseUrl: string | undefined;
    const [, discoveryInfo] = discovery ?? [];

    if (discoveryInfo) {
      mxIdBaseUrl = discoveryInfo['m.homeserver'].base_url;
    }

    if (!mxIdBaseUrl) {
      throw new Error(GetBaseUrlError.NotFound);
    }
    const [, versions] = await to(specVersions(fetch, mxIdBaseUrl));
    if (!versions) {
      throw new Error(GetBaseUrlError.NotFound);
    }
    return mxIdBaseUrl;
  };

export enum LoginError {
  ServerNotAllowed = 'ServerNotAllowed',
  InvalidServer = 'InvalidServer',
  Forbidden = 'Forbidden',
  UserDeactivated = 'UserDeactivated',
  InvalidRequest = 'InvalidRequest',
  RateLimited = 'RateLimited',
  Unknown = 'Unknown',
}

export type CustomLoginResponse = {
  baseUrl: string;
  response: LoginResponse;
};
export const login = async (
  serverBaseUrl: string | (() => Promise<string>),
  data: LoginRequest
): Promise<CustomLoginResponse> => {
  const [urlError, url] =
    typeof serverBaseUrl === 'function' ? await to(serverBaseUrl()) : [undefined, serverBaseUrl];
  if (urlError) {
    throw new MatrixError({
      errcode:
        urlError.message === GetBaseUrlError.NotAllow
          ? LoginError.ServerNotAllowed
          : LoginError.InvalidServer,
    });
  }

  const mx = createClient({ baseUrl: url });
  debugLog.info('general', 'Attempting login', { baseUrl: url, loginType: data.type });
  const [err, res] = await to<LoginResponse, MatrixError>(mx.loginRequest(data));

  if (err) {
    if (err.httpStatus === 400) {
      debugLog.error('general', 'Login failed - invalid request', { httpStatus: 400 });
      throw new MatrixError({
        errcode: LoginError.InvalidRequest,
      });
    }
    if (err.httpStatus === 429) {
      debugLog.error('general', 'Login failed - rate limited', { httpStatus: 429 });
      throw new MatrixError({
        errcode: LoginError.RateLimited,
      });
    }
    if (err.errcode === ErrorCode.M_USER_DEACTIVATED) {
      debugLog.error('general', 'Login failed - user deactivated', { errcode: err.errcode });
      throw new MatrixError({
        errcode: LoginError.UserDeactivated,
      });
    }

    if (err.httpStatus === 403) {
      debugLog.error('general', 'Login failed - forbidden', { httpStatus: 403 });
      throw new MatrixError({
        errcode: LoginError.Forbidden,
      });
    }

    debugLog.error('general', 'Login failed - unknown error', {
      error: err.message,
      httpStatus: err.httpStatus,
    });
    throw new MatrixError({
      errcode: LoginError.Unknown,
    });
  }
  debugLog.info('general', 'Login successful', { userId: res.user_id, deviceId: res.device_id });
  return {
    baseUrl: url,
    response: res,
  };
};

export const useLoginComplete = (data?: CustomLoginResponse) => {
  const navigate = useNavigate();
  const setSessions = useSetAtom(sessionsAtom);
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);

  useEffect(() => {
    if (data) {
      const { response: loginRes, baseUrl: loginBaseUrl } = data;
      log.log('useLoginComplete: login success', {
        userId: loginRes.user_id,
        baseUrl: loginBaseUrl,
      });
      const newSession = {
        baseUrl: loginBaseUrl,
        userId: loginRes.user_id,
        deviceId: loginRes.device_id,
        accessToken: loginRes.access_token,
      };
      setSessions({ type: 'PUT', session: newSession });
      setActiveSessionId(loginRes.user_id);
      const afterLoginRedirectUrl = getAfterLoginRedirectPath();
      deleteAfterLoginRedirectPath();
      const destination = afterLoginRedirectUrl ?? getHomePath();
      log.log('useLoginComplete: navigating to', destination);
      navigate(destination, { replace: true });
    }
  }, [data, navigate, setSessions, setActiveSessionId]);
};
