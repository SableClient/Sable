import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow, type Window } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { type as osType } from '@tauri-apps/plugin-os';
import { useAtomValue } from 'jotai';
import { createLogger } from '$utils/debug';
import { titlebarStatusAtom } from '$state/titlebarStatus';
import { SyncConnectionStatusTitlebar } from '$components/SyncConnectionStatus';
import {
  hideSnapOverlay as hideSnapOverlayCommand,
  showSnapOverlay as showSnapOverlayCommand,
  startWindowTrackingWithTarget,
  stopWindowTracking,
} from '$generated/tauri/commands';

const log = createLogger('WindowsTitleBar');
const SNAP_OVERLAY_DELAY_MS = 620;
const SNAP_POPUP_WINDOW_CLASS = 'Xaml_WindowedPopupClass';
const SNAP_POPUP_EXE = 'explorer.exe';

type TrackingEventType = 'Started' | 'TargetLost' | 'Timeout' | 'Stopped';
type TrackingEventPayload = {
  event_type: TrackingEventType;
};

function MinimizeIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      shapeRendering="crispEdges"
    >
      <path d="M1.5 6.5h9" strokeLinecap="square" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      shapeRendering="crispEdges"
    >
      <rect x="1.5" y="1.5" width="9" height="9" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      shapeRendering="crispEdges"
    >
      <rect x="1.5" y="3.5" width="7" height="7" />
      <path d="M3.5 1.5h5a2 2 0 0 1 2 2v5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      shapeRendering="crispEdges"
    >
      <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" strokeLinecap="square" />
    </svg>
  );
}

export function WindowsTitleBar() {
  const [maximized, setMaximized] = useState(false);
  const appWindowRef = useRef<Window | null>(null);
  const snapTimerRef = useRef<number | undefined>(undefined);
  const isWindowsDesktopTauri = isTauri() && osType() === 'windows';
  const titlebarStatus = useAtomValue(titlebarStatusAtom);

  const hideSnapOverlay = async () => {
    try {
      await hideSnapOverlayCommand();
    } catch (error) {
      log.warn('Failed to hide snap overlay:', error);
    }
  };

  useEffect(() => {
    if (!isWindowsDesktopTauri) return undefined;

    const appWindow = getCurrentWindow();
    appWindowRef.current = appWindow;

    let mounted = true;
    let unlistenResize: (() => void) | undefined;
    let unlistenTracking: (() => void) | undefined;

    const syncMaximized = async () => {
      try {
        const isMaximizedState = await appWindow.isMaximized();
        if (mounted) setMaximized(isMaximizedState);
      } catch (error) {
        log.warn('Failed to sync maximized state:', error);
      }
    };

    syncMaximized().catch((error) => {
      log.warn('Failed to sync maximized state:', error);
    });
    appWindow
      .onResized(() => {
        syncMaximized().catch((error) => {
          log.warn('Failed to sync maximized state:', error);
        });
      })
      .then((removeListener) => {
        unlistenResize = removeListener;
      })
      .catch((error) => {
        log.warn('Failed to subscribe to window resize:', error);
      });

    listen<TrackingEventPayload>('window-tracking', (event) => {
      const eventType = event.payload?.event_type;
      if (eventType === 'TargetLost' || eventType === 'Timeout') {
        hideSnapOverlay();
      }
    })
      .then((removeListener) => {
        unlistenTracking = removeListener;
      })
      .catch((error) => {
        log.warn('Failed to subscribe to window-tracking event:', error);
      });

    return () => {
      mounted = false;
      if (snapTimerRef.current !== undefined) {
        window.clearTimeout(snapTimerRef.current);
      }
      stopWindowTracking().catch(() => {});
      hideSnapOverlay();
      unlistenResize?.();
      unlistenTracking?.();
    };
  }, [isWindowsDesktopTauri]);

  if (!isWindowsDesktopTauri) return null;

  const minimize = () => {
    if (!isWindowsDesktopTauri) return;

    stopWindowTracking().catch(() => {});
    hideSnapOverlay();
    appWindowRef.current?.minimize().catch((error) => {
      log.warn('Failed to minimize window:', error);
    });
  };

  const toggleMaximize = () => {
    if (!isWindowsDesktopTauri) return;

    if (snapTimerRef.current !== undefined) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
    }

    stopWindowTracking().catch(() => {});
    hideSnapOverlay();
    appWindowRef.current?.toggleMaximize().catch((error) => {
      log.warn('Failed to toggle maximize:', error);
    });
  };

  const close = () => {
    if (!isWindowsDesktopTauri) return;

    stopWindowTracking().catch(() => {});
    hideSnapOverlay();
    appWindowRef.current?.close().catch((error) => {
      log.warn('Failed to close window:', error);
    });
  };

  const showSnapOverlay = () => {
    if (!isWindowsDesktopTauri) return;

    if (snapTimerRef.current !== undefined) {
      window.clearTimeout(snapTimerRef.current);
    }
    stopWindowTracking().catch(() => {});

    snapTimerRef.current = window.setTimeout(() => {
      appWindowRef.current
        ?.setFocus()
        .then(() => showSnapOverlayCommand())
        .catch((error) => {
          log.warn('Failed to show snap overlay:', error);
        });
    }, SNAP_OVERLAY_DELAY_MS);
  };

  const cancelSnapOverlay = () => {
    if (!isWindowsDesktopTauri) return;

    if (snapTimerRef.current !== undefined) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
    }

    stopWindowTracking()
      .then(() =>
        startWindowTrackingWithTarget({
          target: {
            window_class: SNAP_POPUP_WINDOW_CLASS,
            exe_name: SNAP_POPUP_EXE,
          },
        })
      )
      .catch((error) => {
        log.warn('Failed to start snap popup tracking:', error);
      });
  };

  return (
    <nav className="tauri-titlebar">
      <div className="tauri-titlebar__drag" data-tauri-drag-region>
        <span className="tauri-titlebar__title" data-tauri-drag-region>
          sable
        </span>
      </div>
      <div className="tauri-titlebar__status" data-tauri-drag-region>
        <SyncConnectionStatusTitlebar status={titlebarStatus} />
      </div>

      <div className="tauri-titlebar__controls">
        <button
          type="button"
          className="tauri-titlebar__control"
          onClick={minimize}
          aria-label="Minimize"
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          className="tauri-titlebar__control"
          onClick={toggleMaximize}
          onMouseEnter={showSnapOverlay}
          onMouseLeave={cancelSnapOverlay}
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          className="tauri-titlebar__control tauri-titlebar__control--close"
          onClick={close}
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      </div>
    </nav>
  );
}
