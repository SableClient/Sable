import type { ReactNode } from 'react';
import { useCallback, useEffect } from 'react';
import { Box, Chip, Header, IconButton, Scroll, Spinner, Text, color } from 'folds';
import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import { Outlet, matchPath, useLocation, useNavigate, useSearchParams } from 'react-router';
import classNames from 'classnames';

import * as PatternsCss from '$styles/Patterns.css';
import { clientAllowedServer, clientDefaultServer, useClientConfig } from '$hooks/useClientConfig';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import LogoSVG from '$public/res/svg/logo.svg';
import { SpecVersionsLoader } from '$components/SpecVersionsLoader';
import { SpecVersionsProvider } from '$hooks/useSpecVersions';
import { AutoDiscoveryInfoProvider } from '$hooks/useAutoDiscoveryInfo';
import { AuthFlowsLoader } from '$components/AuthFlowsLoader';
import { AuthFlowsProvider } from '$hooks/useAuthFlows';
import type { AuthFlows } from '$hooks/useAuthFlows';
import { AuthServerProvider } from '$hooks/useAuthServer';
import { LOGIN_PATH, REGISTER_PATH, RESET_PASSWORD_PATH, SERVER_SEARCH_PARAM } from '$pages/paths';
import { getHomePath } from '$pages/pathUtils';
import { fetch } from '$utils/fetch';
import { sizedIcon } from '$components/icons/phosphor';
import { AutoDiscoveryAction, autoDiscovery } from '../../cs-api';
import type { SpecVersions } from '../../cs-api';
import { ServerPicker } from './ServerPicker';
import * as css from './styles.css';
import { AuthFooter } from './AuthFooter';
import { usePathWithOrigin } from '$hooks/usePathWithOrigin';

const currentAuthPath = (pathname: string): string => {
  if (matchPath(LOGIN_PATH, pathname)) {
    return LOGIN_PATH;
  }
  if (matchPath(RESET_PASSWORD_PATH, pathname)) {
    return RESET_PASSWORD_PATH;
  }
  if (matchPath(REGISTER_PATH, pathname)) {
    return REGISTER_PATH;
  }
  return LOGIN_PATH;
};

const authPathWithServer = (
  pathname: string,
  searchParams: URLSearchParams,
  server: string
): string => {
  const params = new URLSearchParams(searchParams);
  params.set(SERVER_SEARCH_PARAM, server);
  return `${currentAuthPath(pathname)}?${params}`;
};

function AuthLayoutLoading({ message }: { message: string }) {
  return (
    <Box justifyContent="Center" alignItems="Center" gap="200">
      <Spinner size="100" variant="Secondary" />
      <Text align="Center" size="T300">
        {message}
      </Text>
    </Box>
  );
}

function AuthLayoutError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <Box justifyContent="Center" alignItems="Center" gap="200">
      <Text align="Center" style={{ color: color.Critical.Main }} size="T300">
        {message}
      </Text>
      <IconButton
        type="button"
        size="300"
        variant="Critical"
        fill="None"
        onClick={retry}
        aria-label="Retry"
        radii="300"
      >
        {sizedIcon(ArrowClockwiseIcon, '100')}
      </IconButton>
    </Box>
  );
}

function AuthHomeserverConnectFallback({ baseUrl }: { baseUrl: string }) {
  return <AuthLayoutLoading message={`Connecting to ${baseUrl}`} />;
}

function authHomeserverConnectError(_error: unknown, retry: () => void) {
  return (
    <AuthLayoutError
      message="Failed to connect. Either homeserver is unavailable at this moment or does not exist."
      retry={retry}
    />
  );
}

function authFlowsLoadingFallback() {
  return <AuthLayoutLoading message="Loading authentication flow..." />;
}

function authFlowsError(_error: unknown, retry: () => void) {
  return <AuthLayoutError message="Failed to get authentication flow information." retry={retry} />;
}

function AuthFlowsOutlet({ authFlows }: { authFlows: AuthFlows }) {
  return (
    <AuthFlowsProvider value={authFlows}>
      <Outlet />
    </AuthFlowsProvider>
  );
}

function AuthSpecVersionsContent({
  specVersions,
  renderAuthFlows,
}: {
  specVersions: SpecVersions;
  renderAuthFlows: (authFlows: AuthFlows) => ReactNode;
}) {
  return (
    <SpecVersionsProvider value={specVersions}>
      <AuthFlowsLoader fallback={authFlowsLoadingFallback} error={authFlowsError}>
        {renderAuthFlows}
      </AuthFlowsLoader>
    </SpecVersionsProvider>
  );
}

