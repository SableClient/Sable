import type { RectCords } from 'folds';
import { Box, Button, config, Dialog, IconButton, Menu, MenuItem, Spinner, Text } from 'folds';
import { PopOut } from '$components/overlay-stack';
import type { MatrixClient } from '$types/matrix-sdk';
import { HttpApiEvent } from '$types/matrix-sdk';
import FocusTrap from 'focus-trap-react';
import type { MouseEventHandler, ReactNode } from 'react';
import { useRef, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import * as Sentry from '@sentry/react';
import { matchPath, useLocation, useNavigate } from 'react-router';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  clearCacheAndReload,
  clearLoginData,
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
import { useCrossSigningResetDetect } from '$hooks/useCrossSigningResetDetect';
import { useDeviceDisplayName } from '$hooks/useDeviceDisplayName';
import { useMatrixEvent } from '$hooks/useMatrixEvent';
import { stopPropagation } from '$utils/keyboard';
import { AuthMetadataProvider, getSessionAuthMetadata } from '$hooks/useAuthMetadata';
import {
  sessionsAtom,
  activeSessionIdAtom,
  getSessionStoreName,
  type Session,
  type SessionsAction,
} from '$state/sessions';
import { createLogger } from '$utils/debug';
import { useSyncNicknames } from '$hooks/useNickname';
import { useAppVisibility } from '$hooks/useAppVisibility';
import { useNetworkRecovery } from '$hooks/useNetworkRecovery';
import { useLoopbackMediaRecovery } from '$hooks/useLoopbackMediaRecovery';
import { useBackgroundSyncPause } from '$hooks/useBackgroundSyncPause';
import { composerIcon, DotsThreeOutlineVerticalIcon } from '$components/icons/phosphor';
import { getHomePath } from '$pages/pathUtils';
import { DIRECT_ROOM_PATH, HOME_ROOM_PATH, SPACE_ROOM_PATH } from '$pages/paths';
import { getCanonicalAliasRoomId, isRoomAlias, isRoomId } from '$utils/matrix';
import { pushPersistedSessionToSW, pushSessionToSW } from '../../../sw-session';
import { SyncStatus } from './SyncStatus';
import { SpecVersions } from './SpecVersions';
import { AutoDiscovery } from './AutoDiscovery';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SYSTEM_BAR_REFRESH_EVENT } from '$components/app-shell/SystemBarShell';

const log = createLogger('ClientRoot');

const SESSION_SWITCH_KEY = 'sable-session-switch';

const isClientReady = (syncState: string | null): boolean =>
  syncState === 'PREPARED' || syncState === 'SYNCING' || syncState === 'CATCHUP';

const resolveLocalRoomId = (
  mx: MatrixClient,
  encodedRoomIdOrAlias?: string
): string | undefined => {
  if (!encodedRoomIdOrAlias) return undefined;
  try {
    const roomIdOrAlias = decodeURIComponent(encodedRoomIdOrAlias);
    if (isRoomId(roomIdOrAlias)) return roomIdOrAlias;
    if (isRoomAlias(roomIdOrAlias)) return getCanonicalAliasRoomId(mx, roomIdOrAlias);
  } catch {
    // Ignore malformed route values and let the normal router handle them.
  }
  return undefined;
};

