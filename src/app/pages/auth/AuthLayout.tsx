import { useCallback, useEffect } from 'react';
import { Box, Chip, Header, Scroll, Spinner, Text, color } from 'folds';
import {
  Outlet,
  generatePath,
  matchPath,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import classNames from 'classnames';

import * as PatternsCss from '$styles/Patterns.css';
import { clientAllowedServer, clientDefaultServer, useClientConfig } from '$hooks/useClientConfig';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import CinnySVG from '$public/favicon.png';
import { SpecVersionsLoader } from '$components/SpecVersionsLoader';
import { SpecVersionsProvider } from '$hooks/useSpecVersions';
import { AutoDiscoveryInfoProvider } from '$hooks/useAutoDiscoveryInfo';
import { AuthFlowsLoader } from '$components/AuthFlowsLoader';
import { AuthFlowsProvider } from '$hooks/useAuthFlows';
import { AuthServerProvider } from '$hooks/useAuthServer';
import { LOGIN_PATH, REGISTER_PATH, RESET_PASSWORD_PATH } from '$pages/paths';
import { getHomePath } from '$pages/pathUtils';
import { AutoDiscoveryAction, autoDiscovery } from '../../cs-api';
import { ServerPicker } from './ServerPicker';
import * as css from './styles.css';
import { AuthFooter } from './AuthFooter';

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

function AuthLayoutError({ message }: { message: string }) {
  return (
    <Box justifyContent="Center" alignItems="Center" gap="200">
      <Text align="Center" style={{ color: color.Critical.Main }} size="T300">
        {message}
      </Text>
    </Box>
  );
}

export function AuthLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { server: urlEncodedServer } = useParams();
  const [searchParams] = useSearchParams();

  const isAddingAccount = searchParams.get('addAccount') === '1';

  const clientConfig = useClientConfig();

  const defaultServer = clientDefaultServer(clientConfig);
  const decodedServer = urlEncodedServer && decodeURIComponent(urlEncodedServer);
  let server: string = decodedServer ?? defaultServer;

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

  useEffect(() => {
    if (server) discoverServer(server);
  }, [discoverServer, server]);

  // if server is mismatched with path server, update path — preserve all search params
  useEffect(() => {
    if (!urlEncodedServer || decodeURIComponent(urlEncodedServer) !== server) {
      const basePath = generatePath(currentAuthPath(location.pathname), {
        server: encodeURIComponent(server),
      });
      const search = searchParams.toString();
      navigate(`${basePath}${search ? `?${search}` : ''}`, { replace: true });
    }
  }, [urlEncodedServer, navigate, location, server, searchParams]);

  const selectServer = useCallback(
    (newServer: string) => {
      if (newServer === server) {
        if (discoveryState.status === AsyncStatus.Loading) return;
        discoverServer(server);
        return;
      }
      const basePath = generatePath(currentAuthPath(location.pathname), {
        server: encodeURIComponent(newServer),
      });
      const search = searchParams.toString();
      navigate(`${basePath}${search ? `?${search}` : ''}`);
    },
    [navigate, location, discoveryState, server, discoverServer, searchParams]
  );

  const [autoDiscoveryError, autoDiscoveryInfo] =
    discoveryState.status === AsyncStatus.Success ? discoveryState.data.response : [];

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
              <img className={css.AuthLogo} src={CinnySVG} alt="Cinny Logo" />
              <Text size="H3">Sable</Text>
            </Box>
            {isAddingAccount && (
              <Box gap="200" alignItems="Center" style={{ marginLeft: 'auto' }}>
                <Text size="T200" priority="300">
                  Adding account
                </Text>
                <Chip
                  variant="Surface"
                  radii="300"
                  onClick={() => window.location.assign(getHomePath())}
                >
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
              <AuthLayoutError message="Failed to find homeserver." />
            )}
            {autoDiscoveryError?.action === AutoDiscoveryAction.FAIL_PROMPT && (
              <AuthLayoutError
                message={`Failed to connect. Homeserver configuration found with ${autoDiscoveryError.host} appears unusable.`}
              />
            )}
            {autoDiscoveryError?.action === AutoDiscoveryAction.FAIL_ERROR && (
              <AuthLayoutError message="Failed to connect. Homeserver configuration base_url appears invalid." />
            )}
            {discoveryState.status === AsyncStatus.Success && autoDiscoveryInfo && (
              <AuthServerProvider value={discoveryState.data.serverName}>
                <AutoDiscoveryInfoProvider value={autoDiscoveryInfo}>
                  <SpecVersionsLoader
                    baseUrl={autoDiscoveryInfo['m.homeserver'].base_url}
                    fallback={() => (
                      <AuthLayoutLoading
                        message={`Connecting to ${autoDiscoveryInfo['m.homeserver'].base_url}`}
                      />
                    )}
                    error={() => (
                      <AuthLayoutError message="Failed to connect. Either homeserver is unavailable at this moment or does not exist." />
                    )}
                  >
                    {(specVersions) => (
                      <SpecVersionsProvider value={specVersions}>
                        <AuthFlowsLoader
                          fallback={() => (
                            <AuthLayoutLoading message="Loading authentication flow..." />
                          )}
                          error={() => (
                            <AuthLayoutError message="Failed to get authentication flow information." />
                          )}
                        >
                          {(authFlows) => (
                            <AuthFlowsProvider value={authFlows}>
                              <Outlet />
                            </AuthFlowsProvider>
                          )}
                        </AuthFlowsLoader>
                      </SpecVersionsProvider>
                    )}
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
