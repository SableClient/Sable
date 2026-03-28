import { RouterProvider } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';

import { ClientConfigLoader } from '$components/ClientConfigLoader';
import { AppShell } from '$components/app-shell';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { setMatrixToBase } from '$plugins/matrix-to';
import { useScreenSize } from '$hooks/useScreenSize';
import { useCompositionEndTracking } from '$hooks/useComposingCheck';
import { ErrorPage } from '$components/DefaultErrorPage';
import { ConfigConfigError, ConfigConfigLoading } from './ConfigConfig';
import { FeatureCheck } from './FeatureCheck';
import { createRouter } from './Router';

const queryClient = new QueryClient();

function App() {
  const screenSize = useScreenSize();
  useCompositionEndTracking();

  return (
    <Sentry.ErrorBoundary
      fallback={({ error, eventId }) => (
        <ErrorPage
          error={error instanceof Error ? error : new Error(String(error))}
          eventId={eventId || undefined}
        />
      )}
    >
      <AppShell screenSize={screenSize} queryClient={queryClient}>
        <FeatureCheck>
          <ClientConfigLoader
            fallback={() => <ConfigConfigLoading />}
            error={(err, retry, ignore) => (
              <ConfigConfigError error={err} retry={retry} ignore={ignore} />
            )}
          >
            {(clientConfig) => {
              setMatrixToBase(clientConfig.matrixToBaseUrl);
              return (
                <ClientConfigProvider value={clientConfig}>
                  <RouterProvider router={createRouter(clientConfig, screenSize)} />
                </ClientConfigProvider>
              );
            }}
          </ClientConfigLoader>
        </FeatureCheck>
      </AppShell>
    </Sentry.ErrorBoundary>
  );
}

export default App;