function ClientRootLoading() {
  const sessions = useAtomValue(sessionsAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const setSessions = useSetAtom(sessionsAtom);

  const [showEasterEggs] = useSetting(settingsAtom, 'showEasterEggs');
  const [animalKind] = useSetting(settingsAtom, 'animalKind');

  const activeSession: Session | undefined =
    sessions.find((session) => session.userId === activeSessionId) ?? sessions[0];

  const usingSlidingSync = activeSession?.slidingSyncOptIn === true;

  const handleSwap = () => {
    if (!activeSession) return;

    setSessions({
      type: 'PUT',
      session: {
        ...activeSession,
        slidingSyncOptIn: !usingSlidingSync,
      },
    });

    window.location.reload();
  };

  const loadingAnimal = showEasterEggs && animalKind ? animalKind : 'cats';

  return (
    <SplashScreen>
      <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
        <Spinner variant="Secondary" size="600" />

        <Text>{`Petting ${loadingAnimal}`}</Text>

        {activeSession && (
          <Text
            as="button"
            type="button"
            onClick={handleSwap}
            size="T200"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'inherit',
              cursor: 'pointer',
              opacity: 0.7,
              textDecoration: 'underline',
            }}
          >
            {usingSlidingSync ? 'Swap to classic sync' : 'Swap to sliding sync'}
          </Text>
        )}
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
      aria-pressed={!!menuAnchor}
      onClick={handleToggle}
    >
      {composerIcon(DotsThreeOutlineVerticalIcon, {
        weight: menuAnchor ? 'fill' : 'regular',
      })}
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

const useLogoutListener = (mx?: MatrixClient, session?: Session) => {
  const handleLogout = useCallback(async () => {
    Sentry.addBreadcrumb({
      category: 'auth',
      message: 'Session forcibly logged out by server',
      level: 'warning',
    });
    Sentry.metrics.count('sable.auth.forced_logout', 1);
    if (mx) stopClient(mx);
    await mx?.clearStores(
      session ? { cryptoDatabasePrefix: getSessionStoreName(session).rustCryptoPrefix } : undefined
    );
    window.localStorage.clear();
    window.location.reload();
  }, [mx, session]);

  useMatrixEvent(mx, HttpApiEvent.SessionLoggedOut, handleLogout);
};

type ClientRootProps = {
  children: ReactNode;
};
export function ClientRoot({ children }: ClientRootProps) {
  const navigate = useNavigate();
  const location = useLocation();

  useLayoutEffect(() => {
    window.dispatchEvent(new Event(SYSTEM_BAR_REFRESH_EVENT));
  }, [location.key]);

  const sessions = useAtomValue(sessionsAtom);
  const [activeSessionId, setActiveSessionId] = useAtom(activeSessionIdAtom);
  const setSessions = useSetAtom(sessionsAtom);

  const activeSession: Session | undefined =
    sessions.find((s) => s.userId === activeSessionId) ?? sessions[0];

  const { baseUrl, userId } = activeSession ?? {};

  const loadedUserIdRef = useRef<string | undefined>(undefined);
  const syncStartTimeRef = useRef(performance.now());
  const firstSyncReadyRef = useRef(false);
  const [syncReadyClient, setSyncReadyClient] = useState<MatrixClient>();

  const [loadState, loadMatrix] = useAsyncCallback<MatrixClient, Error, []>(
    useCallback(async () => {
      if (!activeSession) {
        log.error('no session found');
        throw new Error('No session Found!');
      }
      if (activeSession.userId !== activeSessionId) {
        log.log('persisting activeSessionId →', activeSession.userId);
        setActiveSessionId(activeSession.userId);
      }
      log.log('initClient for', activeSession.userId);
      const newMx = await initClient(activeSession);
      loadedUserIdRef.current = activeSession.userId;
      // initClient may have refreshed the token; push the persisted session, not
      // the stale captured one.
      await pushPersistedSessionToSW(activeSession);
      return newMx;
    }, [activeSession, activeSessionId, setActiveSessionId])
  );

  const mx = loadState.status === AsyncStatus.Success ? loadState.data : undefined;

  const roomMatch =
    matchPath(HOME_ROOM_PATH, location.pathname) ??
    matchPath(DIRECT_ROOM_PATH, location.pathname) ??
    matchPath(SPACE_ROOM_PATH, location.pathname);
  const encodedInitialRoomIdOrAlias = roomMatch?.params.roomIdOrAlias;

  const [startState, startMatrix] = useAsyncCallback<void, Error, [MatrixClient]>(
    useCallback(
      (m) => {
        const initialRoomId = resolveLocalRoomId(m, encodedInitialRoomIdOrAlias);

        return startClient(m, {
          baseUrl: activeSession?.baseUrl,
          sessionSlidingSyncOptIn: activeSession?.slidingSyncOptIn,
          initialRoomIds: initialRoomId ? [initialRoomId] : undefined,
          onCachedRoomsLoaded: () => setSyncReadyClient(m),
        });
      },
      [activeSession?.baseUrl, activeSession?.slidingSyncOptIn, encodedInitialRoomIdOrAlias]
    )
  );

  // Closing the OlmMachine with calls still in flight corrupts the page-wide crypto
  // WASM heap, so reload instead to give the next account a fresh instance.
  useEffect(() => {
    if (!activeSession) return;
    if (!loadedUserIdRef.current || loadedUserIdRef.current === activeSession.userId) return;

    log.log(
      'session changed from',
      loadedUserIdRef.current,
      '→',
      activeSession.userId,
      '— reloading page'
    );
    loadedUserIdRef.current = undefined;
    window.sessionStorage.setItem(SESSION_SWITCH_KEY, activeSession.userId);

    pushSessionToSW(activeSession.baseUrl, activeSession.accessToken, activeSession.userId).finally(
      () => window.location.reload()
    );
  }, [activeSession]);

  // The reload keeps the previous account's route, which the new one cannot resolve.
  useEffect(() => {
    if (!window.sessionStorage.getItem(SESSION_SWITCH_KEY)) return;
    window.sessionStorage.removeItem(SESSION_SWITCH_KEY);
    navigate(getHomePath(), { replace: true });
  }, [navigate]);

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
  useLogoutListener(mx, activeSession);
  useAppVisibility(mx);
  useNetworkRecovery(mx);
  useBackgroundSyncPause(mx);
  useLoopbackMediaRecovery();
  useCrossSigningResetDetect(mx);
  useDeviceDisplayName(mx);

  useEffect(
    () => () => {
      if (mx) {
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
    firstSyncReadyRef.current = false;
    syncStartTimeRef.current = performance.now();

    if (!mx) {
      setSyncReadyClient(undefined);
      return;
    }

    if (isClientReady(mx.getSyncState())) {
      setSyncReadyClient(mx);
      firstSyncReadyRef.current = true;
    }
  }, [mx]);

  useSyncState(
    mx,
    useCallback(
      (state: string) => {
        if (isClientReady(state)) {
          setSyncReadyClient((current) => (current === mx ? current : mx));
          if (!firstSyncReadyRef.current) {
            firstSyncReadyRef.current = true;
            Sentry.metrics.distribution(
              'sable.sync.time_to_ready_ms',
              performance.now() - syncStartTimeRef.current
            );
          }
        }
      },
      [mx]
    )
  );

  const isError = loadState.status === AsyncStatus.Error || startState.status === AsyncStatus.Error;

  // Set matrix client context: homeserver and sync type (not PII)
  useEffect(() => {
    if (!activeSession?.baseUrl) return undefined;
    Sentry.setContext('client', {
      homeserver: activeSession.baseUrl,
      sliding_sync: activeSession.slidingSyncOptIn === true,
    });
    return () => {
      Sentry.setContext('client', null);
    };
  }, [activeSession?.baseUrl, activeSession?.slidingSyncOptIn]);

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
    <AutoDiscovery userId={userId ?? ''} baseUrl={baseUrl ?? ''}>
      {mx && <SyncStatus mx={mx} />}
      {(!mx || isError) && <ClientRootOptions mx={mx} onLogout={handleLogout} />}
      {isError && (
        <SplashScreen>
          <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
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
      {!mx ? (
        <ClientRootLoading />
      ) : isError ? null : (
        <MatrixClientProvider value={mx}>
          {!syncReadyClient ? (
            <ClientRootLoading />
          ) : (
            <SpecVersions baseUrl={baseUrl ?? ''}>
              <ServerConfigsLoader>
                {(serverConfigs) => (
                  <CapabilitiesProvider value={serverConfigs.capabilities ?? {}}>
                    <MediaConfigProvider value={serverConfigs.mediaConfig ?? {}}>
                      <AuthMetadataProvider
                        value={getSessionAuthMetadata(serverConfigs.authMetadata, activeSession)}
                      >
                        {children}
                      </AuthMetadataProvider>
                    </MediaConfigProvider>
                  </CapabilitiesProvider>
                )}
              </ServerConfigsLoader>
            </SpecVersions>
          )}
        </MatrixClientProvider>
      )}
    </AutoDiscovery>
  );
}
