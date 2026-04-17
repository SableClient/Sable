import { useMemo } from 'react';
import { Box, Text, color } from 'folds';
import { Link, useSearchParams } from 'react-router-dom';
import { SSOAction } from '$types/matrix-sdk';
import { useAuthServer } from '$hooks/useAuthServer';
import { RegisterFlowStatus, useAuthFlows } from '$hooks/useAuthFlows';
import { useParsedLoginFlows } from '$hooks/useParsedLoginFlows';
import { SupportedUIAFlowsLoader } from '$components/SupportedUIAFlowsLoader';
import { getLoginPath } from '$pages/pathUtils';
import { usePathWithOrigin } from '$hooks/usePathWithOrigin';
import type { RegisterPathSearchParams } from '$pages/paths';
import { SSOLogin } from '$pages/auth/SSOLogin';
import { OrDivider } from '$pages/auth/OrDivider';
import { PasswordRegisterForm, SUPPORTED_REGISTER_STAGES } from './PasswordRegisterForm';

const useRegisterSearchParams = (searchParams: URLSearchParams): RegisterPathSearchParams =>
  useMemo(
    () => ({
      username: searchParams.get('username') ?? undefined,
      email: searchParams.get('email') ?? undefined,
      token: searchParams.get('token') ?? undefined,
    }),
    [searchParams]
  );

export function Register() {
  const server = useAuthServer();
  const { loginFlows, registerFlows } = useAuthFlows();
  const [searchParams] = useSearchParams();
  const registerSearchParams = useRegisterSearchParams(searchParams);
  const { sso } = useParsedLoginFlows(loginFlows.flows);

  // redirect to /login because only that path handle m.login.token
  const ssoRedirectUrl = usePathWithOrigin(getLoginPath(server));

  return (
    <Box direction="Column" gap="500">
      <Text size="H2" priority="400">
        Register
      </Text>
      {registerFlows.status === RegisterFlowStatus.RegistrationDisabled && !sso && (
        <Text style={{ color: color.Critical.Main }} size="T300">
          Registration has been disabled on this homeserver.
        </Text>
      )}
      {registerFlows.status === RegisterFlowStatus.RateLimited && !sso && (
        <Text style={{ color: color.Critical.Main }} size="T300">
          You have been rate-limited! Please try after some time.
        </Text>
      )}
      {registerFlows.status === RegisterFlowStatus.InvalidRequest && !sso && (
        <Text style={{ color: color.Critical.Main }} size="T300">
          Invalid Request! Failed to get any registration options.
        </Text>
      )}
      {registerFlows.status === RegisterFlowStatus.FlowRequired && (
        <>
          <SupportedUIAFlowsLoader
            flows={registerFlows.data.flows ?? []}
            supportedStages={SUPPORTED_REGISTER_STAGES}
          >
            {(supportedFlows) =>
              supportedFlows.length === 0 ? (
                <Text style={{ color: color.Critical.Main }} size="T300">
                  This application does not support registration on this homeserver.
                </Text>
              ) : (
                <PasswordRegisterForm
                  authData={registerFlows.data}
                  uiaFlows={supportedFlows}
                  defaultUsername={registerSearchParams.username}
                  defaultEmail={registerSearchParams.email}
                  defaultRegisterToken={registerSearchParams.token}
                />
              )
            }
          </SupportedUIAFlowsLoader>
          <span data-spacing-node />
          {sso && <OrDivider />}
        </>
      )}
      {sso && (
        <>
          <SSOLogin
            providers={sso.identity_providers}
            redirectUrl={ssoRedirectUrl}
            action={SSOAction.REGISTER}
            saveScreenSpace={registerFlows.status === RegisterFlowStatus.FlowRequired}
          />
          <span data-spacing-node />
        </>
      )}
      <Text align="Center">
        Already have an account? <Link to={getLoginPath(server)}>Login</Link>
      </Text>
    </Box>
  );
}
