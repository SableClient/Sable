import {
  Box,
  Button,
  config,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
} from 'folds';
import { HttpApiEvent, HttpApiEventHandlerMap, MatrixClient } from '$types/matrix-sdk';
import FocusTrap from 'focus-trap-react';
import { useRef, MouseEventHandler, ReactNode, useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/react';
import { useNavigate } from 'react-router-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  clearCacheAndReload,
  clearLoginData,
  clearMismatchedStores,
  initClient,
  logoutClient,
  startClient,
  stopClient,
} from '$client/initMatrix';
import { SplashScreen } from '$components/splash-screen';
import { ServerConfigsLoader } from '$components/ServerConfigsLoader';
import { CapabilitiesProvider } from '$hooks/useCapabilities';
import { MediaConfigProvider } from '$hooks/useMediaConfig';
import { MatrixClientProvider } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useSyncState } from '$hooks/useSyncState';
import { stopPropagation } from '$utils/keyboard';
import { AuthMetadataProvider } from '$hooks/useAuthMetadata';
import {
  sessionsAtom,
  activeSessionIdAtom,
  type Session,
  type SessionsAction,
} from '$state/sessions';
import { createLogger } from '$utils/debug';
import { useSyncNicknames } from '$hooks/useNickname';
import { useAppVisibility } from '$hooks/useAppVisibility';
import { getHomePath } from '$pages/pathUtils';
import { useClientConfig } from '$hooks/useClientConfig';
import { pushSessionToSW } from '../../../sw-session';
import { SyncStatus } from './SyncStatus';
import { SpecVersions } from './SpecVersions';
import { AutoDiscovery } from './AutoDiscovery';

const log = createLogger('ClientRoot');

const isClientReady = (syncState: string | null): boolean =>
  syncState === 'PREPARED' || syncState === 'SYNCING' || syncState === 'CATCHUP';

function ClientRootLoading() {
  return (
    <SplashScreen>
      <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
        <Spinner variant="Secondary" size="600" />
        <Text>Petting cats</Text>
      </Box>
    </SplashScreen>
  );
}

type ClientRootOptionsProps = {
  mx?: MatrixClient;
  onLogout: () => void;
};
function ClientRootOptions({ mx, onLogout }: ClientRootOptionsProps) {
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleToggle: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => {
      if (currentState) return undefined;
      return cords;
    });
  };

  return (
    <IconButton
      style={{
        position: 'absolute',
        top: config.space.S100,
        right: config.space.S100,
      }}
      variant="Background"
      fill="None"
      onClick={handleToggle}
    >
      <Icon size="200" src={Icons.VerticalDots} />
      <PopOut
        anchor={menuAnchor}
        position="Bottom"
        align="End"
        offset={6}
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: () => setMenuAnchor(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
              isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {mx && (
                  <MenuItem onClick={() => clearCacheAndReload(mx)} size="300" radii="300">
                    <Text as="span" size="T300" truncate>
                      Clear Cache and Reload
                    </Text>
                  </MenuItem>
                )}
                <MenuItem
                  onClick={() => {
                    if (mx) {
                      onLogout();
                      return;
                    }
                    clearLoginData();
                  }}
                  size="300"
                  radii="300"
                  variant="Critical"
                  fill="None"
                >
                  <Text as="span" size="T300" truncate>
                    Logout
                  </Text>
                </MenuItem>
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </IconButton>
  );
}

const useLogoutListener = (mx?: MatrixClient) => {
  useEffect(() => {
    const handleLogout: HttpApiEventHandlerMap[HttpApiEvent.SessionLoggedOut] = async () => {
      Sentry.addBreadcrumb({
        category: 'auth',
        message: 'Session forcibly logged out by server',
        level: 'warning',
      });
      if (mx) stopClient(mx);
      await mx?.clearStores();
      window.localStorage.clear();
      window.location.reload();
    };

    mx?.on(HttpApiEvent.SessionLoggedOut, handleLogout);
    return () => {
      mx?.removeListener(HttpApiEvent.SessionLoggedOut, handleLogout);
    };
  }, [mx]);
};

