import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { Box, Button, Dialog, config, Text } from 'folds';
import { SpecVersionsLoader } from '$components/SpecVersionsLoader';
import { SpecVersionsProvider } from '$hooks/useSpecVersions';
import { SplashScreen } from '$components/splash-screen';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { SpecVersions } from '../../cs-api';
import { AccountMenuOption } from './sidebar/UserMenuTab';

const EMPTY_VERSIONS: SpecVersions = { versions: [] };

type HomeserverOfflineErrorProps = {
  baseUrl: string;
  onRetry: () => void;
};
function HomeserverOfflineError({ baseUrl, onRetry }: HomeserverOfflineErrorProps) {
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
              <div style={{ position: 'relative' }}>
                <AccountMenuOption isMobile={true} showSeparator={false} />
              </div>
            </Box>
            <Button variant="Critical" onClick={onRetry} fill="Soft">
              <Text as="span" size="B400">
                Retry
              </Text>
            </Button>
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
