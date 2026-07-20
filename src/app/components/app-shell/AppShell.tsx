import { type ReactNode, Suspense, lazy, useState } from 'react';
import { Provider as JotaiProvider } from 'jotai';
import { OverlayContainerProvider, PopOutContainerProvider, TooltipContainerProvider } from 'folds';
import { QueryClientProvider } from '@tanstack/react-query';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

import { TauriFrontendReady } from '$components/tauri/TauriFrontendReady';
import { DesktopTitleBar } from '$components/tauri/DesktopTitleBar';
import { MacTitleBar } from '$components/tauri/MacTitleBar';
import { Toast } from '$components/toast/Toast';
import type { ScreenSize } from '$hooks/useScreenSize';
import { ScreenSizeProvider } from '$hooks/useScreenSize';
import { isReactQueryDevtoolsEnabled } from '$pages/reactQueryDevtoolsGate';
import { SystemBarShell } from './SystemBarShell';

const ReactQueryDevtools = lazy(async () => {
  const { ReactQueryDevtools: Devtools } = await import('@tanstack/react-query-devtools');

  return { default: Devtools };
});

type AppShellProps = {
  children: ReactNode;
  queryClient: Parameters<typeof QueryClientProvider>[0]['client'];
  screenSize: ScreenSize;
};

export function AppShell({ children, queryClient, screenSize }: AppShellProps) {
  const tauriOs = isTauri() ? osType() : undefined;
  const useDesktopTitleBar = tauriOs === 'windows' || tauriOs === 'linux';
  const useMacTitleBar = tauriOs === 'macos';
  const hasCustomTitleBar = useDesktopTitleBar || useMacTitleBar;
  const reactQueryDevtoolsEnabled = isReactQueryDevtoolsEnabled();
  const contentHeight = hasCustomTitleBar ? 'calc(100% - var(--tauri-titlebar-height))' : '100%';
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  return (
    <TooltipContainerProvider value={portalContainer ?? undefined}>
      <PopOutContainerProvider value={portalContainer ?? undefined}>
        <OverlayContainerProvider value={portalContainer ?? undefined}>
          <ScreenSizeProvider value={screenSize}>
            <QueryClientProvider client={queryClient}>
              <JotaiProvider>
                <TauriFrontendReady />
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    minHeight: 0,
                    overflow: 'hidden',
                    height: '100%',
                  }}
                >
                  {useDesktopTitleBar && <DesktopTitleBar />}
                  {useMacTitleBar && <MacTitleBar />}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      width: '100%',
                      minHeight: 0,
                      height: contentHeight,
                    }}
                  >
                    <SystemBarShell onPortalContainerChange={setPortalContainer}>
                      {children}
                    </SystemBarShell>
                    <Toast container={portalContainer} />
                  </div>
                </div>
              </JotaiProvider>
              {reactQueryDevtoolsEnabled && (
                <Suspense fallback={null}>
                  <ReactQueryDevtools initialIsOpen={false} />
                </Suspense>
              )}
            </QueryClientProvider>
          </ScreenSizeProvider>
        </OverlayContainerProvider>
      </PopOutContainerProvider>
    </TooltipContainerProvider>
  );
}
