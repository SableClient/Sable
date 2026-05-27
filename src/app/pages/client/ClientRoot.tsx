import type { RectCords } from 'folds';
import {
  Box,
  Button,
  config,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  MenuItem,
  PopOut,
  Spinner,
  Text,
} from 'folds';
import type { HttpApiEventHandlerMap, MatrixClient } from '$types/matrix-sdk';
import { HttpApiEvent } from '$types/matrix-sdk';
import FocusTrap from 'focus-trap-react';
import type { MouseEventHandler, ReactNode } from 'react';
import { useRef, useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  clearCacheAndReload,
  clearLoginData,
  clearMismatchedStores,
  getSlidingSyncManager,
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
import { MediaUrlCacheProvider } from '$hooks/useMediaUrlCacheContext';
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
import { getLandingPath, rememberLastVisitedPath } from '$pages/pathUtils';
import { useClientConfig } from '$hooks/useClientConfig';
import { getSettings } from '$state/settings';
import { pushSessionToSW } from '../../../sw-session';
import { useSwUpdateAvailable } from '$hooks/useSwUpdateAvailable';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SyncStatus } from './SyncStatus';
import { SpecVersions } from './SpecVersions';
import { AutoDiscovery } from './AutoDiscovery';
import { ContainerColor } from '$styles/ContainerColor.css';

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
        top: `calc(env(safe-area-inset-top, 0px) + ${config.space.S100})`,
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
  const navigate = useNavigate();
  const location = useLocation();
  const clientConfig = useClientConfig();
  const sessions = useAtomValue(sessionsAtom);
  const [activeSessionId, setActiveSessionId] = useAtom(activeSessionIdAtom);
  const setSessions = useSetAtom(sessionsAtom);
  const [defaultLandingScreen] = useSetting(settingsAtom, 'defaultLandingScreen');

  const activeSession: Session | undefined =
    sessions.find((s) => s.userId === activeSessionId) ?? sessions[0];

  const { baseUrl, userId } = activeSession ?? {};

  const loadedUserIdRef = useRef<string | undefined>(undefined);
  const syncStartTimeRef = useRef(performance.now());
  const firstSyncReadyRef = useRef(false);

  const [loading, setLoading] = useState(true);

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
      pushSessionToSW(activeSession.baseUrl, activeSession.accessToken, activeSession.userId);
      return newMx;
    }, [activeSession, activeSessionId, setActiveSessionId])
  );

  const mx = loadState.status === AsyncStatus.Success ? loadState.data : undefined;

  const [startState, startMatrix] = useAsyncCallback<void, Error, [MatrixClient]>(
    useCallback(
      (m) => {
        const s = getSettings();
        const needsPreviewTimeline = s.dmMessagePreview || s.roomMessagePreview;
        return startClient(m, {
          baseUrl: activeSession?.baseUrl,
          slidingSync: {
            ...clientConfig.slidingSync,
            listTimelineLimit: needsPreviewTimeline ? 20 : undefined,
          },
          sessionSlidingSyncOptIn: activeSession?.slidingSyncOptIn,
        });
      },
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
      pushSessionToSW(activeSession.baseUrl, activeSession.accessToken, activeSession.userId);
      if (mx?.clientRunning) {
        stopClient(mx);
      }
      loadedUserIdRef.current = undefined;
      setLoading(true);
      setLoadState({ status: AsyncStatus.Idle });
      navigate(getLandingPath(defaultLandingScreen), { replace: true });
    }
  }, [activeSession, mx, navigate, setLoadState, defaultLandingScreen]);

  // Remember the last visited path so we can restore it on next app open
  // if the user has selected "Last Visited" as their landing screen preference
  useEffect(() => {
    rememberLastVisitedPath(location.pathname);
  }, [location.pathname]);

  const handleLogout = useCallback(async () => {
    if (!mx || !activeSession) return;
    await logoutClient(mx, activeSession);
    setSessions({ type: 'DELETE', session: activeSession } as SessionsAction);
    setActiveSessionId(
      sessions.find((s) => s.userId !== activeSession.userId)?.userId ?? undefined
    );
    window.location.reload();
  }, [mx, activeSession, sessions, setSessions, setActiveSessionId]);

  useSyncNicknames(mx);
  useLogoutListener(mx);
  useAppVisibility(mx);
  const swUpdateAvailable = useSwUpdateAvailable();

  // Keep the SW session warm so media fetches and push notifications work
  // reliably after iOS kills and restarts the SW in the background.
  // - Immediate resync whenever the tab comes back to the foreground.
  // - Periodic heartbeat (10 min) keeps the persisted session up to date
  //   while the app is running.
  const swSessionBaseUrl = activeSession?.baseUrl;
  const swSessionAccessToken = activeSession?.accessToken;
  const swSessionUserId = activeSession?.userId;
  useEffect(() => {
    if (!swSessionBaseUrl || !swSessionAccessToken) return undefined;
    const resync = () => pushSessionToSW(swSessionBaseUrl, swSessionAccessToken, swSessionUserId);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') resync();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const timer = setInterval(resync, 10 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(timer);
    };
  }, [swSessionBaseUrl, swSessionAccessToken, swSessionUserId]);

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

  // Helper to check if the app is fully ready: sync must be in a ready state,
  // and for sliding sync, either we have warm cache (show immediately) or
  // all room lists must be fully loaded to prevent rooms from appearing in
  // wrong positions or spaces as the list expands.
  const checkReadyAndClearSplash = useCallback(
    (state: string | null) => {
      if (!state || !isClientReady(state)) return;

      const slidingSyncManager = mx ? getSlidingSyncManager(mx) : undefined;
      if (slidingSyncManager) {
        const hasWarm = slidingSyncManager.hasWarmCache();
        const isFullyLoaded = slidingSyncManager.isFullyLoaded();
        const hasSufficient = slidingSyncManager.hasSufficientRoomsLoaded();
        const roomCount = mx?.getRooms().length ?? 0;

        log.log('[startup] checkReady:', {
          state,
          hasWarmCache: hasWarm,
          isFullyLoaded,
          hasSufficientRooms: hasSufficient,
          roomCount,
          elapsed: `${(performance.now() - syncStartTimeRef.current).toFixed(0)}ms`,
        });

        // Strategy 1 + 4: If we have warm cache, show cached rooms immediately
        // while sync continues in background (parallel loading)
        if (hasWarm) {
          log.log('[startup] showing UI immediately (warm cache)');
          setLoading(false);
          if (!firstSyncReadyRef.current) {
            firstSyncReadyRef.current = true;
            Sentry.metrics.distribution(
              'sable.startup.time_to_ui_ms',
              performance.now() - syncStartTimeRef.current,
              { attributes: { cache_type: 'warm' } }
            );
          }
          return;
        }
        // Cold cache: wait for full load to prevent visual jumping
        // Strategy 8: Use "sufficient rooms" threshold for faster initial display
        if (!isFullyLoaded && !hasSufficient) {
          log.log('[startup] waiting for more rooms (cold cache)');
          return;
        }
        log.log('[startup] showing UI (cold cache, sufficient rooms loaded)');
      }

      setLoading(false);
      if (!firstSyncReadyRef.current) {
        firstSyncReadyRef.current = true;
        Sentry.metrics.distribution(
          'sable.startup.time_to_ui_ms',
          performance.now() - syncStartTimeRef.current,
          { attributes: { cache_type: 'cold' } }
        );
      }
    },
    [mx]
  );

  useEffect(() => {
    if (!mx) return;
    checkReadyAndClearSplash(mx.getSyncState());
  }, [mx, checkReadyAndClearSplash]);

  // Wait for the first sync response before hiding the splash, even if cached rooms
  // exist. This prevents rooms from visibly jumping between spaces as the sort order
  // stabilizes during the first few sync cycles. For sliding sync, we also wait until
  // all room lists are fully loaded to ensure stable positioning.
  useSyncState(mx, checkReadyAndClearSplash);

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

  const hasClientRootError =
    loadState.status === AsyncStatus.Error || startState.status === AsyncStatus.Error;

  return (
    <AutoDiscovery userId={userId ?? ''} baseUrl={baseUrl ?? ''}>
      <SpecVersions baseUrl={baseUrl ?? ''}>
        {swUpdateAvailable && (
          <Box direction="Column" shrink="No">
            <Box
              as="button"
              type="button"
              className={ContainerColor({ variant: 'Primary' })}
              style={{
                padding: `${config.space.S100} 0`,
                width: '100%',
                cursor: 'pointer',
                border: 'none',
                background: 'none',
              }}
              alignItems="Center"
              justifyContent="Center"
              onClick={() => window.location.reload()}
            >
              <Text size="L400">Update available — tap to reload</Text>
            </Box>
            <Line variant="Primary" size="300" />
          </Box>
        )}
        {mx && <SyncStatus mx={mx} />}
        {(loading || !mx) && <ClientRootOptions mx={mx} onLogout={handleLogout} />}
        {hasClientRootError ? (
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
        ) : loading || !mx ? (
          <ClientRootLoading />
        ) : (
          <MatrixClientProvider value={mx}>
            <MediaUrlCacheProvider>
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
            </MediaUrlCacheProvider>
          </MatrixClientProvider>
        )}
      </SpecVersions>
    </AutoDiscovery>
  );
}
