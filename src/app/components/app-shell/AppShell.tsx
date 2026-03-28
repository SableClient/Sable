import { type ReactNode, useState } from 'react';
import { Provider as JotaiProvider } from 'jotai';
import { OverlayContainerProvider, PopOutContainerProvider, TooltipContainerProvider } from 'folds';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

import { TauriFrontendReady } from '$components/tauri/TauriFrontendReady';
import { WindowsTitleBar } from '$components/tauri/WindowsTitleBar';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { SystemBarShell } from './SystemBarShell';

type AppShellProps = {
  children: ReactNode;
  queryClient: Parameters<typeof QueryClientProvider>[0]['client'];
  screenSize: ScreenSize;
};

export function AppShell({ children, queryClient, screenSize }: AppShellProps) {
  const tauriOs = isTauri() ? osType() : undefined;
  const useCustomWindowsTitleBar = tauriOs === 'windows';
  const contentHeight = useCustomWindowsTitleBar
    ? 'calc(100% - var(--tauri-titlebar-height))'
    : '100%';
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
                  {useCustomWindowsTitleBar && <WindowsTitleBar />}
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
                  </div>
                </div>
              </JotaiProvider>
              <ReactQueryDevtools initialIsOpen={false} />
            </QueryClientProvider>
          </ScreenSizeProvider>
        </OverlayContainerProvider>
      </PopOutContainerProvider>
    </TooltipContainerProvider>
  );
}
