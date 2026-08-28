import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { Update } from '@tauri-apps/plugin-updater';
import { isDesktopTauri, isDesktopUpdaterEnabled } from '$utils/platform';
import { autoUpdateCheckAtom } from '$state/autoUpdateCheck';
import { createLogger } from '$utils/debug';
import { getDebugLogger } from '$utils/debugLogger';
import { hasCustomDesktopTitlebar } from '$utils/tauriTitlebar';
import { useDesktopSetting } from '$state/hooks/desktopSettings';
import { ArrowUp } from '$components/icons/phosphor';
import { useRegisterGlobalBanner, type GlobalBanner } from '$state/globalBanners';
import {
  updatePhaseAtom,
  updateBannerVisibleAtom,
  triggerUpdateCheckAtom,
  desktopUpdateLastCheckedAtom,
  fakeDesktopUpdate,
} from '$state/desktopUpdate';

const log = createLogger('DesktopUpdater');
const UPDATE_POLL_INTERVAL_MS = 300_000; // 5 minutes

const getUpdaterErrorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : String(error);

const logUpdaterError = (message: string, error: unknown): void => {
  log.error(message, error);
  getDebugLogger().log(
    'error',
    'network',
    'DesktopUpdater',
    `${message}: ${getUpdaterErrorMessage(error)}`
  );
};

