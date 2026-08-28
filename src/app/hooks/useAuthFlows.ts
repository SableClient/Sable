import { createContext, useContext } from 'react';
import type {
  IAuthData,
  MatrixError,
  ILoginFlowsResponse,
  ValidatedAuthMetadata,
} from '$types/matrix-sdk';

export enum RegisterFlowStatus {
  FlowRequired = 401,
  InvalidRequest = 400,
  RegistrationDisabled = 403,
  RateLimited = 429,
}

export type RegisterFlowsResponse =
  | {
      status: RegisterFlowStatus.FlowRequired;
      data: IAuthData;
    }
  | {
      status: Exclude<RegisterFlowStatus, RegisterFlowStatus.FlowRequired>;
    };

export const parseRegisterErrResp = (matrixError: MatrixError): RegisterFlowsResponse => {
  switch (matrixError.httpStatus) {
    case RegisterFlowStatus.InvalidRequest: {
      return { status: RegisterFlowStatus.InvalidRequest };
    }
    case RegisterFlowStatus.RateLimited: {
      return { status: RegisterFlowStatus.RateLimited };
    }
    case RegisterFlowStatus.RegistrationDisabled: {
      return { status: RegisterFlowStatus.RegistrationDisabled };
    }
    case RegisterFlowStatus.FlowRequired: {
      return {
        status: RegisterFlowStatus.FlowRequired,
        data: matrixError.data as IAuthData,
      };
    }
    default: {
      return { status: RegisterFlowStatus.InvalidRequest };
    }
  }
};

export type AuthFlows = {
  loginFlows: ILoginFlowsResponse;
  registerFlows: RegisterFlowsResponse;
  authMetadata?: ValidatedAuthMetadata;
};

/** True only when the homeserver advertises the OAuth authorization-code flow Sable uses. */
export const isUsableOAuthMetadata = (metadata: ValidatedAuthMetadata | undefined): boolean =>
  metadata !== undefined &&
  metadata.grant_types_supported.includes('authorization_code') &&
  metadata.grant_types_supported.includes('refresh_token') &&
  metadata.response_types_supported.includes('code') &&
  metadata.response_modes_supported.includes('fragment') &&
  metadata.code_challenge_methods_supported.includes('S256');

const AuthFlowsContext = createContext<AuthFlows | null>(null);

export const AuthFlowsProvider = AuthFlowsContext.Provider;

export const useAuthFlows = (): AuthFlows => {
  const authFlows = useContext(AuthFlowsContext);
  if (!authFlows) {
    throw new Error('Auth Flow info is not loaded!');
  }
  return authFlows;
};
