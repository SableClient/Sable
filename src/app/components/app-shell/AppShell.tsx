import { type ReactNode, Suspense, lazy, useState } from 'react';
import { Provider as JotaiProvider } from 'jotai';
import type { createStore } from 'jotai/vanilla';
import { OverlayContainerProvider, PopOutContainerProvider, TooltipContainerProvider } from 'folds';
import { QueryClientProvider } from '@tanstack/react-query';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

import { DesktopSpellcheck } from '$components/tauri/DesktopSpellcheck';
import { TauriFrontendReady } from '$components/tauri/TauriFrontendReady';
import { TauriWindowFocus } from '$components/tauri/TauriWindowFocus';
import { DesktopTitleBar } from '$components/tauri/DesktopTitleBar';
import { MacTitleBar } from '$components/tauri/MacTitleBar';
import { DesktopUpdater } from '$pages/client/DesktopUpdater';
import { WebUpdater } from '$pages/client/WebUpdater';
import { GlobalBannerRenderer } from '$components/global-banner/GlobalBannerRenderer';
import { Toast } from '$components/toast/Toast';
import { ConfirmHost } from '$components/confirm/ConfirmHost';
import { OverlayStackProvider } from '$components/overlay-stack';
import type { ScreenSize } from '$hooks/useScreenSize';
import { ScreenSizeProvider } from '$hooks/useScreenSize';
import { isReactQueryDevtoolsEnabled } from '$pages/reactQueryDevtoolsGate';
import { useDesktopSetting } from '$state/hooks/desktopSettings';
import { getCustomTitlebarKind } from '$utils/tauriTitlebar';
import { getCspNonce } from '$utils/cspNonce';
import { SystemBarShell } from './SystemBarShell';

const ReactQueryDevtools = lazy(async () => {
  const { ReactQueryDevtools: Devtools } = await import('@tanstack/react-query-devtools');

  return { default: Devtools };
});

type AppShellProps = {
  children: ReactNode;
  queryClient: Parameters<typeof QueryClientProvider>[0]['client'];
  screenSize: ScreenSize;
  jotaiStore?: ReturnType<typeof createStore>;
};

export function AppShell({ children, queryClient, screenSize, jotaiStore }: AppShellProps) {
  const reactQueryDevtoolsEnabled = isReactQueryDevtoolsEnabled();
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  return (
    <TooltipContainerProvider value={portalContainer ?? undefined}>
      <PopOutContainerProvider value={portalContainer ?? undefined}>
        <OverlayContainerProvider value={portalContainer ?? undefined}>
          <OverlayStackProvider>
            <ScreenSizeProvider value={screenSize}>
              <QueryClientProvider client={queryClient}>
                <JotaiProvider store={jotaiStore}>
                  <AppShellFrame
                    portalContainer={portalContainer}
                    onPortalContainerChange={setPortalContainer}
                  >
                    {children}
                  </AppShellFrame>
                </JotaiProvider>
                {reactQueryDevtoolsEnabled && (
                  <Suspense fallback={null}>
                    <ReactQueryDevtools
                      initialIsOpen={false}
                      styleNonce={getCspNonce() || undefined}
                    />
                  </Suspense>
                )}
              </QueryClientProvider>
            </ScreenSizeProvider>
          </OverlayStackProvider>
        </OverlayContainerProvider>
      </PopOutContainerProvider>
    </TooltipContainerProvider>
  );
}

type AppShellFrameProps = {
  children: ReactNode;
  portalContainer: HTMLDivElement | null;
  onPortalContainerChange: (node: HTMLDivElement | null) => void;
};

function AppShellFrame({ children, portalContainer, onPortalContainerChange }: AppShellFrameProps) {
  const [useCustomTitleBar] = useDesktopSetting('useCustomTitleBar');
  const tauriOs = isTauri() ? osType() : undefined;
  const titlebarKind = getCustomTitlebarKind(useCustomTitleBar, tauriOs);
  const contentHeight = titlebarKind ? 'calc(100% - var(--tauri-titlebar-height))' : '100%';

  return (
    <>
      <TauriFrontendReady />
      <TauriWindowFocus />
      <DesktopSpellcheck />
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
        {titlebarKind === 'desktop' && <DesktopTitleBar />}
        {titlebarKind === 'mac' && <MacTitleBar />}
        <DesktopUpdater />
        <WebUpdater />
        <GlobalBannerRenderer />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            minHeight: 0,
            height: contentHeight,
          }}
        >
          <SystemBarShell onPortalContainerChange={onPortalContainerChange}>
            {children}
          </SystemBarShell>
          <Toast container={portalContainer} />
          <ConfirmHost container={portalContainer} />
        </div>
      </div>
    </>
  );
}
