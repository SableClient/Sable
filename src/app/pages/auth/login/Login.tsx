import { useMemo, useState } from 'react';
import { Box, Switch, Text, Tooltip, color, config } from 'folds';
import { TooltipProvider } from '$components/overlay-stack';
import { Link, useSearchParams } from 'react-router';
import { SSOAction } from '$types/matrix-sdk';
import { isUsableOAuthMetadata, RegisterFlowStatus, useAuthFlows } from '$hooks/useAuthFlows';
import { useAuthServer } from '$hooks/useAuthServer';
import { useAutoDiscoveryInfo } from '$hooks/useAutoDiscoveryInfo';
import { useParsedLoginFlows } from '$hooks/useParsedLoginFlows';
import { getLoginPath, getRegisterPath, withSearchParam } from '$pages/pathUtils';
import { usePathWithOrigin } from '$hooks/usePathWithOrigin';
import type { LoginPathSearchParams } from '$pages/paths';
import { useClientConfig } from '$hooks/useClientConfig';
import { SSOLogin } from '$pages/auth/SSOLogin';
import { isTauri } from '@tauri-apps/api/core';
import { buildTauriSsoRedirectUrl } from '$pages/auth/SSOTauri';
import { OrDivider } from '$pages/auth/OrDivider';
import { PasswordLoginForm } from './PasswordLoginForm';
import { TokenLogin } from './TokenLogin';
import { OidcLoginButton, OidcCallback } from './OidcLogin';
import { sizedIcon, Info } from '$components/icons/phosphor';
import { getPendingSlidingSyncLogin, setPendingSlidingSyncLogin } from './slidingSyncLogin';

// react-router ignores the real query string in hashRouter mode, so read callback params direct.
const getExternalSearchParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    loginToken: params.get('loginToken') ?? undefined,
    code: params.get('code') ?? undefined,
    state: params.get('state') ?? undefined,
    error: params.get('error') ?? undefined,
    errorDescription: params.get('error_description') ?? undefined,
  };
};

const useLoginSearchParams = (searchParams: URLSearchParams): LoginPathSearchParams =>
  useMemo(
    () => ({
      username: searchParams.get('username') ?? undefined,
      email: searchParams.get('email') ?? undefined,
      loginToken: searchParams.get('loginToken') ?? undefined,
    }),
    [searchParams]
  );

type SlidingSyncLoginOptionProps = {
  value: boolean;
  onChange: (value: boolean) => void;
};

function SlidingSyncLoginOption({ value, onChange }: SlidingSyncLoginOptionProps) {
  return (
    <Box alignItems="Center" justifyContent="SpaceBetween" gap="300">
      <Box alignItems="Center" gap="100">
        <Text as="label" htmlFor="login-sliding-sync" priority="400">
          Use sliding sync
        </Text>
        <TooltipProvider
          delay={300}
          tooltip={
            <Tooltip style={{ maxWidth: '240px', padding: config.space.S200 }}>
              <Text size="T200">
                Sliding sync is faster and uses less bandwidth, but it can be buggier. You can
                toggle it later in Settings at any time.
              </Text>
            </Tooltip>
          }
        >
          {(triggerRef) => (
            <span
              ref={triggerRef}
              role="img"
              aria-label="About sliding sync"
              style={{ display: 'inline-flex', color: color.Surface.OnContainer }}
            >
              {sizedIcon(Info, '100')}
            </span>
          )}
        </TooltipProvider>
      </Box>
      <Switch variant="Primary" value={value} onChange={onChange} id="login-sliding-sync" />
    </Box>
  );
}

