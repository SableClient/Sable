import { Provider as JotaiProvider } from 'jotai';
import { OverlayContainerProvider, PopOutContainerProvider, TooltipContainerProvider } from 'folds';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import * as Sentry from '@sentry/react';

import { ClientConfigLoader } from '$components/ClientConfigLoader';
import { TauriFrontendReady } from '$components/tauri/TauriFrontendReady';
import { WindowsTitleBar } from '$components/tauri/WindowsTitleBar';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { setMatrixToBase } from '$plugins/matrix-to';
import { ScreenSizeProvider, useScreenSize } from '$hooks/useScreenSize';
import { useCompositionEndTracking } from '$hooks/useComposingCheck';
import { ErrorPage } from '$components/DefaultErrorPage';
import { ConfigConfigError, ConfigConfigLoading } from './ConfigConfig';
import { FeatureCheck } from './FeatureCheck';
import { createRouter } from './Router';

const queryClient = new QueryClient();

function App() {
  const screenSize = useScreenSize();
  useCompositionEndTracking();
  const useCustomWindowsTitleBar = isTauri() && osType() === 'windows';

  const portalContainer = document.getElementById('portalContainer') ?? undefined;

  return (
    <Sentry.ErrorBoundary
      fallback={({ error, eventId }) => (
        <ErrorPage
          error={error instanceof Error ? error : new Error(String(error))}
          eventId={eventId || undefined}
        />
      )}
    >
      <TooltipContainerProvider value={portalContainer}>
        <PopOutContainerProvider value={portalContainer}>
          <OverlayContainerProvider value={portalContainer}>
            <ScreenSizeProvider value={screenSize}>
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
                        <QueryClientProvider client={queryClient}>
                          <JotaiProvider>
                            <TauriFrontendReady />
                            {useCustomWindowsTitleBar && <WindowsTitleBar />}
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                width: '100%',
                                minHeight: 0,
                                height: useCustomWindowsTitleBar
                                  ? 'calc(100% - var(--tauri-titlebar-height))'
                                  : '100%',
                              }}
                            >
                              <RouterProvider router={createRouter(clientConfig, screenSize)} />
                            </div>
                          </JotaiProvider>
                          <ReactQueryDevtools initialIsOpen={false} />
                        </QueryClientProvider>
                      </ClientConfigProvider>
                    );
                  }}
                </ClientConfigLoader>
              </FeatureCheck>
            </ScreenSizeProvider>
          </OverlayContainerProvider>
        </PopOutContainerProvider>
      </TooltipContainerProvider>
    </Sentry.ErrorBoundary>
  );
}

export default App;