export function AuthLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlServer = searchParams.get(SERVER_SEARCH_PARAM) ?? undefined;

  const isAddingAccount = searchParams.get('addAccount') === '1';

  const clientConfig = useClientConfig();

  const homeUrl = usePathWithOrigin(getHomePath());

  const defaultServer = clientDefaultServer(clientConfig);
  let server: string = urlServer ?? defaultServer;

  if (!clientAllowedServer(clientConfig, server)) {
    server = defaultServer;
  }

  const [discoveryState, discoverServer] = useAsyncCallback(
    useCallback(async (serverName: string) => {
      const response = await autoDiscovery(fetch, serverName);
      return {
        serverName,
        response,
      };
    }, [])
  );
  const retryHomeserverDiscovery = () => discoverServer(server);

  useEffect(() => {
    if (server) discoverServer(server);
  }, [discoverServer, server]);

  // if server is mismatched with url server, update url — preserve all search params
  useEffect(() => {
    if (urlServer !== server) {
      navigate(authPathWithServer(location.pathname, searchParams, server), { replace: true });
    }
  }, [urlServer, navigate, location, server, searchParams]);

  const selectServer = useCallback(
    (newServer: string) => {
      if (newServer === server) {
        if (discoveryState.status === AsyncStatus.Loading) return;
        discoverServer(server);
        return;
      }
      navigate(authPathWithServer(location.pathname, searchParams, newServer));
    },
    [navigate, location, discoveryState, server, discoverServer, searchParams]
  );

  const [autoDiscoveryError, autoDiscoveryInfo] =
    discoveryState.status === AsyncStatus.Success ? discoveryState.data.response : [];

  const homeserverBaseUrl = autoDiscoveryInfo?.['m.homeserver']?.base_url;

  const renderHomeserverConnectFallback = useCallback(() => {
    if (!homeserverBaseUrl) return null;
    return <AuthHomeserverConnectFallback baseUrl={homeserverBaseUrl} />;
  }, [homeserverBaseUrl]);

  const renderAuthFlows = useCallback(
    (authFlows: AuthFlows) => <AuthFlowsOutlet authFlows={authFlows} />,
    []
  );

  const renderSpecVersions = useCallback(
    (specVersions: SpecVersions) => (
      <AuthSpecVersionsContent specVersions={specVersions} renderAuthFlows={renderAuthFlows} />
    ),
    [renderAuthFlows]
  );

  return (
    <Scroll variant="Background" visibility="Hover" size="300" hideTrack>
      <Box
        className={classNames(css.AuthLayout, PatternsCss.BackgroundDotPattern)}
        direction="Column"
        alignItems="Center"
        justifyContent="SpaceBetween"
        gap="400"
      >
        <Box direction="Column" className={css.AuthCard}>
          <Header className={css.AuthHeader} size="600" variant="Surface">
            <Box grow="Yes" direction="Row" gap="300" alignItems="Center">
              <img className={css.AuthLogo} src={LogoSVG} alt="Sable Logo" />
              <Text size="H3">Sable</Text>
            </Box>
            {isAddingAccount && (
              <Box gap="200" alignItems="Center" style={{ marginLeft: 'auto' }}>
                <Text size="T200" priority="300">
                  Adding account
                </Text>
                <Chip variant="Surface" radii="300" onClick={() => window.location.assign(homeUrl)}>
                  <Text size="T200">Cancel</Text>
                </Chip>
              </Box>
            )}
          </Header>
          <Box className={css.AuthCardContent} direction="Column">
            <Box direction="Column" gap="100">
              <Text as="label" size="L400" priority="300">
                Homeserver
              </Text>
              <ServerPicker
                server={server}
                serverList={clientConfig.homeserverList ?? []}
                allowCustomServer={clientConfig.allowCustomHomeservers}
                onServerChange={selectServer}
              />
            </Box>
            {discoveryState.status === AsyncStatus.Loading && (
              <AuthLayoutLoading message="Looking for homeserver..." />
            )}
            {discoveryState.status === AsyncStatus.Error && (
              <AuthLayoutError
                message="Failed to find homeserver."
                retry={retryHomeserverDiscovery}
              />
            )}
            {autoDiscoveryError?.action === AutoDiscoveryAction.FAIL_PROMPT && (
              <AuthLayoutError
                message={`Failed to connect. Homeserver configuration found with ${autoDiscoveryError.host} appears unusable.`}
                retry={retryHomeserverDiscovery}
              />
            )}
            {autoDiscoveryError?.action === AutoDiscoveryAction.FAIL_ERROR && (
              <AuthLayoutError
                message="Failed to connect. Homeserver configuration base_url appears invalid."
                retry={retryHomeserverDiscovery}
              />
            )}
            {discoveryState.status === AsyncStatus.Success && autoDiscoveryInfo && (
              <AuthServerProvider value={discoveryState.data.serverName}>
                <AutoDiscoveryInfoProvider value={autoDiscoveryInfo}>
                  <SpecVersionsLoader
                    baseUrl={autoDiscoveryInfo['m.homeserver'].base_url}
                    fallback={renderHomeserverConnectFallback}
                    error={authHomeserverConnectError}
                  >
                    {renderSpecVersions}
                  </SpecVersionsLoader>
                </AutoDiscoveryInfoProvider>
              </AuthServerProvider>
            )}
          </Box>
        </Box>
        <AuthFooter />
      </Box>
    </Scroll>
  );
}
