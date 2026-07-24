import { lazy, Suspense, useCallback, useMemo, useRef } from 'react';
import { Provider as JotaiProvider } from 'jotai';
import { createStore } from 'jotai/vanilla';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';

import { ClientConfigLoader } from '$components/ClientConfigLoader';
import type { ClientConfig } from '$hooks/useClientConfig';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { setMatrixToBase } from '$plugins/matrix-to';
import type { ScreenSize } from '$hooks/useScreenSize';
import { useScreenSize } from '$hooks/useScreenSize';
import { useCompositionEndTracking } from '$hooks/useComposingCheck';
import { ErrorPage } from '$components/DefaultErrorPage';
import { FeatureCheck } from './FeatureCheck';
import { createRouter } from './Router';
import { isReactQueryDevtoolsEnabled } from './reactQueryDevtoolsGate';
import { bootstrapSettingsStore } from '$state/settings';
import { AppShell } from '$components/app-shell';
import { normalizeOAuthCallbackUrl } from '$utils/oauthCallback';

const queryClient = new QueryClient();
const ReactQueryDevtools = lazy(async () => {
  const { ReactQueryDevtools: Devtools } = await import('@tanstack/react-query-devtools');

  return { default: Devtools };
});

type BootstrappedAppShellProps = {
  clientConfig: ClientConfig;
  screenSize: ScreenSize;
  jotaiStore: ReturnType<typeof createStore>;
};

function BootstrappedAppShell({ clientConfig, screenSize, jotaiStore }: BootstrappedAppShellProps) {
  normalizeOAuthCallbackUrl(clientConfig.hashRouter);
  bootstrapSettingsStore(jotaiStore, clientConfig.settingsDefaults);
  const router = useMemo(() => createRouter(clientConfig, screenSize), [clientConfig, screenSize]);
  const reactQueryDevtoolsEnabled = isReactQueryDevtoolsEnabled();

  return (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={jotaiStore}>
        <RouterProvider router={router} />
      </JotaiProvider>
      {reactQueryDevtoolsEnabled && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}

function renderSentryErrorFallback({ error, eventId }: { error: unknown; eventId: string | null }) {
  return (
    <ErrorPage
      error={error instanceof Error ? error : new Error(String(error))}
      eventId={eventId || undefined}
    />
  );
}

function App() {
  const screenSize = useScreenSize();
  useCompositionEndTracking();
  const jotaiStoreRef = useRef<ReturnType<typeof createStore>>();
  if (!jotaiStoreRef.current) {
    jotaiStoreRef.current = createStore();
  }

  const renderConfiguredApp = useCallback(
    (clientConfig: ClientConfig) => {
      setMatrixToBase(clientConfig.matrixToBaseUrl);
      return (
        <ClientConfigProvider value={clientConfig}>
          <BootstrappedAppShell
            clientConfig={clientConfig}
            screenSize={screenSize}
            jotaiStore={jotaiStoreRef.current!}
          />
        </ClientConfigProvider>
      );
    },
    [screenSize]
  );

  return (
    <Sentry.ErrorBoundary fallback={renderSentryErrorFallback}>
      <AppShell
        screenSize={screenSize}
        queryClient={queryClient}
        jotaiStore={jotaiStoreRef.current}
      >
        <FeatureCheck>
          <ClientConfigLoader>{renderConfiguredApp}</ClientConfigLoader>
        </FeatureCheck>
      </AppShell>
    </Sentry.ErrorBoundary>
  );
}

export default App;