export function DesktopUpdater() {
  const autoUpdateCheck = useAtomValue(autoUpdateCheckAtom);
  const triggerCount = useAtomValue(triggerUpdateCheckAtom);
  const setPhase = useSetAtom(updatePhaseAtom);
  const [bannerVisible, setBannerVisible] = useAtom(updateBannerVisibleAtom);
  const setLastChecked = useSetAtom(desktopUpdateLastCheckedAtom);
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [useCustomTitleBar] = useDesktopSetting('useCustomTitleBar');
  const hasUpdateRef = useRef(false);
  const runningRef = useRef(false);
  const pendingUpdateRef = useRef<Update | null>(null);
  const installStartedRef = useRef(false);

  const closePendingUpdate = useCallback((update: Update | null) => {
    if (!update || fakeDesktopUpdate()) return;
    void update.close().catch((err) => log.error('Failed to release desktop update', err));
  }, []);

  useEffect(() => {
    if (!isDesktopUpdaterEnabled()) return undefined;
    if (!isDesktopTauri()) return undefined;
    if (triggerCount === 0 && !autoUpdateCheck && !fakeDesktopUpdate()) return undefined;

    let mounted = true;

    if (!installStartedRef.current) {
      setPhase({ type: 'checking' });
    }

    async function run() {
      if (runningRef.current || installStartedRef.current) return;
      runningRef.current = true;
      try {
        if (fakeDesktopUpdate()) {
          log.log('Fake update: simulating available update');
          setUpdateInfo({ version: '9.9.9', body: 'Fake changelog for testing.' } as Update);
          setPhase({ type: 'ready', version: '9.9.9' });
          setLastChecked(new Date().toISOString());
          if (!hasCustomDesktopTitlebar(useCustomTitleBar)) setBannerVisible(true);
          return;
        }

        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (!mounted) {
          closePendingUpdate(update);
          return;
        }

        if (!update) {
          closePendingUpdate(pendingUpdateRef.current);
          pendingUpdateRef.current = null;
          setUpdateInfo(null);
          hasUpdateRef.current = false;
          setPhase({ type: 'idle' });
          setLastChecked(new Date().toISOString());
          return;
        }

        closePendingUpdate(pendingUpdateRef.current);
        pendingUpdateRef.current = update;
        log.log(`Desktop update ${update.version} available`);
        setUpdateInfo(update);
        setIsInstalled(false);
        setDismissed(false);
        hasUpdateRef.current = true;
        setPhase({ type: 'ready', version: update.version });
        setLastChecked(new Date().toISOString());
        if (!hasCustomDesktopTitlebar(useCustomTitleBar)) setBannerVisible(true);
      } catch (err) {
        logUpdaterError('Desktop update check failed', err);
        if (mounted) {
          if (!hasUpdateRef.current) {
            setPhase({ type: 'idle' });
          }
          setLastChecked(new Date().toISOString());
        }
      } finally {
        runningRef.current = false;
      }
    }

    run();

    if (autoUpdateCheck) {
      const interval = setInterval(run, UPDATE_POLL_INTERVAL_MS);
      return () => {
        mounted = false;
        clearInterval(interval);
        if (!installStartedRef.current) {
          closePendingUpdate(pendingUpdateRef.current);
          pendingUpdateRef.current = null;
        }
      };
    }

    return () => {
      mounted = false;
      if (!installStartedRef.current) {
        closePendingUpdate(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }
    };
  }, [
    autoUpdateCheck,
    triggerCount,
    setPhase,
    setBannerVisible,
    setLastChecked,
    useCustomTitleBar,
    closePendingUpdate,
  ]);

  useEffect(() => {
    if (bannerVisible && dismissed) {
      setDismissed(false);
    }
  }, [bannerVisible, dismissed]);

  const handleInstall = useCallback(async () => {
    if (!updateInfo || installStartedRef.current) return;
    installStartedRef.current = true;
    try {
      setInstallError(null);
      setIsDownloading(true);
      setPhase({ type: 'downloading', progress: 0 });

      if (fakeDesktopUpdate()) {
        for (let pct = 0; pct <= 100; pct += 2) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 40));
          setPhase({ type: 'downloading', progress: pct });
        }
      } else {
        let downloadedBytes = 0;
        let contentLength = 0;
        await updateInfo.downloadAndInstall((event) => {
          if (event.event === 'Started') {
            contentLength = event.data.contentLength ?? 0;
          } else if (event.event === 'Progress') {
            downloadedBytes += event.data.chunkLength;
            const pct = contentLength > 0 ? Math.round((downloadedBytes / contentLength) * 100) : 0;
            setPhase({ type: 'downloading', progress: Math.min(pct, 100) });
          }
        });
      }

      setIsDownloading(false);
      setIsInstalling(true);
      setPhase({ type: 'installing' });
      if (fakeDesktopUpdate()) await new Promise((r) => setTimeout(r, 1500));

      setPhase({ type: 'ready', version: updateInfo.version });
      setIsInstalling(false);
      setIsInstalled(true);
      pendingUpdateRef.current = null;
      closePendingUpdate(updateInfo);
    } catch (err) {
      logUpdaterError('Failed to install update', err);
      setInstallError(getUpdaterErrorMessage(err));
      setIsDownloading(false);
      setIsInstalling(false);
      setPhase({ type: 'ready', version: updateInfo.version });
      installStartedRef.current = false;
    }
  }, [closePendingUpdate, updateInfo, setPhase]);

  const handleRestart = useCallback(async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      log.error('Failed to relaunch after update', err);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setBannerVisible(false);
  }, [setBannerVisible]);

  const bannerData = useMemo<GlobalBanner | null>(() => {
    if (!isDesktopUpdaterEnabled()) return null;
    if (!bannerVisible || !updateInfo || dismissed) return null;

    if (isInstalled) {
      return {
        id: 'desktop-update-restart',
        priority: 200,
        icon: ArrowUp,
        title: 'Update Installed',
        description: `Sable ${updateInfo.version} has been installed. Restart the app to finish updating.`,
        primaryAction: {
          label: 'Restart Now',
          variant: 'Primary',
          onClick: handleRestart,
        },
        secondaryAction: {
          label: 'Later',
          variant: 'Secondary',
          onClick: handleDismiss,
        },
      };
    }

    if (installError) {
      return {
        id: 'desktop-update-ready',
        priority: 200,
        icon: ArrowUp,
        title: 'Update Failed',
        description: installError,
        primaryAction: {
          label: 'Retry',
          variant: 'Primary',
          onClick: handleInstall,
        },
        secondaryAction: {
          label: 'Later',
          variant: 'Secondary',
          onClick: handleDismiss,
        },
      };
    }

    return {
      id: 'desktop-update-ready',
      priority: 200,
      icon: ArrowUp,
      title: 'Update Available',
      description: `Sable ${updateInfo.version} is available.${updateInfo.body ? `\n${updateInfo.body}` : ''}`,
      primaryAction: {
        label: isDownloading
          ? 'Downloading...'
          : isInstalling
            ? 'Installing...'
            : 'Download & Install',
        variant: 'Primary',
        onClick: handleInstall,
      },
      secondaryAction: {
        label: 'Later',
        variant: 'Secondary',
        onClick: handleDismiss,
      },
    };
  }, [
    bannerVisible,
    updateInfo,
    dismissed,
    isDownloading,
    isInstalled,
    isInstalling,
    installError,
    handleInstall,
    handleRestart,
    handleDismiss,
  ]);

  useRegisterGlobalBanner(bannerData);

  return null;
}
