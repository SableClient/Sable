import { useMemo } from 'react';
import type { ILoginFlow, IPasswordFlow, ISSOFlow, LoginFlow } from '$types/matrix-sdk';
import { OAUTH_AWARE_PREFERRED_FLOW_FIELD } from '$types/matrix-sdk';

const getSSOFlow = (loginFlows: LoginFlow[]): ISSOFlow | undefined =>
  loginFlows.find((flow) => flow.type === 'm.login.sso' || flow.type === 'm.login.cas') as
    | ISSOFlow
    | undefined;

export const isOauthAwarePreferred = (ssoFlow: ISSOFlow | undefined): boolean =>
  Boolean(
    ssoFlow?.[OAUTH_AWARE_PREFERRED_FLOW_FIELD.name] ??
    ssoFlow?.[OAUTH_AWARE_PREFERRED_FLOW_FIELD.altName]
  );

const getPasswordFlow = (loginFlows: LoginFlow[]): IPasswordFlow | undefined =>
  loginFlows.find((flow) => flow.type === 'm.login.password') as IPasswordFlow;
const getTokenFlow = (loginFlows: LoginFlow[]): LoginFlow | undefined =>
  loginFlows.find((flow) => flow.type === 'm.login.token') as ILoginFlow & {
    type: 'm.login.token';
  };

export type ParsedLoginFlows = {
  password?: LoginFlow;
  token?: LoginFlow;
  sso?: ISSOFlow;
};
export const useParsedLoginFlows = (loginFlows: LoginFlow[]) => {
  const parsedFlow: ParsedLoginFlows = useMemo<ParsedLoginFlows>(
    () => ({
      password: getPasswordFlow(loginFlows),
      token: getTokenFlow(loginFlows),
      sso: getSSOFlow(loginFlows),
    }),
    [loginFlows]
  );

  return parsedFlow;
};
