import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { Box, Dialog, config, Text, Button, Spinner } from 'folds';
import { SpecVersionsLoader } from '$components/SpecVersionsLoader';
import { SpecVersionsProvider } from '$hooks/useSpecVersions';
import type { SpecVersions } from '$app/cs-api';
import { SplashScreen } from '$components/splash-screen';

function specVersionsFallback() {
  return (
    <SplashScreen>
      <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
        <Spinner variant="Secondary" size="600" />
        <Text>Connecting to server</Text>
      </Box>
    </SplashScreen>
  );
}

function specVersionsError(_err: unknown, retry: () => void, ignore: () => void) {
  return (
    <SplashScreen>
      <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
        <Dialog>
          <Box direction="Column" gap="400" style={{ padding: config.space.S400 }}>
            <Text>
              Failed to connect to homeserver. Either homeserver is down or your internet.
            </Text>
            <Button variant="Critical" onClick={retry}>
              <Text as="span" size="B400">
                Retry
              </Text>
            </Button>
            <Button variant="Critical" onClick={ignore} fill="Soft">
              <Text as="span" size="B400">
                Continue
              </Text>
            </Button>
          </Box>
        </Dialog>
      </Box>
    </SplashScreen>
  );
}

export function SpecVersions({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const renderChildren = useCallback(
    (versions: SpecVersions) => (
      <SpecVersionsProvider value={versions}>{children}</SpecVersionsProvider>
    ),
    [children]
  );

  return (
    <SpecVersionsLoader baseUrl={baseUrl} fallback={specVersionsFallback} error={specVersionsError}>
      {renderChildren}
    </SpecVersionsLoader>
  );
}
