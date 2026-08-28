import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUp } from '$components/icons/phosphor';
import { useRegisterGlobalBanner, type GlobalBanner } from '$state/globalBanners';
import { createLogger } from '$utils/debug';

const log = createLogger('WebUpdater');

export function WebUpdater() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleUpdate = (ev: Event) => {
      const customEv = ev as CustomEvent<{ registration: ServiceWorkerRegistration }>;
      if (customEv.detail?.registration) {
        log.log('Web update available via ServiceWorker');
        setRegistration(customEv.detail.registration);
      }
    };

    window.addEventListener('sable-sw-update-available', handleUpdate);
    return () => window.removeEventListener('sable-sw-update-available', handleUpdate);
  }, []);

  const handleRefresh = useCallback(() => {
    if (registration?.waiting) {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      registration.waiting.postMessage({ type: 'SKIP_WAITING_AND_CLAIM' });
    }
    window.location.reload();
  }, [registration]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const bannerData = useMemo<GlobalBanner | null>(() => {
    if (!registration || dismissed) return null;

    return {
      id: 'web-app-update',
      priority: 200, // Top priority for updates
      icon: ArrowUp,
      title: 'Update Available',
      description: 'A new version of Sable is available. Refresh to apply updates.',
      primaryAction: {
        label: 'Refresh',
        variant: 'Primary',
        onClick: handleRefresh,
      },
      secondaryAction: {
        label: 'Later',
        variant: 'Secondary',
        onClick: handleDismiss,
      },
    };
  }, [registration, dismissed, handleRefresh, handleDismiss]);

  useRegisterGlobalBanner(bannerData);

  return null;
}
