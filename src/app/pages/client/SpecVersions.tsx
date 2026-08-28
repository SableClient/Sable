import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Box, Dialog, config, Text } from 'folds';
import { useAtomValue, useSetAtom } from 'jotai';
import { SpecVersionsLoader } from '$components/SpecVersionsLoader';
import { SpecVersionsProvider } from '$hooks/useSpecVersions';
import { SplashScreen } from '$components/splash-screen';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { logoutClient } from '$client/initMatrix';
import { activeSessionIdAtom, sessionsAtom, type Session } from '$state/sessions';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useClientConfig } from '$hooks/useClientConfig';
import type { SpecVersions } from '../../cs-api';
import { AsyncError } from '$components/AsyncError';
import { Button } from '$components/button';

const EMPTY_VERSIONS: SpecVersions = { versions: [] };

type HomeserverOfflineErrorProps = {
  baseUrl: string;
  onRetry: () => void;
};
function HomeserverOfflineError({ baseUrl, onRetry }: HomeserverOfflineErrorProps) {
  const mx = useMatrixClient();
  const sessions = useAtomValue(sessionsAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const setSessions = useSetAtom(sessionsAtom);
  const { disableAccountSwitcher } = useClientConfig();
  const [showAccounts, setShowAccounts] = useState(false);

  const activeSession =
    sessions.find((session) => session.userId === activeSessionId) ?? sessions[0];
  const otherSessions = disableAccountSwitcher
    ? []
    : sessions.filter((session) => session.userId !== activeSession?.userId);

  const handleSwitch = (session: Session) => {
    setActiveSessionId(session.userId);
  };

  const [logoutState, logout] = useAsyncCallback<void, Error, []>(
    useCallback(async () => {
      if (!activeSession) return;

      await logoutClient(mx, activeSession);
      setSessions({ type: 'DELETE', session: activeSession });
      setActiveSessionId(
        sessions.find((session) => session.userId !== activeSession.userId)?.userId
      );
      window.location.reload();
    }, [mx, activeSession, sessions, setSessions, setActiveSessionId])
  );

  const loggingOut = logoutState.status === AsyncStatus.Loading;

  return (
    <SplashScreen>
      <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
        <Dialog>
          <Box direction="Column" gap="400" style={{ padding: config.space.S400 }}>
            <Box direction="Column" gap="200">
              <Text size="H3">Homeserver Offline</Text>
              <Text size="T300" priority="400">
                We can&apos;t reach <strong>{baseUrl}</strong>. The homeserver may be down, or you
                may have a connection issue. Please try again.
              </Text>
            </Box>
            <Box direction="Column" gap="200">
              <Button variant="Critical" onClick={onRetry} fill="Soft" disabled={loggingOut}>
                <Text as="span" size="B400">
                  Retry
                </Text>
              </Button>
              {otherSessions.length > 0 && (
                <>
                  <Button
                    variant="Secondary"
                    fill="Soft"
                    onClick={() => setShowAccounts((visible) => !visible)}
                    aria-expanded={showAccounts}
                  >
                    <Text as="span" size="B400">
                      Switch account
                    </Text>
                  </Button>
                  {showAccounts && (
                    <Box direction="Column" gap="100">
                      {otherSessions.map((session) => (
                        <Button
                          key={session.userId}
                          variant="Secondary"
                          fill="None"
                          onClick={() => handleSwitch(session)}
                        >
                          <Text as="span" size="B300" truncate>
                            {session.userId}
                          </Text>
                        </Button>
                      ))}
                    </Box>
                  )}
                </>
              )}
              <Button
                variant="Critical"
                fill="None"
                onClick={logout}
                loading={loggingOut}
                spinnerVariant="Critical"
                spinnerSize="200"
              >
                <Text as="span" size="B400">
                  Logout
                </Text>
              </Button>
              <AsyncError state={logoutState} prefix="Failed to logout" />
            </Box>
          </Box>
        </Dialog>
      </Box>
    </SplashScreen>
  );
}

export function SpecVersions({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const mx = useMatrixClient();
  const loadVersions = useCallback(() => mx.getVersions(), [mx]);
  const renderChildren = useCallback(
    (versions: SpecVersions) => (
      <SpecVersionsProvider value={versions}>{children}</SpecVersionsProvider>
    ),
    [children]
  );

  const renderFallback = useCallback(
    () => <SpecVersionsProvider value={EMPTY_VERSIONS}>{children}</SpecVersionsProvider>,
    [children]
  );

  const renderError = useCallback(
    (_err: unknown, retry: () => void) => (
      <HomeserverOfflineError baseUrl={baseUrl} onRetry={retry} />
    ),
    [baseUrl]
  );

  return (
    <SpecVersionsLoader
      baseUrl={baseUrl}
      loadVersions={loadVersions}
      fallback={renderFallback}
      error={renderError}
    >
      {renderChildren}
    </SpecVersionsLoader>
  );
}
