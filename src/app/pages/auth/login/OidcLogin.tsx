import { Box, OverlayBackdrop, OverlayCenter, Spinner, Text } from 'folds';
import { Overlay } from '$components/overlay-stack';
import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import type { ValidatedAuthMetadata } from '$types/matrix-sdk';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useAuthServer } from '$hooks/useAuthServer';
import { InfoCard } from '$components/info-card';
import { getLoginPath } from '$pages/pathUtils';
import { useCommitLoginSession } from './loginUtil';
import type { OidcLoginResult } from './oidcLoginUtil';
import {
  OidcLoginError,
  OidcLoginFailure,
  completeOidcLogin,
  startOidcLogin,
} from './oidcLoginUtil';
import { Button } from '$components/button';

const ERROR_TITLE = 'Single sign-on';

const oidcErrorMessage = (error: unknown): string => {
  const code = error instanceof OidcLoginFailure ? error.code : OidcLoginError.Unknown;
  switch (code) {
    case OidcLoginError.RegistrationFailed:
      return 'Could not register with the homeserver for single sign-on.';
    case OidcLoginError.CodeExchangeFailed:
      return 'Sign-in could not be completed. Please try again.';
    case OidcLoginError.MissingDeviceId:
      return 'The homeserver did not grant a device for this session.';
    case OidcLoginError.MissingRefreshToken:
      return 'The authorization server did not issue the required refresh token.';
    default:
      return 'Failed to sign in with single sign-on.';
  }
};

type OidcLoginButtonProps = {
  authMetadata: ValidatedAuthMetadata;
  homeserverUrl: string;
  redirectUri: string;
  label: string;
  prompt?: string;
  notice?: string;
  server?: string;
};
export function OidcLoginButton({
  authMetadata,
  homeserverUrl,
  redirectUri,
  label,
  prompt,
  notice,
  server,
}: OidcLoginButtonProps) {
  const [state, start] = useAsyncCallback(
    useCallback(
      () => startOidcLogin(authMetadata, homeserverUrl, redirectUri, { prompt, server }),
      [authMetadata, homeserverUrl, redirectUri, prompt, server]
    )
  );

  const loading = state.status === AsyncStatus.Loading || state.status === AsyncStatus.Success;
  const errorMessage = state.status === AsyncStatus.Error ? oidcErrorMessage(state.error) : notice;

  return (
    <Box direction="Column" gap="300">
      {errorMessage && (
        <InfoCard variant="Critical" title={ERROR_TITLE} description={errorMessage} />
      )}
      <Button
        style={{ width: '100%' }}
        size="500"
        variant="Secondary"
        fill="Soft"
        outlined
        loading={loading}
        spinnerSize="200"
        spinnerVariant="Secondary"
        onClick={() => start()}
      >
        <Text align="Center" size="B500" truncate>
          {label}
        </Text>
      </Button>
    </Box>
  );
}

type OidcCallbackProps = {
  code: string;
  state: string;
  slidingSyncOptIn: boolean;
};
export function OidcCallback({ code, state, slidingSyncOptIn }: OidcCallbackProps) {
  const commitSession = useCommitLoginSession();
  const server = useAuthServer();
  const navigate = useNavigate();

  const [loginState, complete] = useAsyncCallback<OidcLoginResult, unknown, [string, string]>(
    useCallback(completeOidcLogin, [])
  );

  useEffect(() => {
    complete(code, state);
  }, [code, state, complete]);

  useEffect(() => {
    if (loginState.status === AsyncStatus.Success) {
      commitSession(loginState.data.session, slidingSyncOptIn);
    }
  }, [loginState, slidingSyncOptIn, commitSession]);

  return (
    <>
      {loginState.status === AsyncStatus.Error && (
        <Box direction="Column" gap="300">
          <InfoCard
            variant="Critical"
            title={ERROR_TITLE}
            description={oidcErrorMessage(loginState.error)}
          />
          <Button
            variant="Secondary"
            fill="Soft"
            outlined
            onClick={() => navigate(getLoginPath(server), { replace: true })}
          >
            <Text align="Center" size="B400">
              Back to Login
            </Text>
          </Button>
        </Box>
      )}
      <Overlay open={loginState.status !== AsyncStatus.Error} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <Spinner size="600" variant="Secondary" />
        </OverlayCenter>
      </Overlay>
    </>
  );
}