type ClientRootProps = {
  children: ReactNode;
};
export function ClientRoot({ children }: ClientRootProps) {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const clientConfig = useClientConfig();
  const sessions = useAtomValue(sessionsAtom);
  const [activeSessionId, setActiveSessionId] = useAtom(activeSessionIdAtom);
  const setSessions = useSetAtom(sessionsAtom);

  const activeSession: Session | undefined =
    sessions.find((s) => s.userId === activeSessionId) ?? sessions[0];

  const { baseUrl, userId } = activeSession ?? {};

  const loadedUserIdRef = useRef<string | undefined>(undefined);
  const syncStartTimeRef = useRef(performance.now());
  const firstSyncReadyRef = useRef(false);

  const [loadState, loadMatrix, setLoadState] = useAsyncCallback<MatrixClient, Error, []>(
    useCallback(async () => {
      if (!activeSession) {
        log.error('no session found');
        throw new Error('No session Found!');
      }
      if (activeSession.userId !== activeSessionId) {
        log.log('persisting activeSessionId →', activeSession.userId);
        setActiveSessionId(activeSession.userId);
      }
      await clearMismatchedStores();
      log.log('initClient for', activeSession.userId);
      const newMx = await initClient(activeSession);
      loadedUserIdRef.current = activeSession.userId;
      pushSessionToSW(activeSession.baseUrl, activeSession.accessToken);
      return newMx;
    }, [activeSession, activeSessionId, setActiveSessionId])
  );

  const mx = loadState.status === AsyncStatus.Success ? loadState.data : undefined;

  const [startState, startMatrix] = useAsyncCallback<void, Error, [MatrixClient]>(
    useCallback(
      (m) =>
        startClient(m, {
          baseUrl: activeSession?.baseUrl,
          slidingSync: clientConfig.slidingSync,
          sessionSlidingSyncOptIn: activeSession?.slidingSyncOptIn,
        }),
      [activeSession?.baseUrl, activeSession?.slidingSyncOptIn, clientConfig.slidingSync]
    )
  );

  useEffect(() => {
    if (!activeSession) return;
    if (loadedUserIdRef.current && loadedUserIdRef.current !== activeSession.userId) {
      log.log(
        'session changed from',
        loadedUserIdRef.current,
        '→',
        activeSession.userId,
        '— reloading client'
      );
      pushSessionToSW(activeSession.baseUrl, activeSession.accessToken);
      if (mx?.clientRunning) {
        stopClient(mx);
      }
      setLoading(true);
      loadedUserIdRef.current = undefined;
      setLoadState({ status: AsyncStatus.Idle });
      navigate(getHomePath(), { replace: true });
    }
  }, [activeSession, mx, navigate, setLoadState]);

  const handleLogout = useCallback(async () => {
    if (!mx || !activeSession) return;
    await logoutClient(mx, activeSession);
    setSessions({ type: 'DELETE', session: activeSession } as SessionsAction);
    const remaining = sessions.filter((s) => s.userId !== activeSession.userId);
    setActiveSessionId(remaining[0]?.userId ?? undefined);
    window.location.reload();
  }, [mx, activeSession, sessions, setSessions, setActiveSessionId]);

  useSyncNicknames(mx);
  useLogoutListener(mx);
  useAppVisibility(mx);

  useEffect(
    () => () => {
      if (mx?.clientRunning) {
        log.log('ClientRoot unmounting — stopping client', mx.getUserId());
        stopClient(mx);
      }
    },
    [mx]
  );

  useEffect(() => {
    if (loadState.status === AsyncStatus.Idle) {
      loadMatrix();
    }
  }, [loadState, loadMatrix]);

  useEffect(() => {
    if (mx && !mx.clientRunning) {
      startMatrix(mx);
    }
  }, [mx, startMatrix]);

  useEffect(() => {
    if (!mx) return;
    if (isClientReady(mx.getSyncState())) {
      setLoading(false);
    }
  }, [mx]);

  useSyncState(
    mx,
    useCallback((state: string) => {
      if (isClientReady(state)) {
        if (!firstSyncReadyRef.current) {
          firstSyncReadyRef.current = true;
          Sentry.metrics.distribution(
            'sable.sync.time_to_ready_ms',
            performance.now() - syncStartTimeRef.current
          );
        }
        setLoading(false);
      }
    }, [])
  );

  // Set matrix client context: homeserver and sync type (not PII)
  useEffect(() => {
    if (!activeSession?.baseUrl) return undefined;
    Sentry.setContext('client', {
      homeserver: activeSession.baseUrl,
      sliding_sync: clientConfig.slidingSync,
    });
    return () => {
      Sentry.setContext('client', null);
    };
  }, [activeSession?.baseUrl, clientConfig.slidingSync]);

  // Set a pseudonymous hashed user ID for error grouping — never sends raw Matrix ID
  useEffect(() => {
    if (!mx) return undefined;
    const matrixUserId = mx.getUserId();
    if (!matrixUserId) return undefined;
    (async () => {
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(matrixUserId)
      );
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
      // Include the homeserver domain as a custom attribute — it is not PII (it is the
      // server domain, not a personal identifier) and helps segment issues by deployment.
      const serverDomain = matrixUserId.split(':')[1] ?? 'unknown';
      Sentry.setUser({ id: hashHex, homeserver: serverDomain });
    })();
    return () => {
      Sentry.setUser(null);
    };
  }, [mx]);

  // Capture fatal client failures — useAsyncCallback swallows these into state so
  // they never reach the React ErrorBoundary; explicit capture is required.
  useEffect(() => {
    if (loadState.status === AsyncStatus.Error) {
      Sentry.captureException(loadState.error, { tags: { phase: 'load' } });
    }
  }, [loadState]);

  useEffect(() => {
    if (startState.status === AsyncStatus.Error) {
      Sentry.captureException(startState.error, { tags: { phase: 'start' } });
    }
  }, [startState]);

  return (
    <AutoDiscovery userId={userId} baseUrl={baseUrl}>
      <SpecVersions baseUrl={baseUrl}>
        {mx && <SyncStatus mx={mx} />}
        {loading && <ClientRootOptions mx={mx} onLogout={handleLogout} />}
        {(loadState.status === AsyncStatus.Error || startState.status === AsyncStatus.Error) && (
          <SplashScreen>
            <Box
              direction="Column"
              grow="Yes"
              alignItems="Center"
              justifyContent="Center"
              gap="400"
            >
              <Dialog>
                <Box direction="Column" gap="400" style={{ padding: config.space.S400 }}>
                  {loadState.status === AsyncStatus.Error && (
                    <Text>{`Failed to load. ${loadState.error.message}`}</Text>
                  )}
                  {startState.status === AsyncStatus.Error && (
                    <Text>{`Failed to start. ${startState.error.message}`}</Text>
                  )}
                  <Button variant="Critical" onClick={mx ? () => startMatrix(mx) : loadMatrix}>
                    <Text as="span" size="B400">
                      Retry
                    </Text>
                  </Button>
                </Box>
              </Dialog>
            </Box>
          </SplashScreen>
        )}
        {loading || !mx ? (
          <ClientRootLoading />
        ) : (
          <MatrixClientProvider value={mx}>
            <ServerConfigsLoader>
              {(serverConfigs) => (
                <CapabilitiesProvider value={serverConfigs.capabilities ?? {}}>
                  <MediaConfigProvider value={serverConfigs.mediaConfig ?? {}}>
                    <AuthMetadataProvider value={serverConfigs.authMetadata}>
                      {children}
                    </AuthMetadataProvider>
                  </MediaConfigProvider>
                </CapabilitiesProvider>
              )}
            </ServerConfigsLoader>
          </MatrixClientProvider>
        )}
      </SpecVersions>
    </AutoDiscovery>
  );
}
