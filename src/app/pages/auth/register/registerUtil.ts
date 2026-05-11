import to from 'await-to-js';
import type { IAuthData, MatrixClient, RegisterRequest, RegisterResponse } from '$types/matrix-sdk';
import { MatrixError } from '$types/matrix-sdk';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import {
  deleteAfterLoginRedirectPath,
  getAfterLoginRedirectPath,
} from '$pages/afterLoginRedirectPath';
import { getHomePath, getLoginPath, withSearchParam } from '$pages/pathUtils';
import { getMxIdLocalPart } from '$utils/matrix';
import { activeSessionIdAtom, sessionsAtom, setFallbackSession } from '$state/sessions';
import { getMxIdServer } from '$utils/mxIdHelper';
import { ErrorCode } from '../../../cs-errorcode';

export enum RegisterError {
  UserTaken = 'UserTaken',
  UserInvalid = 'UserInvalid',
  UserExclusive = 'UserExclusive',
  PasswordWeak = 'PasswordWeak',
  PasswordShort = 'PasswordShort',
  InvalidRequest = 'InvalidRequest',
  Forbidden = 'Forbidden',
  RateLimited = 'RateLimited',
  Unknown = 'Unknown',
}

export type CustomRegisterResponse = {
  baseUrl: string;
  response: RegisterResponse;
};
export type RegisterResult = [IAuthData, undefined] | [undefined, CustomRegisterResponse];
export const register = async (
  mx: MatrixClient,
  requestData: RegisterRequest
): Promise<RegisterResult> => {
  const [err, res] = await to<RegisterResponse, MatrixError>(mx.registerRequest(requestData));

  if (err) {
    if (err.httpStatus === 401) {
      const authData = err.data as IAuthData;
      return [authData, undefined];
    }

    if (err.errcode === ErrorCode.M_USER_IN_USE) {
      throw new MatrixError({
        errcode: RegisterError.UserTaken,
      });
    }
    if (err.errcode === ErrorCode.M_INVALID_USERNAME) {
      throw new MatrixError({
        errcode: RegisterError.UserInvalid,
      });
    }
    if (err.errcode === ErrorCode.M_EXCLUSIVE) {
      throw new MatrixError({
        errcode: RegisterError.UserExclusive,
      });
    }
    if (err.errcode === ErrorCode.M_WEAK_PASSWORD) {
      throw new MatrixError({
        errcode: RegisterError.PasswordWeak,
        error: err.data.error,
      });
    }
    if (err.errcode === ErrorCode.M_PASSWORD_TOO_SHORT) {
      throw new MatrixError({
        errcode: RegisterError.PasswordShort,
        error: err.data.error,
      });
    }

    if (err.httpStatus === 429) {
      throw new MatrixError({
        errcode: RegisterError.RateLimited,
      });
    }

    if (err.httpStatus === 400) {
      throw new MatrixError({
        errcode: RegisterError.InvalidRequest,
      });
    }

    if (err.httpStatus === 403) {
      throw new MatrixError({
        errcode: RegisterError.Forbidden,
      });
    }

    throw new MatrixError({
      errcode: RegisterError.Unknown,
      error: err.data.error,
    });
  }
  return [
    undefined,
    {
      baseUrl: mx.baseUrl,
      response: res,
    },
  ];
};

export const useRegisterComplete = (data?: CustomRegisterResponse) => {
  const navigate = useNavigate();
  const setSessions = useSetAtom(sessionsAtom);
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);

  useEffect(() => {
    if (data) {
      const { response, baseUrl } = data;

      const userId = response.user_id;
      const accessToken = response.access_token;
      const deviceId = response.device_id;

      if (accessToken && deviceId) {
        setSessions({
          type: 'PUT',
          session: {
            baseUrl,
            userId,
            deviceId,
            accessToken,
          },
        });
        setActiveSessionId(userId);
        // Keep legacy keys for SW/backward-compat paths still reading cinny_* values.
        setFallbackSession(accessToken, deviceId, userId, baseUrl);
        const afterLoginRedirectPath = getAfterLoginRedirectPath();
        deleteAfterLoginRedirectPath();
        navigate(afterLoginRedirectPath ?? getHomePath(), { replace: true });
      } else {
        const username = getMxIdLocalPart(userId);
        const userServer = getMxIdServer(userId);
        navigate(
          withSearchParam(getLoginPath(userServer), {
            username: username ?? '',
          }),
          { replace: true }
        );
      }
    }
  }, [data, navigate, setSessions, setActiveSessionId]);
};
