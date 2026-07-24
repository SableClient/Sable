import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import type { Update } from '@tauri-apps/plugin-updater';
import { autoUpdateCheckAtom } from '$state/autoUpdateCheck';
import { createLogger } from '$utils/debug';
import { ArrowUp } from '$components/icons/phosphor';
import { useRegisterGlobalBanner, type GlobalBanner } from '$state/globalBanners';

const log = createLogger('DesktopUpdater');

const DESKTOP_TAURI_OS = new Set(['linux', 'macos', 'windows']);
const isDesktopTauri = (): boolean => isTauri() && DESKTOP_TAURI_OS.has(osType());

export function DesktopUpdater() {
  const autoUpdateCheck = useAtomValue(autoUpdateCheckAtom);
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isDesktopTauri()) return undefined;
    if (!autoUpdateCheck) return undefined;

    let isMounted = true;
    async function checkUpdate() {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (update && isMounted) {
          log.log(`Desktop update ${update.version} available`);
          setUpdateInfo(update);
        }
      } catch (err) {
        log.error('Desktop update check failed', err);
      }
    }

    checkUpdate();
    return () => {
      isMounted = false;
    };
  }, [autoUpdateCheck]);

  const handleInstall = useCallback(async () => {
    if (!updateInfo) return;
    try {
      setIsInstalling(true);
      await updateInfo.downloadAndInstall();
      setIsInstalling(false);
      setIsDownloaded(true);
    } catch (err) {
      log.error('Failed to download and install update', err);
      setIsInstalling(false);
    }
  }, [updateInfo]);

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
  }, []);

  const bannerData = useMemo<GlobalBanner | null>(() => {
    if (!updateInfo || dismissed) return null;

    if (isDownloaded) {
      return {
        id: 'desktop-update-restart',
        priority: 200,
        icon: ArrowUp,
        title: 'Update Ready',
        description: `Sable ${updateInfo.version} has been downloaded. Restart the app to finish updating.`,
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

    return {
      id: 'desktop-update-available',
      priority: 200,
      icon: ArrowUp,
      title: 'Desktop Update Available',
      description: `Sable ${updateInfo.version} is available for installation.`,
      primaryAction: {
        label: isInstalling ? 'Installing...' : 'Install & Update',
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
    updateInfo,
    dismissed,
    isDownloaded,
    isInstalling,
    handleInstall,
    handleRestart,
    handleDismiss,
  ]);

  useRegisterGlobalBanner(bannerData);

  return null;
}