export function Login() {
  const server = useAuthServer();
  const { hashRouter } = useClientConfig();
  const { hideUsernamePasswordFields } = useClientConfig();
  const { loginFlows, registerFlows, authMetadata } = useAuthFlows();
  const discovery = useAutoDiscoveryInfo();
  const baseUrl = discovery['m.homeserver'].base_url;
  const [searchParams] = useSearchParams();
  const loginSearchParams = useLoginSearchParams(searchParams);
  const webSsoRedirectUrl = usePathWithOrigin(getLoginPath(server));
  const ssoRedirectUrl = isTauri() ? buildTauriSsoRedirectUrl(server) : webSsoRedirectUrl;
  const oidcRedirectUri = usePathWithOrigin(getLoginPath(server), { ignoreHashRouter: true });
  const external = getExternalSearchParams();
  const absoluteLoginPath = usePathWithOrigin(getLoginPath(server));
  const [useSlidingSync, setUseSlidingSync] = useState(getPendingSlidingSyncLogin);

  const handleSlidingSyncChange = (enabled: boolean) => {
    setUseSlidingSync(enabled);
    setPendingSlidingSyncLogin(enabled);
  };

  if (hashRouter?.enabled && (external.loginToken || (external.code && external.state))) {
    window.location.replace(
      withSearchParam(absoluteLoginPath, {
        ...(external.loginToken ? { loginToken: external.loginToken } : {}),
        ...(external.code && external.state ? { code: external.code, state: external.state } : {}),
      })
    );
  }

  const parsedFlows = useParsedLoginFlows(loginFlows.flows);

  const isAddingAccount = searchParams.get('addAccount') === '1';

  const registerUrl = isAddingAccount
    ? withSearchParam(getRegisterPath(server), { addAccount: '1' })
    : getRegisterPath(server);

  const registrationUnavailable =
    registerFlows.status === RegisterFlowStatus.RegistrationDisabled && !parsedFlows.sso;

  const oidcCode = searchParams.get('code') ?? undefined;
  const oidcState = searchParams.get('state') ?? undefined;
  const oidcError = searchParams.get('error') ?? external.error;
  const oidcErrorDescription = searchParams.get('error_description') ?? external.errorDescription;
  const oidcNotice = oidcError
    ? (oidcErrorDescription ?? `Sign-in was not completed (${oidcError}).`)
    : undefined;

  const oidcMetadata = isUsableOAuthMetadata(authMetadata) ? authMetadata : undefined;
  const showOidc = oidcMetadata !== undefined;
  const hidePassword = hideUsernamePasswordFields;
  const showPassword = !hidePassword && parsedFlows.password !== undefined;
  const showLegacySso = parsedFlows.sso !== undefined;

  if (showOidc && oidcCode && oidcState) {
    return <OidcCallback code={oidcCode} state={oidcState} slidingSyncOptIn={useSlidingSync} />;
  }

  return (
    <Box direction="Column" gap="500">
      <Text size="H2" priority="400">
        Login
      </Text>
      <SlidingSyncLoginOption value={useSlidingSync} onChange={handleSlidingSyncChange} />
      {parsedFlows.token && loginSearchParams.loginToken && (
        <TokenLogin token={loginSearchParams.loginToken} slidingSyncOptIn={useSlidingSync} />
      )}
      {showOidc && (
        <>
          <OidcLoginButton
            authMetadata={oidcMetadata}
            homeserverUrl={baseUrl}
            redirectUri={oidcRedirectUri}
            label={`Continue with ${server}`}
            notice={oidcNotice}
            server={server}
          />
          <span data-spacing-node />
        </>
      )}
      {showLegacySso && (
        <>
          {showOidc && <OrDivider />}
          <SSOLogin
            providers={parsedFlows.sso!.identity_providers}
            redirectUrl={ssoRedirectUrl}
            action={SSOAction.LOGIN}
            saveScreenSpace={showPassword || showOidc}
          />
          <span data-spacing-node />
        </>
      )}
      {showPassword && (
        <>
          {(showLegacySso || (showOidc && !showLegacySso)) && <OrDivider />}
          <PasswordLoginForm
            defaultUsername={loginSearchParams.username}
            defaultEmail={loginSearchParams.email}
            slidingSyncOptIn={useSlidingSync}
          />
          <span data-spacing-node />
        </>
      )}
      {!showPassword && !showLegacySso && !showOidc && (
        <>
          <Text style={{ color: color.Critical.Main }}>
            {`This client does not support login on "${server}" homeserver. Password and SSO based login method not found.`}
          </Text>
          <span data-spacing-node />
        </>
      )}
      {!registrationUnavailable && (
        <Text align="Center">
          Do not have an account? <Link to={registerUrl}>Register</Link>
        </Text>
      )}
    </Box>
  );
}
